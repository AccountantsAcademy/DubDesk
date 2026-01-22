/**
 * FFmpeg Video Export
 * Combine video with dubbed audio for final export
 */

import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'

export interface ExportOptions {
  /** Video codec (default: copy for no re-encoding) */
  videoCodec?: 'copy' | 'libx264' | 'libx265' | 'vp9'
  /** Audio codec (default: aac) */
  audioCodec?: 'aac' | 'mp3' | 'opus' | 'copy'
  /** Video quality preset for x264/x265 (default: medium) */
  preset?:
    | 'ultrafast'
    | 'superfast'
    | 'veryfast'
    | 'faster'
    | 'fast'
    | 'medium'
    | 'slow'
    | 'slower'
    | 'veryslow'
  /** CRF value for quality (default: 23, lower = better, 0-51) */
  crf?: number
  /** Audio bitrate (default: 192k) */
  audioBitrate?: string
  /** Output format (default: mp4) */
  format?: 'mp4' | 'mkv' | 'webm' | 'mov'
  /** Video resolution (e.g., '1920x1080', null for original) */
  resolution?: string
  /** Include original audio track as well */
  keepOriginalAudio?: boolean
}

export interface ExportResult {
  outputPath: string
  durationMs: number
  fileSize: number
}

// Track active exports for cancellation
const activeExports = new Map<string, ffmpeg.FfmpegCommand>()

/**
 * Export video with dubbed audio
 */
export async function exportVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  options: ExportOptions = {},
  onProgress?: (progress: { percent: number; fps?: number; currentTime?: number }) => void,
  exportId?: string
): Promise<ExportResult> {
  // Verify inputs exist
  try {
    await stat(videoPath)
  } catch {
    throw new Error(`Video file not found: ${videoPath}`)
  }

  try {
    await stat(audioPath)
  } catch {
    throw new Error(`Audio file not found: ${audioPath}`)
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  const videoCodec = options.videoCodec || 'copy'
  const audioCodec = options.audioCodec || 'aac'
  const preset = options.preset || 'medium'
  const crf = options.crf ?? 23
  const audioBitrate = options.audioBitrate || '192k'
  const format = options.format || 'mp4'

  return new Promise((resolve, reject) => {
    let command = ffmpeg(videoPath).input(audioPath)

    // Map video from first input, audio from second
    command = command.outputOptions('-map', '0:v').outputOptions('-map', '1:a')

    // Optionally keep original audio as second track
    if (options.keepOriginalAudio) {
      command = command.outputOptions('-map', '0:a')
    }

    // Video codec settings
    if (videoCodec === 'copy') {
      command = command.videoCodec('copy')
    } else {
      command = command.videoCodec(videoCodec)

      if (videoCodec === 'libx264' || videoCodec === 'libx265') {
        command = command.outputOptions('-preset', preset).outputOptions('-crf', String(crf))
      }

      if (options.resolution) {
        command = command.size(options.resolution)
      }
    }

    // Audio codec settings
    if (audioCodec === 'copy') {
      command = command.audioCodec('copy')
    } else {
      command = command.audioCodec(audioCodec).audioBitrate(audioBitrate)
    }

    // Output format
    command = command.format(format)

    // Ensure good compatibility for MP4
    if (format === 'mp4') {
      command = command.outputOptions('-movflags', '+faststart')
    }

    let durationMs = 0

    // Track for cancellation
    if (exportId) {
      activeExports.set(exportId, command)
    }

    command
      .on('start', (cmdline) => {
        console.log('[FFmpeg:Export] Starting:', cmdline)
      })
      .on('codecData', (data) => {
        if (data.duration) {
          const parts = data.duration.split(':').map(Number)
          if (parts.length === 3) {
            durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
          }
        }
      })
      .on('progress', (progress) => {
        if (onProgress) {
          onProgress({
            percent: progress.percent || 0,
            fps: progress.currentFps,
            currentTime: progress.timemark ? parseTimemark(progress.timemark) : undefined
          })
        }
      })
      .on('end', async () => {
        console.log('[FFmpeg:Export] Complete:', outputPath)

        // Remove from active exports
        if (exportId) {
          activeExports.delete(exportId)
        }

        // Get file size
        let fileSize = 0
        try {
          const stats = await stat(outputPath)
          fileSize = stats.size
        } catch {
          // Ignore stat errors
        }

        resolve({
          outputPath,
          durationMs,
          fileSize
        })
      })
      .on('error', (err) => {
        console.error('[FFmpeg:Export] Error:', err)

        // Remove from active exports
        if (exportId) {
          activeExports.delete(exportId)
        }

        // Check if cancelled
        if (err.message.includes('SIGKILL')) {
          reject(new Error('Export cancelled'))
        } else {
          reject(new Error(`Video export failed: ${err.message}`))
        }
      })
      .save(outputPath)
  })
}

/**
 * Cancel an active export
 */
export function cancelExport(exportId: string): boolean {
  const command = activeExports.get(exportId)
  if (command) {
    command.kill('SIGKILL')
    activeExports.delete(exportId)
    return true
  }
  return false
}

/**
 * Replace audio in a video file (simpler than full export)
 */
export async function replaceAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  onProgress?: (percent: number) => void
): Promise<ExportResult> {
  return exportVideo(
    videoPath,
    audioPath,
    outputPath,
    {
      videoCodec: 'copy',
      audioCodec: 'aac'
    },
    (p) => onProgress?.(p.percent)
  )
}

/**
 * Parse FFmpeg timemark (HH:MM:SS.ms) to milliseconds
 */
function parseTimemark(timemark: string): number {
  const parts = timemark.split(':')
  if (parts.length !== 3) return 0

  const hours = Number.parseInt(parts[0], 10)
  const minutes = Number.parseInt(parts[1], 10)
  const seconds = Number.parseFloat(parts[2])

  return (hours * 3600 + minutes * 60 + seconds) * 1000
}

/**
 * Get available export formats
 */
export function getExportFormats(): Array<{
  id: string
  name: string
  extension: string
  videoCodecs: string[]
  audioCodecs: string[]
}> {
  return [
    {
      id: 'mp4',
      name: 'MP4 (H.264)',
      extension: 'mp4',
      videoCodecs: ['copy', 'libx264'],
      audioCodecs: ['aac', 'mp3']
    },
    {
      id: 'mp4-hevc',
      name: 'MP4 (H.265/HEVC)',
      extension: 'mp4',
      videoCodecs: ['libx265'],
      audioCodecs: ['aac']
    },
    {
      id: 'mkv',
      name: 'MKV (Matroska)',
      extension: 'mkv',
      videoCodecs: ['copy', 'libx264', 'libx265'],
      audioCodecs: ['aac', 'opus', 'mp3']
    },
    {
      id: 'webm',
      name: 'WebM',
      extension: 'webm',
      videoCodecs: ['vp9'],
      audioCodecs: ['opus']
    },
    {
      id: 'mov',
      name: 'QuickTime (MOV)',
      extension: 'mov',
      videoCodecs: ['copy', 'libx264'],
      audioCodecs: ['aac']
    }
  ]
}

/**
 * Get available quality presets
 */
export function getQualityPresets(): Array<{
  id: string
  name: string
  crf: number
  preset: string
}> {
  return [
    { id: 'best', name: 'Best Quality', crf: 18, preset: 'slow' },
    { id: 'high', name: 'High Quality', crf: 20, preset: 'medium' },
    { id: 'balanced', name: 'Balanced', crf: 23, preset: 'medium' },
    { id: 'small', name: 'Smaller File', crf: 26, preset: 'fast' },
    { id: 'smallest', name: 'Smallest File', crf: 30, preset: 'veryfast' }
  ]
}

export interface AudioExportOptions {
  /** Audio codec (default: aac) */
  audioCodec?: 'aac' | 'mp3' | 'wav' | 'flac'
  /** Audio bitrate for lossy formats (default: 192k) */
  audioBitrate?: string
  /** Sample rate (default: 44100) */
  sampleRate?: number
}

export interface AudioExportResult {
  outputPath: string
  durationMs: number
  fileSize: number
}

/**
 * Export audio only (no video)
 */
export async function exportAudioOnly(
  audioPath: string,
  outputPath: string,
  options: AudioExportOptions = {},
  onProgress?: (percent: number) => void,
  exportId?: string
): Promise<AudioExportResult> {
  // Verify input exists
  try {
    await stat(audioPath)
  } catch {
    throw new Error(`Audio file not found: ${audioPath}`)
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  const audioCodec = options.audioCodec || 'aac'
  const audioBitrate = options.audioBitrate || '192k'
  const sampleRate = options.sampleRate || 44100

  return new Promise((resolve, reject) => {
    let command = ffmpeg(audioPath)

    // Apply codec and settings
    switch (audioCodec) {
      case 'wav':
        command = command.audioCodec('pcm_s16le').format('wav')
        break
      case 'flac':
        command = command.audioCodec('flac').format('flac')
        break
      case 'mp3':
        command = command.audioCodec('libmp3lame').audioBitrate(audioBitrate).format('mp3')
        break
      default:
        command = command.audioCodec('aac').audioBitrate(audioBitrate).format('m4a')
        break
    }

    command = command.audioFrequency(sampleRate).audioChannels(2)

    let durationMs = 0

    // Track for cancellation
    if (exportId) {
      activeExports.set(exportId, command)
    }

    command
      .on('start', (cmdline) => {
        console.log('[FFmpeg:ExportAudio] Starting:', cmdline)
      })
      .on('codecData', (data) => {
        if (data.duration) {
          const parts = data.duration.split(':').map(Number)
          if (parts.length === 3) {
            durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
          }
        }
      })
      .on('progress', (progress) => {
        if (onProgress && progress.percent) {
          onProgress(progress.percent)
        }
      })
      .on('end', async () => {
        console.log('[FFmpeg:ExportAudio] Complete:', outputPath)

        if (exportId) {
          activeExports.delete(exportId)
        }

        let fileSize = 0
        try {
          const stats = await stat(outputPath)
          fileSize = stats.size
        } catch {
          // Ignore stat errors
        }

        resolve({
          outputPath,
          durationMs,
          fileSize
        })
      })
      .on('error', (err) => {
        console.error('[FFmpeg:ExportAudio] Error:', err)

        if (exportId) {
          activeExports.delete(exportId)
        }

        if (err.message.includes('SIGKILL')) {
          reject(new Error('Export cancelled'))
        } else {
          reject(new Error(`Audio export failed: ${err.message}`))
        }
      })
      .save(outputPath)
  })
}

/**
 * Get available audio export formats
 */
export function getAudioExportFormats(): Array<{
  id: string
  name: string
  extension: string
  codec: string
}> {
  return [
    { id: 'aac', name: 'AAC (M4A)', extension: 'm4a', codec: 'aac' },
    { id: 'mp3', name: 'MP3', extension: 'mp3', codec: 'mp3' },
    { id: 'wav', name: 'WAV (Uncompressed)', extension: 'wav', codec: 'wav' },
    { id: 'flac', name: 'FLAC (Lossless)', extension: 'flac', codec: 'flac' }
  ]
}
