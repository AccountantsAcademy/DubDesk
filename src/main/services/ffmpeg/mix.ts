/**
 * FFmpeg Audio Mixing
 * Splice dubbed audio segments with original audio (clean switching, no ducking)
 */

import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'

/**
 * Get audio duration using ffprobe with timeout
 */
function getAudioDuration(audioPath: string, timeoutMs = 10000): Promise<number> {
  return new Promise((resolve) => {
    console.log('[FFmpeg:Mix] Getting duration for:', audioPath)
    const timeout = setTimeout(() => {
      console.warn('[FFmpeg:Mix] ffprobe timeout, using fallback')
      resolve(0)
    }, timeoutMs)

    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      clearTimeout(timeout)
      if (err) {
        console.warn('[FFmpeg:Mix] ffprobe error:', err.message)
        resolve(0)
        return
      }
      const durationSec = metadata.format?.duration || 0
      console.log('[FFmpeg:Mix] Duration:', durationSec, 'seconds')
      resolve(durationSec)
    })
  })
}

export interface AudioSegment {
  /** Path to the audio file */
  audioPath: string
  /** Start time in milliseconds */
  startTimeMs: number
  /** End time in milliseconds */
  endTimeMs: number
  /** Duration of the audio file in milliseconds */
  audioDurationMs?: number
  /** Volume level (0-1, default: 1) */
  volume?: number
}

export interface MixOptions {
  /** Output format (default: wav) */
  format?: 'wav' | 'mp3' | 'aac'
  /** Output sample rate (default: 44100) */
  sampleRate?: number
  /** Volume for original audio portions (0-1, default: 0.3) */
  originalVolume?: number
  /** Volume for dubbed audio segments (0-1, default: 1.0) */
  dubbedVolume?: number
  /** Target duration in milliseconds - output will be padded with silence if shorter */
  targetDurationMs?: number
}

export interface MixResult {
  outputPath: string
  durationMs: number
}

/**
 * Mix dubbed audio segments with original audio using splice approach
 * Cleanly switches between original audio (in gaps) and dubbed audio (in segments)
 */
export async function mixAudio(
  originalAudioPath: string,
  segments: AudioSegment[],
  outputPath: string,
  options: MixOptions = {},
  onProgress?: (percent: number) => void
): Promise<MixResult> {
  // Verify original audio exists
  try {
    await stat(originalAudioPath)
  } catch {
    throw new Error(`Original audio file not found: ${originalAudioPath}`)
  }

  // Verify all segment audio files exist
  for (const segment of segments) {
    try {
      await stat(segment.audioPath)
    } catch {
      throw new Error(`Segment audio file not found: ${segment.audioPath}`)
    }
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  const sampleRate = options.sampleRate ?? 44100
  const format = options.format ?? 'wav'
  const originalVolume = options.originalVolume ?? 0.3
  const dubbedVolume = options.dubbedVolume ?? 1.0

  console.log('[FFmpeg:Mix] Starting mix with', segments.length, 'segments')
  console.log('[FFmpeg:Mix] Original audio:', originalAudioPath)
  console.log('[FFmpeg:Mix] Output:', outputPath)
  console.log('[FFmpeg:Mix] Original volume:', originalVolume, 'Dubbed volume:', dubbedVolume)

  // Sort segments by start time
  const sortedSegments = [...segments].sort((a, b) => a.startTimeMs - b.startTimeMs)

  // Get original audio duration
  const totalDurationSec = await getAudioDuration(originalAudioPath)
  const totalDurationMs = totalDurationSec * 1000

  console.log(`[FFmpeg:Mix] Splicing ${sortedSegments.length} segments into original audio`)

  // Build list of pieces to concatenate: [gap, segment, gap, segment, ...]
  interface OriginalPiece {
    type: 'original'
    startMs: number
    endMs: number
  }
  interface SegmentPiece {
    type: 'segment'
    audioPath: string
    volume: number
  }
  type Piece = OriginalPiece | SegmentPiece

  const pieces: Piece[] = []
  let currentMs = 0

  for (const segment of sortedSegments) {
    // Add gap before this segment (if any)
    if (segment.startTimeMs > currentMs) {
      pieces.push({
        type: 'original',
        startMs: currentMs,
        endMs: segment.startTimeMs
      })
    }

    // Add the dubbed segment
    pieces.push({
      type: 'segment',
      audioPath: segment.audioPath,
      volume: segment.volume ?? 1
    })

    currentMs = segment.endTimeMs
  }

  // Add final gap after last segment (if any)
  if (currentMs < totalDurationMs) {
    pieces.push({
      type: 'original',
      startMs: currentMs,
      endMs: totalDurationMs
    })
  }

  console.log(`[FFmpeg:Mix] Built ${pieces.length} pieces for concatenation`)

  // Build FFmpeg filter to extract and concatenate all pieces
  return new Promise((resolve, reject) => {
    let command = ffmpeg(originalAudioPath)

    // Add all segment audio files as additional inputs
    const segmentInputs: number[] = []
    let inputIndex = 1 // 0 is original audio

    for (const piece of pieces) {
      if (piece.type === 'segment') {
        command = command.input(piece.audioPath)
        segmentInputs.push(inputIndex)
        inputIndex++
      }
    }

    // Build filter graph
    const filters: string[] = []
    const concatInputs: string[] = []
    let segmentIdx = 0
    let pieceIdx = 0

    for (const piece of pieces) {
      const label = `p${pieceIdx}`

      if (piece.type === 'original') {
        // Extract portion of original audio with volume adjustment
        const startSec = piece.startMs / 1000
        const endSec = piece.endMs / 1000
        filters.push(
          `[0:a]atrim=start=${startSec.toFixed(3)}:end=${endSec.toFixed(3)},volume=${originalVolume},asetpts=PTS-STARTPTS[${label}]`
        )
      } else {
        // Use segment audio with volume adjustment (dubbed volume * segment's individual volume)
        const inputNum = segmentInputs[segmentIdx]
        const effectiveVolume = dubbedVolume * piece.volume
        filters.push(`[${inputNum}:a]volume=${effectiveVolume},asetpts=PTS-STARTPTS[${label}]`)
        segmentIdx++
      }

      concatInputs.push(`[${label}]`)
      pieceIdx++
    }

    // Concatenate all pieces
    const targetDurationMs = options.targetDurationMs
    if (targetDurationMs && targetDurationMs > totalDurationMs) {
      // Need to pad with silence at the end
      filters.push(`${concatInputs.join('')}concat=n=${pieces.length}:v=0:a=1[concat_out]`)
      // Generate silence for the padding duration
      const padDurationSec = (targetDurationMs - totalDurationMs) / 1000
      filters.push(`anullsrc=r=${sampleRate}:cl=stereo,atrim=0:${padDurationSec.toFixed(3)}[silence]`)
      // Concatenate the mixed audio with silence
      filters.push(`[concat_out][silence]concat=n=2:v=0:a=1[out]`)
      console.log(`[FFmpeg:Mix] Adding ${padDurationSec.toFixed(2)}s silence to reach target duration`)
    } else {
      filters.push(`${concatInputs.join('')}concat=n=${pieces.length}:v=0:a=1[out]`)
    }

    const filterString = filters.join(';')
    console.log(`[FFmpeg:Mix] Splice filter (${filters.length} filters, ${pieces.length} pieces)`)

    command.complexFilter(filterString, ['out']).audioFrequency(sampleRate).audioChannels(2)

    switch (format) {
      case 'wav':
        command = command.audioCodec('pcm_s16le').format('wav')
        break
      case 'mp3':
        command = command.audioCodec('libmp3lame').audioBitrate('192k').format('mp3')
        break
      case 'aac':
        command = command.audioCodec('aac').audioBitrate('192k').format('m4a')
        break
    }

    let durationMs = 0
    let lastProgressPercent = 0

    command
      .on('start', (cmdline) => {
        console.log('[FFmpeg:Mix] Command:', `${cmdline.substring(0, 500)}...`)
      })
      .on('stderr', (line) => {
        if (line.includes('Error') || line.includes('error')) {
          console.error('[FFmpeg:Mix] stderr:', line)
        }
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
        const percent = progress.percent || 0
        if (percent - lastProgressPercent >= 10) {
          console.log(`[FFmpeg:Mix] Progress: ${percent.toFixed(1)}%`)
          lastProgressPercent = percent
        }
        if (onProgress && percent > 0) {
          onProgress(percent)
        }
      })
      .on('end', () => {
        console.log('[FFmpeg:Mix] Complete:', outputPath)
        resolve({ outputPath, durationMs })
      })
      .on('error', (err) => {
        console.error('[FFmpeg:Mix] Error:', err)
        reject(new Error(`Audio mixing failed: ${err.message}`))
      })
      .save(outputPath)
  })
}

/**
 * Concatenate multiple audio files
 */
export async function concatenateAudio(
  audioPaths: string[],
  outputPath: string,
  options: { format?: 'wav' | 'mp3' | 'aac'; sampleRate?: number } = {}
): Promise<MixResult> {
  if (audioPaths.length === 0) {
    throw new Error('No audio files to concatenate')
  }

  // Verify all files exist
  for (const audioPath of audioPaths) {
    try {
      await stat(audioPath)
    } catch {
      throw new Error(`Audio file not found: ${audioPath}`)
    }
  }

  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  const format = options.format ?? 'wav'
  const sampleRate = options.sampleRate ?? 44100

  return new Promise((resolve, reject) => {
    let command = ffmpeg()

    // Add all input files
    for (const audioPath of audioPaths) {
      command = command.input(audioPath)
    }

    // Build concat filter
    const inputLabels = audioPaths.map((_, i) => `[${i}:a]`).join('')
    command = command.complexFilter(`${inputLabels}concat=n=${audioPaths.length}:v=0:a=1[out]`, [
      'out'
    ])

    command.audioFrequency(sampleRate).audioChannels(2)

    switch (format) {
      case 'wav':
        command = command.audioCodec('pcm_s16le').format('wav')
        break
      case 'mp3':
        command = command.audioCodec('libmp3lame').audioBitrate('192k').format('mp3')
        break
      case 'aac':
        command = command.audioCodec('aac').audioBitrate('192k').format('m4a')
        break
    }

    let durationMs = 0

    command
      .on('codecData', (data) => {
        if (data.duration) {
          const parts = data.duration.split(':').map(Number)
          if (parts.length === 3) {
            durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
          }
        }
      })
      .on('end', () => {
        resolve({ outputPath, durationMs })
      })
      .on('error', (err) => {
        reject(new Error(`Audio concatenation failed: ${err.message}`))
      })
      .save(outputPath)
  })
}
