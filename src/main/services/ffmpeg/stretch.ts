/**
 * FFmpeg Audio Time-Stretching
 * Adjusts audio duration to match a target length without changing pitch
 */

import { rename, unlink } from 'node:fs/promises'
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

/**
 * Get the duration of an audio file in milliseconds
 */
export function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe audio: ${err.message}`))
        return
      }
      const durationSeconds = metadata.format.duration || 0
      resolve(Math.round(durationSeconds * 1000))
    })
  })
}

/**
 * Build atempo filter chain for a given speed ratio
 * atempo filter only accepts values between 0.5 and 2.0, so we chain multiple filters
 * for more extreme adjustments
 */
function buildAtempoFilter(speedRatio: number): string {
  const filters: string[] = []

  // Clamp to reasonable bounds (0.25x to 4x)
  let ratio = Math.max(0.25, Math.min(4.0, speedRatio))

  // Chain atempo filters for ratios outside 0.5-2.0 range
  while (ratio < 0.5 || ratio > 2.0) {
    if (ratio < 0.5) {
      filters.push('atempo=0.5')
      ratio = ratio / 0.5
    } else if (ratio > 2.0) {
      filters.push('atempo=2.0')
      ratio = ratio / 2.0
    }
  }

  // Add final atempo filter
  filters.push(`atempo=${ratio.toFixed(6)}`)

  return filters.join(',')
}

export interface StretchAudioOptions {
  /** Target duration in milliseconds */
  targetDurationMs: number
  /** Preserve pitch while stretching (default: true) */
  preservePitch?: boolean
}

export interface StretchAudioResult {
  /** Path to the stretched audio file */
  outputPath: string
  /** Original duration in milliseconds */
  originalDurationMs: number
  /** Final duration in milliseconds */
  finalDurationMs: number
  /** Speed ratio applied */
  speedRatio: number
}

/**
 * Stretch or compress audio to match a target duration
 * Uses FFmpeg's atempo filter to change speed without affecting pitch
 *
 * @param inputPath Path to the input audio file
 * @param outputPath Path for the output audio file (can be same as input to replace)
 * @param options Stretch options including target duration
 * @returns Result with duration info
 */
export async function stretchAudioToDuration(
  inputPath: string,
  outputPath: string,
  options: StretchAudioOptions
): Promise<StretchAudioResult> {
  const { targetDurationMs } = options

  // Get original duration
  const originalDurationMs = await getAudioDuration(inputPath)

  // Calculate speed ratio (how much faster/slower we need to play)
  // If original is 2000ms and target is 4000ms, we need to slow down (ratio = 0.5)
  // If original is 4000ms and target is 2000ms, we need to speed up (ratio = 2.0)
  // Add 1% bias to prefer slightly shorter output (avoid overlapping next segment)
  const speedRatio = (originalDurationMs / targetDurationMs) * 1.01

  // If the ratio is very close to 1.0, skip processing
  if (Math.abs(speedRatio - 1.0) < 0.01) {
    return {
      outputPath: inputPath,
      originalDurationMs,
      finalDurationMs: originalDurationMs,
      speedRatio: 1.0
    }
  }

  // Check if speed ratio is within acceptable bounds
  if (speedRatio < 0.25 || speedRatio > 4.0) {
    console.warn(
      `[FFmpeg:Stretch] Speed ratio ${speedRatio.toFixed(2)} is extreme, audio quality may be affected`
    )
  }

  // Build the atempo filter chain
  const atempoFilter = buildAtempoFilter(speedRatio)

  console.log(
    `[FFmpeg:Stretch] Original: ${originalDurationMs}ms, Target: ${targetDurationMs}ms, Ratio: ${speedRatio.toFixed(3)}, Filter: ${atempoFilter}`
  )

  // Determine if we're writing to the same file
  const isSameFile = inputPath === outputPath
  const tempOutput = isSameFile ? `${outputPath}.stretched.tmp.mp3` : outputPath

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(atempoFilter)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('start', (cmd) => {
        console.log(`[FFmpeg:Stretch] Running: ${cmd}`)
      })
      .on('error', (err) => {
        console.error(`[FFmpeg:Stretch] Error:`, err)
        reject(new Error(`Failed to stretch audio: ${err.message}`))
      })
      .on('end', async () => {
        console.log(`[FFmpeg:Stretch] FFmpeg completed, verifying output...`)
        try {
          // Get final duration
          const finalDurationMs = await getAudioDuration(tempOutput)

          // If same file, replace original with stretched version
          if (isSameFile) {
            await unlink(inputPath)
            await rename(tempOutput, outputPath)
          }

          resolve({
            outputPath,
            originalDurationMs,
            finalDurationMs,
            speedRatio
          })
        } catch (err) {
          reject(err)
        }
      })
      .save(tempOutput)
  })
}
