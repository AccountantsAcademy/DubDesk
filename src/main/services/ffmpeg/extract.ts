/**
 * FFmpeg Audio Extraction
 * Extract audio tracks from video files
 */

import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'

export interface ExtractOptions {
  /** Output format (default: wav) */
  format?: 'wav' | 'mp3' | 'aac' | 'flac'
  /** Sample rate in Hz (default: 44100) */
  sampleRate?: number
  /** Number of audio channels (default: 2) */
  channels?: number
  /** Audio bitrate for lossy formats (default: 192k) */
  bitrate?: string
  /** Start time in seconds */
  startTime?: number
  /** Duration in seconds */
  duration?: number
}

export interface ExtractResult {
  outputPath: string
  duration: number // milliseconds
  sampleRate: number
  channels: number
}

/**
 * Extract audio from a video file
 */
export async function extractAudio(
  videoPath: string,
  outputPath: string,
  options: ExtractOptions = {},
  onProgress?: (percent: number) => void
): Promise<ExtractResult> {
  // Verify input exists
  try {
    await stat(videoPath)
  } catch {
    throw new Error(`Video file not found: ${videoPath}`)
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  const format = options.format || 'wav'
  const sampleRate = options.sampleRate || 44100
  const channels = options.channels || 2

  return new Promise((resolve, reject) => {
    let command = ffmpeg(videoPath).noVideo().audioFrequency(sampleRate).audioChannels(channels)

    // Apply format-specific settings
    switch (format) {
      case 'wav':
        command = command.audioCodec('pcm_s16le').format('wav')
        break
      case 'mp3':
        command = command
          .audioCodec('libmp3lame')
          .audioBitrate(options.bitrate || '192k')
          .format('mp3')
        break
      case 'aac':
        command = command
          .audioCodec('aac')
          .audioBitrate(options.bitrate || '192k')
          .format('m4a')
        break
      case 'flac':
        command = command.audioCodec('flac').format('flac')
        break
    }

    // Apply time constraints
    if (options.startTime !== undefined) {
      command = command.setStartTime(options.startTime)
    }
    if (options.duration !== undefined) {
      command = command.setDuration(options.duration)
    }

    let duration = 0

    command
      .on('start', (cmdline) => {
        console.log('[FFmpeg:Extract] Starting:', cmdline)
      })
      .on('codecData', (data) => {
        // Parse duration from codec data
        if (data.duration) {
          const parts = data.duration.split(':').map(Number)
          if (parts.length === 3) {
            duration = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
          }
        }
      })
      .on('progress', (progress) => {
        if (onProgress && progress.percent) {
          onProgress(progress.percent)
        }
      })
      .on('end', () => {
        console.log('[FFmpeg:Extract] Complete:', outputPath)
        resolve({
          outputPath,
          duration,
          sampleRate,
          channels
        })
      })
      .on('error', (err) => {
        console.error('[FFmpeg:Extract] Error:', err)
        reject(new Error(`Audio extraction failed: ${err.message}`))
      })
      .save(outputPath)
  })
}

/**
 * Extract a segment of audio
 */
export async function extractAudioSegment(
  audioPath: string,
  outputPath: string,
  startTimeMs: number,
  endTimeMs: number,
  options: Omit<ExtractOptions, 'startTime' | 'duration'> = {}
): Promise<ExtractResult> {
  const startTime = startTimeMs / 1000
  const duration = (endTimeMs - startTimeMs) / 1000

  return extractAudio(audioPath, outputPath, {
    ...options,
    startTime,
    duration
  })
}
