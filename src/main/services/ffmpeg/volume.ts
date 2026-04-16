/**
 * FFmpeg Volume Analysis & Adjustment
 * Measure audio loudness and normalize volume levels
 */

import { spawn } from 'node:child_process'
import { rename } from 'node:fs/promises'
import { ffmpegPath } from './paths'

/**
 * Measure the mean volume of an audio file in dB using FFmpeg's volumedetect filter.
 * Returns the mean volume (e.g., -18.5 dB).
 */
export function measureMeanVolume(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const binPath = ffmpegPath
    if (!binPath) {
      reject(new Error('FFmpeg binary not found'))
      return
    }

    const proc = spawn(binPath, ['-i', audioPath, '-af', 'volumedetect', '-f', 'null', '-'])

    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg volumedetect failed (code ${code}): ${stderr.slice(-300)}`))
        return
      }
      // volumedetect outputs to stderr even on success
      const match = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/)
      if (match) {
        resolve(Number.parseFloat(match[1]))
      } else {
        reject(new Error('Could not parse mean_volume from FFmpeg output'))
      }
    })

    proc.on('error', reject)
  })
}

/**
 * Adjust the volume of an audio file by a given gain in dB.
 * Can write to the same path (uses a temp file internally).
 */
export async function adjustVolume(
  inputPath: string,
  outputPath: string,
  gainDb: number
): Promise<void> {
  const binPath = ffmpegPath
  if (!binPath) {
    throw new Error('FFmpeg binary not found')
  }

  const isSameFile = inputPath === outputPath
  const tempPath = isSameFile ? `${outputPath}.vol_adj.tmp.mp3` : outputPath

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(binPath, [
      '-i',
      inputPath,
      '-af',
      `volume=${gainDb.toFixed(2)}dB`,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-y',
      tempPath
    ])

    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg volume adjust failed (code ${code}): ${stderr.slice(-300)}`))
      } else {
        resolve()
      }
    })

    proc.on('error', reject)
  })

  if (isSameFile) {
    await rename(tempPath, outputPath)
  }
}

/**
 * Trim silence from the start and end of an audio file using the silenceremove filter.
 * Removes silence below -40dB from both ends.
 * Can write to the same path (uses a temp file internally).
 */
export async function trimSilence(inputPath: string, outputPath: string): Promise<void> {
  const binPath = ffmpegPath
  if (!binPath) {
    throw new Error('FFmpeg binary not found')
  }

  const isSameFile = inputPath === outputPath
  const tempPath = isSameFile ? `${outputPath}.trim_sil.tmp.mp3` : outputPath

  // silenceremove: start_periods=1 trims leading silence, stop_periods=-1 trims trailing silence
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(binPath, [
      '-i',
      inputPath,
      '-af',
      'silenceremove=start_periods=1:start_duration=0:start_threshold=-40dB:stop_periods=-1:stop_duration=0:stop_threshold=-40dB',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-y',
      tempPath
    ])

    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg silence trim failed (code ${code}): ${stderr.slice(-300)}`))
      } else {
        resolve()
      }
    })

    proc.on('error', reject)
  })

  if (isSameFile) {
    await rename(tempPath, outputPath)
  }

  console.log('[FFmpeg:Volume] Trimmed silence from start and end')
}

/**
 * Normalize the volume of a generated audio file to match a reference audio file.
 * Applies a -2 dB offset because TTS audio is perceptually louder than natural speech
 * at the same mean volume (cleaner signal, less dynamic range).
 * Only adjusts if the difference is > 0.5 dB.
 */
const TTS_LOUDNESS_OFFSET_DB = -2

export async function normalizeVolumeToReference(
  generatedAudioPath: string,
  referenceAudioPath: string,
  outputPath: string
): Promise<void> {
  const [generatedVolume, referenceVolume] = await Promise.all([
    measureMeanVolume(generatedAudioPath),
    measureMeanVolume(referenceAudioPath)
  ])

  const gainDb = referenceVolume - generatedVolume + TTS_LOUDNESS_OFFSET_DB

  console.log(
    `[FFmpeg:Volume] Generated: ${generatedVolume.toFixed(1)}dB, Reference: ${referenceVolume.toFixed(1)}dB, Gain: ${gainDb.toFixed(1)}dB (includes ${TTS_LOUDNESS_OFFSET_DB}dB offset)`
  )

  if (Math.abs(gainDb) <= 0.5) {
    console.log('[FFmpeg:Volume] Volumes close enough, skipping adjustment')
    return
  }

  await adjustVolume(generatedAudioPath, outputPath, gainDb)
  console.log(`[FFmpeg:Volume] Volume adjusted by ${gainDb.toFixed(1)}dB`)
}
