/**
 * Waveform Extraction Service
 * Extracts audio peaks from media files for waveform visualization
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ffmpegStaticRaw from 'ffmpeg-static'
import ffprobeStaticRaw from 'ffprobe-static'

// Fix asar path for packaged Electron apps (binaries are in app.asar.unpacked)
const ffmpegStatic = ffmpegStaticRaw?.replace('app.asar', 'app.asar.unpacked') ?? null
const ffprobeStatic = ffprobeStaticRaw?.path
  ? { path: ffprobeStaticRaw.path.replace('app.asar', 'app.asar.unpacked') }
  : null

export interface WaveformData {
  peaks: number[] // Normalized peaks (0-1 range)
  samplesPerSecond: number
  durationMs: number
}

/**
 * Extract waveform peaks from a media file
 * Uses FFmpeg to extract audio and calculate peaks at a fixed sample rate
 */
export async function extractWaveform(
  mediaPath: string,
  samplesPerSecond = 100 // 100 samples per second = good for visualization
): Promise<WaveformData> {
  if (!ffmpegStatic) {
    throw new Error('FFmpeg not available')
  }

  // First get the duration
  const duration = await getMediaDuration(mediaPath)
  const durationMs = duration * 1000

  // Use FFmpeg to extract audio peaks using the volumedetect approach
  // We'll extract downsampled audio and calculate peaks ourselves
  const peaks = await extractPeaksFromAudio(mediaPath, samplesPerSecond)

  return {
    peaks,
    samplesPerSecond,
    durationMs
  }
}

/**
 * Get media duration using ffprobe
 */
function getMediaDuration(mediaPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!ffprobeStatic?.path) {
      reject(new Error('FFprobe not available'))
      return
    }

    const proc = spawn(ffprobeStatic.path, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      mediaPath
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed: ${stderr}`))
        return
      }

      const duration = parseFloat(stdout.trim())
      if (Number.isNaN(duration)) {
        reject(new Error('Could not parse duration'))
        return
      }

      resolve(duration)
    })

    proc.on('error', reject)
  })
}

/**
 * Extract peaks by reading raw audio data
 * Uses FFmpeg to output raw PCM data and calculates peaks from it
 */
function extractPeaksFromAudio(mediaPath: string, samplesPerSecond: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) {
      reject(new Error('FFmpeg not available'))
      return
    }

    // Calculate the sample rate needed for our desired resolution
    // We want samplesPerSecond peaks, so we need to read audio and chunk it
    const outputSampleRate = 8000 // Low sample rate is fine for peaks
    const samplesPerChunk = Math.floor(outputSampleRate / samplesPerSecond)

    const proc = spawn(ffmpegStatic, [
      '-i',
      mediaPath,
      '-vn', // No video
      '-ac',
      '1', // Mono
      '-ar',
      outputSampleRate.toString(), // Low sample rate
      '-f',
      's16le', // Raw 16-bit signed little-endian
      '-acodec',
      'pcm_s16le',
      'pipe:1' // Output to stdout
    ])

    const chunks: Buffer[] = []
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      chunks.push(data)
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0 && chunks.length === 0) {
        reject(new Error(`FFmpeg failed: ${stderr}`))
        return
      }

      try {
        // Combine all chunks
        const audioData = Buffer.concat(chunks)

        // Calculate peaks from raw audio data
        const peaks = calculatePeaks(audioData, samplesPerChunk)
        resolve(peaks)
      } catch (err) {
        reject(err)
      }
    })

    proc.on('error', reject)
  })
}

/**
 * Calculate peaks from raw 16-bit PCM audio data
 */
function calculatePeaks(audioBuffer: Buffer, samplesPerChunk: number): number[] {
  const bytesPerSample = 2 // 16-bit = 2 bytes
  const totalSamples = Math.floor(audioBuffer.length / bytesPerSample)
  const numPeaks = Math.ceil(totalSamples / samplesPerChunk)

  const peaks: number[] = []

  for (let i = 0; i < numPeaks; i++) {
    const startSample = i * samplesPerChunk
    const endSample = Math.min(startSample + samplesPerChunk, totalSamples)

    let maxAbs = 0

    for (let j = startSample; j < endSample; j++) {
      const offset = j * bytesPerSample
      if (offset + 1 < audioBuffer.length) {
        // Read 16-bit signed integer (little-endian)
        const sample = audioBuffer.readInt16LE(offset)
        const absValue = Math.abs(sample)
        if (absValue > maxAbs) {
          maxAbs = absValue
        }
      }
    }

    // Normalize to 0-1 range (16-bit max is 32767)
    peaks.push(maxAbs / 32767)
  }

  return peaks
}

/**
 * Save waveform data to a cache file
 */
export async function saveWaveformCache(
  projectDir: string,
  waveformData: WaveformData
): Promise<string> {
  // Ensure the project directory exists
  await fs.promises.mkdir(projectDir, { recursive: true })

  const cachePath = path.join(projectDir, 'waveform.json')
  await fs.promises.writeFile(cachePath, JSON.stringify(waveformData))
  return cachePath
}

/**
 * Load waveform data from cache file
 */
export async function loadWaveformCache(projectDir: string): Promise<WaveformData | null> {
  const cachePath = path.join(projectDir, 'waveform.json')
  try {
    const data = await fs.promises.readFile(cachePath, 'utf-8')
    return JSON.parse(data) as WaveformData
  } catch {
    return null
  }
}
