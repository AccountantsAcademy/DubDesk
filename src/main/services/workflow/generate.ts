/**
 * TTS Generation Workflow
 * Orchestrates: Load segments → Generate TTS → Update segments
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { hashText } from '@shared/utils/hash'
import { app } from 'electron'
import { segmentRepository, speakerRepository } from '../database/repositories'
import { generateSpeech, type TTSOptions } from '../elevenlabs'
import { stretchAudioToDuration } from '../ffmpeg'
import { setWorkflowState, type WorkflowProgress } from './index'

export interface GenerateWorkflowOptions {
  /** Project ID */
  projectId: string
  /** Default voice ID to use */
  defaultVoiceId: string
  /** TTS model to use */
  modelId?: string
  /** Voice stability (0-1) */
  stability?: number
  /** Voice similarity boost (0-1) */
  similarityBoost?: number
  /** Regenerate existing audio */
  regenerate?: boolean
}

export interface GenerateWorkflowResult {
  /** Number of segments generated */
  generatedCount: number
  /** Number of segments skipped */
  skippedCount: number
  /** Number of segments that failed */
  failedCount: number
  /** IDs of failed segments */
  failedSegmentIds: string[]
}

/**
 * Run the TTS generation workflow
 * 1. Load segments with translations
 * 2. Generate TTS for each segment
 * 3. Update segments with audio paths
 */
export async function runGenerateWorkflow(
  options: GenerateWorkflowOptions,
  onProgress?: (progress: WorkflowProgress) => void
): Promise<GenerateWorkflowResult> {
  const { projectId, defaultVoiceId, modelId, stability, similarityBoost, regenerate } = options

  setWorkflowState(projectId, {
    stage: 'generating',
    progress: 0,
    startedAt: new Date()
  })

  try {
    // Step 1: Load segments
    onProgress?.({
      stage: 'generating',
      progress: 0,
      message: 'Loading segments...'
    })

    const allSegments = segmentRepository.findByProject(projectId)
    const speakers = speakerRepository.findByProject(projectId)
    const speakerVoiceMap = new Map(
      speakers.filter((s) => s.defaultVoiceId).map((s) => [s.id, s.defaultVoiceId])
    )

    // Filter segments that have translations and need audio generation
    const segmentsToGenerate = allSegments.filter((s) => {
      if (!s.translatedText) return false
      if (regenerate) return true
      return !s.audioFilePath || s.status === 'error'
    })

    if (segmentsToGenerate.length === 0) {
      onProgress?.({
        stage: 'generating',
        progress: 100,
        message: 'All segments already have audio'
      })

      setWorkflowState(projectId, {
        stage: 'idle',
        progress: 100,
        completedAt: new Date()
      })

      return {
        generatedCount: 0,
        skippedCount: allSegments.length,
        failedCount: 0,
        failedSegmentIds: []
      }
    }

    // Step 2: Prepare output directory
    const projectDir = path.join(app.getPath('userData'), 'projects', projectId)
    const audioDir = path.join(projectDir, 'tts')
    await mkdir(audioDir, { recursive: true })

    // Step 3: Generate TTS for each segment
    let generatedCount = 0
    let failedCount = 0
    const failedSegmentIds: string[] = []

    for (let i = 0; i < segmentsToGenerate.length; i++) {
      const segment = segmentsToGenerate[i]

      onProgress?.({
        stage: 'generating',
        progress: (i / segmentsToGenerate.length) * 100,
        message: `Generating audio ${i + 1}/${segmentsToGenerate.length}...`,
        segmentId: segment.id
      })

      // Mark segment as generating
      segmentRepository.update(segment.id, {
        status: 'generating'
      })

      try {
        // Determine voice to use
        const voiceId =
          segment.voiceId ||
          (segment.speakerId ? speakerVoiceMap.get(segment.speakerId) : undefined) ||
          defaultVoiceId

        const outputPath = path.join(audioDir, `${segment.id}.mp3`)

        // Calculate target segment duration
        const targetDurationMs = segment.endTimeMs - segment.startTimeMs

        const ttsOptions: TTSOptions = {
          voiceId,
          modelId: modelId || 'eleven_multilingual_v2',
          stability: stability ?? 0.5,
          similarityBoost: similarityBoost ?? 0.75,
          outputFormat: 'mp3_44100_128'
        }

        const result = await generateSpeech(segment.translatedText, outputPath, ttsOptions)

        // Stretch audio to match segment duration using FFmpeg
        let finalDurationMs = result.durationMs
        let speedRatio = 1.0
        if (targetDurationMs > 0) {
          const stretchResult = await stretchAudioToDuration(result.audioPath, result.audioPath, {
            targetDurationMs
          })
          finalDurationMs = stretchResult.finalDurationMs
          speedRatio = stretchResult.speedRatio
        }

        // Compute hash of the text that was used for generation
        const textHash = hashText(segment.translatedText)

        // Update segment with audio info using the dedicated method
        segmentRepository.updateAudio(segment.id, result.audioPath, finalDurationMs, textHash)
        segmentRepository.update(segment.id, {
          voiceId,
          audioGeneratedVoiceId: voiceId,
          speedAdjustment: speedRatio,
          status: 'ready',
          generationError: undefined
        })

        generatedCount++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Generation failed'

        segmentRepository.update(segment.id, {
          status: 'error',
          generationError: errorMessage
        })

        failedCount++
        failedSegmentIds.push(segment.id)

        console.error(`[GenerateWorkflow] Failed segment ${segment.id}:`, error)
      }
    }

    onProgress?.({
      stage: 'generating',
      progress: 100,
      message: `Generated ${generatedCount} audio files${failedCount > 0 ? `, ${failedCount} failed` : ''}`
    })

    setWorkflowState(projectId, {
      stage: 'idle',
      progress: 100,
      completedAt: new Date()
    })

    return {
      generatedCount,
      skippedCount: allSegments.length - segmentsToGenerate.length,
      failedCount,
      failedSegmentIds
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Generation failed'

    setWorkflowState(projectId, {
      stage: 'idle',
      progress: 0,
      error: errorMessage
    })

    onProgress?.({
      stage: 'generating',
      progress: 0,
      message: errorMessage,
      error: errorMessage
    })

    throw error
  }
}

/**
 * Generate TTS for a single segment
 */
export async function generateSingleSegment(
  segmentId: string,
  voiceId: string,
  options?: Partial<TTSOptions>
): Promise<{ audioPath: string; durationMs: number }> {
  const segment = segmentRepository.findById(segmentId)
  if (!segment) {
    throw new Error(`Segment not found: ${segmentId}`)
  }

  if (!segment.translatedText) {
    throw new Error('Segment has no translated text')
  }

  // Mark as generating
  segmentRepository.update(segmentId, {
    status: 'generating'
  })

  try {
    const projectDir = path.join(app.getPath('userData'), 'projects', segment.projectId)
    const audioDir = path.join(projectDir, 'tts')
    await mkdir(audioDir, { recursive: true })

    const outputPath = path.join(audioDir, `${segmentId}.mp3`)

    // Calculate target segment duration
    const targetDurationMs = segment.endTimeMs - segment.startTimeMs

    // Generate TTS audio
    const result = await generateSpeech(segment.translatedText, outputPath, {
      voiceId,
      modelId: options?.modelId || 'eleven_multilingual_v2',
      stability: options?.stability ?? 0.5,
      similarityBoost: options?.similarityBoost ?? 0.75,
      outputFormat: 'mp3_44100_128',
      ...options
    })

    // Stretch audio to match segment duration using FFmpeg
    let finalDurationMs = result.durationMs
    let speedRatio = 1.0
    if (targetDurationMs > 0) {
      try {
        console.log(
          `[GenerateSingle] Starting stretch: target=${targetDurationMs}ms, file=${result.audioPath}`
        )
        const stretchResult = await stretchAudioToDuration(result.audioPath, result.audioPath, {
          targetDurationMs
        })
        finalDurationMs = stretchResult.finalDurationMs
        speedRatio = stretchResult.speedRatio
        console.log(
          `[GenerateSingle] Stretched audio: original=${stretchResult.originalDurationMs}ms -> final=${finalDurationMs}ms (target: ${targetDurationMs}ms, ratio: ${stretchResult.speedRatio.toFixed(3)})`
        )
      } catch (stretchError) {
        console.error(`[GenerateSingle] Stretch failed:`, stretchError)
        // Fall back to original duration if stretch fails
      }
    }

    // Compute hash of the text that was used for generation
    const textHash = hashText(segment.translatedText)

    // Update segment with audio info and hash
    segmentRepository.updateAudio(segmentId, result.audioPath, finalDurationMs, textHash)
    segmentRepository.update(segmentId, {
      voiceId,
      audioGeneratedVoiceId: voiceId,
      speedAdjustment: speedRatio,
      status: 'ready',
      generationError: undefined
    })

    return {
      audioPath: result.audioPath,
      durationMs: finalDurationMs
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Generation failed'

    segmentRepository.update(segmentId, {
      status: 'error',
      generationError: errorMessage
    })

    throw error
  }
}
