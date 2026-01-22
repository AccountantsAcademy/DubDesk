/**
 * Transcription Workflow
 * Orchestrates: Extract audio → STT → Create segments
 */

import path from 'node:path'
import { app } from 'electron'
import { projectRepository, segmentRepository } from '../database/repositories'
import { type TranscribeOptions, transcribeAudio } from '../elevenlabs'
import { extractAudio } from '../ffmpeg'
import { setWorkflowState, type WorkflowProgress } from './index'

export interface TranscribeWorkflowOptions {
  /** Project ID */
  projectId: string
  /** Path to the video file */
  videoPath: string
  /** Source language code for transcription */
  sourceLanguage?: string
  /** Enable speaker diarization */
  diarize?: boolean
  /** Number of speakers (helps with diarization) */
  numSpeakers?: number
}

export interface TranscribeWorkflowResult {
  /** Path to extracted audio */
  audioPath: string
  /** Number of segments created */
  segmentCount: number
  /** Detected language (if auto-detected) */
  detectedLanguage?: string
}

/**
 * Run the transcription workflow
 * 1. Extract audio from video
 * 2. Transcribe audio using ElevenLabs STT
 * 3. Create segments in database
 */
export async function runTranscribeWorkflow(
  options: TranscribeWorkflowOptions,
  onProgress?: (progress: WorkflowProgress) => void
): Promise<TranscribeWorkflowResult> {
  const { projectId, videoPath, sourceLanguage, diarize, numSpeakers } = options

  setWorkflowState(projectId, {
    stage: 'transcribing',
    progress: 0,
    startedAt: new Date()
  })

  try {
    // Step 1: Extract audio from video
    onProgress?.({
      stage: 'transcribing',
      progress: 0,
      message: 'Extracting audio from video...'
    })

    const projectDir = path.join(app.getPath('userData'), 'projects', projectId)
    const audioPath = path.join(projectDir, 'audio', 'original.wav')

    await extractAudio(
      videoPath,
      audioPath,
      {
        format: 'wav',
        sampleRate: 16000, // Optimal for STT
        channels: 1
      },
      (percent) => {
        onProgress?.({
          stage: 'transcribing',
          progress: percent * 0.3, // 30% of total
          message: 'Extracting audio...'
        })
      }
    )

    // Step 2: Transcribe audio
    onProgress?.({
      stage: 'transcribing',
      progress: 30,
      message: 'Transcribing audio...'
    })

    const transcribeOptions: TranscribeOptions = {
      timestampsGranularity: 'word',
      tagAudioEvents: false
    }

    if (sourceLanguage) {
      transcribeOptions.languageCode = sourceLanguage
    }
    if (diarize) {
      transcribeOptions.diarize = true
      if (numSpeakers) {
        transcribeOptions.numSpeakers = numSpeakers
      }
    }

    const transcription = await transcribeAudio(audioPath, transcribeOptions)

    onProgress?.({
      stage: 'transcribing',
      progress: 80,
      message: 'Creating segments...'
    })

    // Step 3: Create segments in database
    // First, clear any existing segments for this project
    const existingSegments = segmentRepository.findByProject(projectId)
    for (const segment of existingSegments) {
      segmentRepository.delete(segment.id)
    }

    // Create new segments from transcription
    for (const segment of transcription.segments) {
      segmentRepository.create({
        projectId,
        originalText: segment.text,
        translatedText: '', // Will be filled during translation
        startTimeMs: segment.startTimeMs,
        endTimeMs: segment.endTimeMs
      })
    }

    // Update project with audio path
    projectRepository.update(projectId, {
      sourceAudioPath: audioPath
    })

    onProgress?.({
      stage: 'transcribing',
      progress: 100,
      message: 'Transcription complete'
    })

    setWorkflowState(projectId, {
      stage: 'idle',
      progress: 100,
      completedAt: new Date()
    })

    return {
      audioPath,
      segmentCount: transcription.segments.length,
      detectedLanguage: transcription.language_code
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Transcription failed'

    setWorkflowState(projectId, {
      stage: 'idle',
      progress: 0,
      error: errorMessage
    })

    onProgress?.({
      stage: 'transcribing',
      progress: 0,
      message: errorMessage,
      error: errorMessage
    })

    throw error
  }
}
