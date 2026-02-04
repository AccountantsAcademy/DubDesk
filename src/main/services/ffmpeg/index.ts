/**
 * FFmpeg Service
 * Main entry point for FFmpeg audio/video operations
 */

import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import ffmpeg from 'fluent-ffmpeg'

// Fix asar path for packaged Electron apps (binaries are in app.asar.unpacked)
const ffmpegPath = ffmpegStatic?.replace('app.asar', 'app.asar.unpacked')
const ffprobePath = ffprobeStatic?.path?.replace('app.asar', 'app.asar.unpacked')

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath)
}
if (ffprobePath) {
  ffmpeg.setFfprobePath(ffprobePath)
}

export * from './export'
export * from './extract'
export * from './mix'
export * from './stretch'
export * from './waveform'

export interface MediaInfo {
  format: {
    filename: string
    duration: number // seconds
    size: number // bytes
    bitRate: number
  }
  video?: {
    codec: string
    width: number
    height: number
    fps: number
    bitRate: number
  }
  audio?: {
    codec: string
    channels: number
    sampleRate: number
    bitRate: number
  }
}

/**
 * Probe a media file to get its metadata
 */
export function probeMedia(filePath: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe media: ${err.message}`))
        return
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio')

      const info: MediaInfo = {
        format: {
          filename: metadata.format.filename || filePath,
          duration: metadata.format.duration || 0,
          size: metadata.format.size || 0,
          bitRate: metadata.format.bit_rate || 0
        }
      }

      if (videoStream) {
        info.video = {
          codec: videoStream.codec_name || 'unknown',
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: parseFrameRate(videoStream.r_frame_rate),
          bitRate: videoStream.bit_rate ? Number.parseInt(String(videoStream.bit_rate), 10) : 0
        }
      }

      if (audioStream) {
        info.audio = {
          codec: audioStream.codec_name || 'unknown',
          channels: audioStream.channels || 0,
          sampleRate: audioStream.sample_rate
            ? Number.parseInt(String(audioStream.sample_rate), 10)
            : 0,
          bitRate: audioStream.bit_rate ? Number.parseInt(String(audioStream.bit_rate), 10) : 0
        }
      }

      resolve(info)
    })
  })
}

/**
 * Parse frame rate string (e.g., "30000/1001" -> 29.97)
 */
function parseFrameRate(rateStr: string | undefined): number {
  if (!rateStr) return 0
  const parts = rateStr.split('/')
  if (parts.length === 2) {
    const num = Number.parseInt(parts[0], 10)
    const den = Number.parseInt(parts[1], 10)
    return den > 0 ? num / den : 0
  }
  return Number.parseFloat(rateStr) || 0
}

/**
 * Get the FFmpeg command builder
 */
export function createFFmpegCommand(inputPath: string): ffmpeg.FfmpegCommand {
  return ffmpeg(inputPath)
}

/**
 * Check if FFmpeg is available
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err) => {
      resolve(!err)
    })
  })
}
