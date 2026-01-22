/**
 * Export Workflow
 * Orchestrates: Mix audio → Combine with video → Export
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { projectRepository, segmentRepository } from '../database/repositories'
import {
  type AudioExportOptions,
  type ExportOptions,
  exportAudioOnly,
  exportVideo
} from '../ffmpeg/export'
import { type AudioSegment, type MixOptions, mixAudio } from '../ffmpeg/mix'
import { setWorkflowState, type WorkflowProgress } from './index'

export type ExportMode = 'video' | 'audio-only'

export interface ExportWorkflowOptions {
  /** Project ID */
  projectId: string
  /** Output file path */
  outputPath: string
  /** Export mode: video with dubbed audio, or audio track only */
  mode?: ExportMode
  /** Video export options (used when mode is 'video') */
  exportOptions?: ExportOptions
  /** Audio export options (used when mode is 'audio-only') */
  audioExportOptions?: AudioExportOptions
  /** Audio mixing options */
  mixOptions?: MixOptions
}

export interface ExportWorkflowResult {
  /** Path to exported video */
  outputPath: string
  /** File size in bytes */
  fileSize: number
  /** Duration in milliseconds */
  durationMs: number
}

/**
 * Run the export workflow
 * 1. Load segments with audio
 * 2. Mix dubbed audio with original
 * 3. Combine with video and export (or export audio only)
 */
export async function runExportWorkflow(
  options: ExportWorkflowOptions,
  onProgress?: (progress: WorkflowProgress) => void
): Promise<ExportWorkflowResult> {
  const {
    projectId,
    outputPath,
    mode = 'video',
    exportOptions,
    audioExportOptions,
    mixOptions
  } = options

  setWorkflowState(projectId, {
    stage: 'exporting',
    progress: 0,
    startedAt: new Date()
  })

  try {
    // Step 1: Load project and segments
    onProgress?.({
      stage: 'exporting',
      progress: 0,
      message: 'Loading project data...'
    })

    const project = projectRepository.findById(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    // Video mode requires video file
    if (mode === 'video' && !project.sourceVideoPath) {
      throw new Error('Project has no video file')
    }

    if (!project.sourceAudioPath) {
      throw new Error('Project has no extracted audio. Run transcription first.')
    }

    const allSegments = segmentRepository.findByProject(projectId)

    // Filter segments that have audio
    const segmentsWithAudio = allSegments.filter((s) => s.audioFilePath && s.status === 'ready')

    if (segmentsWithAudio.length === 0) {
      throw new Error('No segments with generated audio. Run TTS generation first.')
    }

    // Step 2: Prepare audio segments for mixing
    onProgress?.({
      stage: 'exporting',
      progress: 5,
      message: 'Preparing audio segments...'
    })

    const audioSegments: AudioSegment[] = segmentsWithAudio.map((s) => ({
      audioPath: s.audioFilePath!,
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs,
      audioDurationMs: s.audioDurationMs,
      volume: 1
    }))

    // Step 3: Mix audio
    onProgress?.({
      stage: 'exporting',
      progress: 10,
      message: 'Mixing audio tracks...'
    })

    const projectDir = path.join(app.getPath('userData'), 'projects', projectId)
    const exportDir = path.join(projectDir, 'export')
    await mkdir(exportDir, { recursive: true })

    const mixedAudioPath = path.join(exportDir, 'mixed_audio.wav')

    // Use appropriate progress range based on mode
    const mixProgressRange = mode === 'audio-only' ? { start: 10, end: 80 } : { start: 10, end: 50 }

    // Get volume settings from project (with defaults)
    const originalVolume = project.settings?.originalAudioVolume ?? 0.3
    const dubbedVolume = project.settings?.dubbedAudioVolume ?? 1.0

    await mixAudio(
      project.sourceAudioPath,
      audioSegments,
      mixedAudioPath,
      {
        ...mixOptions,
        originalVolume,
        dubbedVolume,
        // Ensure output matches video duration exactly
        targetDurationMs: project.sourceVideoDurationMs
      },
      (percent) => {
        const progress =
          mixProgressRange.start + percent * ((mixProgressRange.end - mixProgressRange.start) / 100)
        onProgress?.({
          stage: 'exporting',
          progress,
          message: 'Mixing audio tracks...'
        })
      }
    )

    // Step 4: Export based on mode
    if (mode === 'audio-only') {
      // Audio-only export
      onProgress?.({
        stage: 'exporting',
        progress: 80,
        message: 'Encoding audio...'
      })

      const result = await exportAudioOnly(
        mixedAudioPath,
        outputPath,
        audioExportOptions || { audioCodec: 'aac', audioBitrate: '192k' },
        (percent) => {
          const progress = 80 + percent * 0.2 // 80-100%
          onProgress?.({
            stage: 'exporting',
            progress,
            message: `Encoding audio... ${Math.round(percent)}%`
          })
        },
        projectId
      )

      onProgress?.({
        stage: 'exporting',
        progress: 100,
        message: 'Export complete'
      })

      setWorkflowState(projectId, {
        stage: 'idle',
        progress: 100,
        completedAt: new Date()
      })

      return {
        outputPath: result.outputPath,
        fileSize: result.fileSize,
        durationMs: result.durationMs
      }
    }

    // Video export (default)
    onProgress?.({
      stage: 'exporting',
      progress: 50,
      message: 'Encoding video...'
    })

    const result = await exportVideo(
      project.sourceVideoPath!,
      mixedAudioPath,
      outputPath,
      exportOptions || { videoCodec: 'copy', audioCodec: 'aac' },
      (progress) => {
        const percent = 50 + progress.percent * 0.5 // 50-100%
        onProgress?.({
          stage: 'exporting',
          progress: percent,
          message: `Encoding video... ${Math.round(progress.percent)}%`
        })
      },
      projectId
    )

    onProgress?.({
      stage: 'exporting',
      progress: 100,
      message: 'Export complete'
    })

    setWorkflowState(projectId, {
      stage: 'idle',
      progress: 100,
      completedAt: new Date()
    })

    return {
      outputPath: result.outputPath,
      fileSize: result.fileSize,
      durationMs: result.durationMs
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Export failed'

    setWorkflowState(projectId, {
      stage: 'idle',
      progress: 0,
      error: errorMessage
    })

    onProgress?.({
      stage: 'exporting',
      progress: 0,
      message: errorMessage,
      error: errorMessage
    })

    throw error
  }
}

/**
 * Quick export with default settings
 */
export async function quickExport(
  projectId: string,
  outputPath: string,
  onProgress?: (progress: WorkflowProgress) => void
): Promise<ExportWorkflowResult> {
  return runExportWorkflow(
    {
      projectId,
      outputPath,
      exportOptions: {
        videoCodec: 'copy',
        audioCodec: 'aac',
        audioBitrate: '192k',
        format: 'mp4'
      },
      mixOptions: {}
    },
    onProgress
  )
}

/**
 * High quality export
 */
export async function highQualityExport(
  projectId: string,
  outputPath: string,
  onProgress?: (progress: WorkflowProgress) => void
): Promise<ExportWorkflowResult> {
  return runExportWorkflow(
    {
      projectId,
      outputPath,
      exportOptions: {
        videoCodec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '256k',
        preset: 'slow',
        crf: 18,
        format: 'mp4'
      },
      mixOptions: {
        format: 'wav',
        sampleRate: 48000
      }
    },
    onProgress
  )
}

/**
 * Export audio only (dubbed track)
 */
export async function audioOnlyExport(
  projectId: string,
  outputPath: string,
  options?: {
    audioCodec?: 'aac' | 'mp3' | 'wav' | 'flac'
    audioBitrate?: string
  },
  onProgress?: (progress: WorkflowProgress) => void
): Promise<ExportWorkflowResult> {
  return runExportWorkflow(
    {
      projectId,
      outputPath,
      mode: 'audio-only',
      audioExportOptions: {
        audioCodec: options?.audioCodec || 'aac',
        audioBitrate: options?.audioBitrate || '192k'
      },
      mixOptions: {}
    },
    onProgress
  )
}
