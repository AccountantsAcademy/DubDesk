/**
 * FFmpeg Audio Mixing
 * Splice dubbed audio segments with original audio (clean switching, no ducking)
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { mkdir, readdir, rmdir, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { ffmpegPath } from './paths'

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
  /** Minimum gap duration (ms) before using original audio. Gaps shorter than this will use silence. */
  minGapForOriginalMs?: number
}

export interface MixResult {
  outputPath: string
  durationMs: number
}

/** Threshold: use two-phase concat-demuxer when segment count exceeds this */
const CONCAT_DEMUXER_THRESHOLD = 50

interface OriginalPiece {
  type: 'original'
  startMs: number
  endMs: number
}
interface SegmentPiece {
  type: 'segment'
  audioPath: string
  volume: number
  startTimeMs: number
  endTimeMs: number
}
interface SilencePiece {
  type: 'silence'
  durationMs: number
}
type Piece = OriginalPiece | SegmentPiece | SilencePiece

/**
 * Run a single ffmpeg command via spawn. Returns a promise that resolves on exit code 0.
 */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('FFmpeg binary not found'))
      return
    }
    const proc = spawn(ffmpegPath, args)
    let stderr = ''
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`))
      } else {
        resolve()
      }
    })
    proc.on('error', reject)
  })
}

/**
 * Extract a single piece to a WAV file for the concat-demuxer approach.
 */
async function extractPiece(
  piece: Piece,
  originalAudioPath: string,
  outPath: string,
  sampleRate: number,
  originalVolume: number,
  dubbedVolume: number
): Promise<void> {
  if (piece.type === 'original') {
    const startSec = (piece.startMs / 1000).toFixed(3)
    const endSec = (piece.endMs / 1000).toFixed(3)
    await runFfmpeg([
      '-i',
      originalAudioPath,
      '-ss',
      startSec,
      '-to',
      endSec,
      '-af',
      `volume=${originalVolume}`,
      '-ar',
      String(sampleRate),
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
      '-y',
      outPath
    ])
  } else if (piece.type === 'silence') {
    const durationSec = (piece.durationMs / 1000).toFixed(3)
    await runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=${sampleRate}:cl=stereo`,
      '-t',
      durationSec,
      '-c:a',
      'pcm_s16le',
      '-y',
      outPath
    ])
  } else {
    const effectiveVolume = dubbedVolume * piece.volume
    const segDurSec = ((piece.endTimeMs - piece.startTimeMs) / 1000).toFixed(3)
    await runFfmpeg([
      '-i',
      piece.audioPath,
      '-af',
      `volume=${effectiveVolume},apad=whole_dur=${segDurSec},atrim=0:${segDurSec}`,
      '-ar',
      String(sampleRate),
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
      '-y',
      outPath
    ])
  }
}

/**
 * Concatenate piece WAV files using the concat demuxer (no command-line length issues).
 */
async function concatPieces(
  pieceFiles: string[],
  outputPath: string,
  format: 'wav' | 'mp3' | 'aac'
): Promise<void> {
  const listContent = pieceFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
  const listPath = path.join(path.dirname(pieceFiles[0]), 'concat-list.txt')
  writeFileSync(listPath, listContent, 'utf-8')

  const args = ['-f', 'concat', '-safe', '0', '-i', listPath]

  switch (format) {
    case 'wav':
      args.push('-c:a', 'pcm_s16le', '-f', 'wav')
      break
    case 'mp3':
      args.push('-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3')
      break
    case 'aac':
      args.push('-c:a', 'aac', '-b:a', '192k', '-f', 'm4a')
      break
  }

  args.push('-y', outputPath)
  await runFfmpeg(args)
}

/**
 * Run async tasks with limited concurrency.
 */
async function parallelLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++
      results[idx] = await tasks[idx]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/**
 * Two-phase concat-demuxer mix for large segment counts.
 * Phase 1: Extract each piece to an individual WAV (parallelized).
 * Phase 2: Concatenate all pieces via concat demuxer.
 */
async function mixAudioConcatDemuxer(
  originalAudioPath: string,
  pieces: Piece[],
  outputPath: string,
  options: MixOptions,
  totalDurationMs: number,
  onProgress?: (percent: number) => void
): Promise<MixResult> {
  const sampleRate = options.sampleRate ?? 44100
  const format = options.format ?? 'wav'
  const originalVolume = options.originalVolume ?? 0.3
  const dubbedVolume = options.dubbedVolume ?? 1.0
  const targetDurationMs = options.targetDurationMs

  // Create temp directory for piece files
  const tempDir = path.join(tmpdir(), `dubdesk-mix-${randomUUID()}`)
  await mkdir(tempDir, { recursive: true })

  const allPieces = [...pieces]

  // Add silence padding piece if target duration exceeds total
  if (targetDurationMs && targetDurationMs > totalDurationMs) {
    const padMs = targetDurationMs - totalDurationMs
    allPieces.push({ type: 'silence', durationMs: padMs })
    console.log(
      `[FFmpeg:Mix] Adding ${(padMs / 1000).toFixed(2)}s silence to reach target duration`
    )
  }

  const pieceFiles: string[] = allPieces.map((_, i) =>
    path.join(tempDir, `piece_${String(i).padStart(5, '0')}.wav`)
  )

  let completedCount = 0
  const totalCount = allPieces.length

  try {
    // Phase 1: Extract each piece in parallel (limit 8)
    console.log(`[FFmpeg:Mix] Phase 1: Extracting ${totalCount} pieces (concat-demuxer mode)`)
    const tasks = allPieces.map(
      (piece, i) => () =>
        extractPiece(
          piece,
          originalAudioPath,
          pieceFiles[i],
          sampleRate,
          originalVolume,
          dubbedVolume
        ).then(() => {
          completedCount++
          const pct = (completedCount / totalCount) * 90 // Reserve 10% for concat
          if (onProgress) onProgress(pct)
        })
    )
    await parallelLimit(tasks, 8)

    // Phase 2: Concatenate all pieces
    console.log(`[FFmpeg:Mix] Phase 2: Concatenating ${totalCount} pieces`)
    if (onProgress) onProgress(92)
    await concatPieces(pieceFiles, outputPath, format)
    if (onProgress) onProgress(100)

    console.log('[FFmpeg:Mix] Complete (concat-demuxer):', outputPath)
    // Approximate duration from pieces
    let durationMs = 0
    for (const piece of allPieces) {
      if (piece.type === 'original') durationMs += piece.endMs - piece.startMs
      else if (piece.type === 'silence') durationMs += piece.durationMs
      else durationMs += piece.endTimeMs - piece.startTimeMs
    }
    return { outputPath, durationMs }
  } finally {
    // Clean up temp directory
    try {
      const files = await readdir(tempDir)
      await Promise.all(files.map((f) => unlink(path.join(tempDir, f)).catch(() => {})))
      await rmdir(tempDir).catch(() => {})
    } catch {
      console.warn('[FFmpeg:Mix] Failed to clean up temp dir:', tempDir)
    }
  }
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
  const minGapMs = options.minGapForOriginalMs ?? 0 // 0 means always use original audio
  const pieces: Piece[] = []
  let currentMs = 0

  for (const segment of sortedSegments) {
    // Add gap before this segment (if any)
    if (segment.startTimeMs > currentMs) {
      const gapDurationMs = segment.startTimeMs - currentMs
      // Use silence for gaps shorter than minGapMs, otherwise use original audio
      if (minGapMs > 0 && gapDurationMs < minGapMs) {
        pieces.push({
          type: 'silence',
          durationMs: gapDurationMs
        })
      } else {
        pieces.push({
          type: 'original',
          startMs: currentMs,
          endMs: segment.startTimeMs
        })
      }
    }

    // Add the dubbed segment
    pieces.push({
      type: 'segment',
      audioPath: segment.audioPath,
      volume: segment.volume ?? 1,
      startTimeMs: segment.startTimeMs,
      endTimeMs: segment.endTimeMs
    })

    currentMs = segment.endTimeMs
  }

  // Add final gap after last segment (if any)
  // Always use original audio for the final gap (not silence)
  if (currentMs < totalDurationMs) {
    pieces.push({
      type: 'original',
      startMs: currentMs,
      endMs: totalDurationMs
    })
  }

  console.log(`[FFmpeg:Mix] Built ${pieces.length} pieces for concatenation`)

  // For many segments, use the two-phase concat-demuxer approach to avoid
  // ENAMETOOLONG from too many -i arguments on the command line
  if (segments.length > CONCAT_DEMUXER_THRESHOLD) {
    console.log(
      `[FFmpeg:Mix] Using concat-demuxer approach (${segments.length} segments > ${CONCAT_DEMUXER_THRESHOLD} threshold)`
    )
    return mixAudioConcatDemuxer(
      originalAudioPath,
      pieces,
      outputPath,
      options,
      totalDurationMs,
      onProgress
    )
  }

  // Standard single-command approach for smaller segment counts
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
      } else if (piece.type === 'silence') {
        // Generate silence for small gaps between segments
        const durationSec = piece.durationMs / 1000
        filters.push(
          `anullsrc=r=${sampleRate}:cl=stereo,atrim=0:${durationSec.toFixed(3)},asetpts=PTS-STARTPTS[${label}]`
        )
      } else {
        // Use segment audio with volume adjustment (dubbed volume * segment's individual volume)
        // Pad/trim to exact segment duration to prevent cumulative drift
        const inputNum = segmentInputs[segmentIdx]
        const effectiveVolume = dubbedVolume * piece.volume
        const segmentDurationSec = (piece.endTimeMs - piece.startTimeMs) / 1000
        filters.push(
          `[${inputNum}:a]volume=${effectiveVolume},apad=whole_dur=${segmentDurationSec.toFixed(3)},atrim=0:${segmentDurationSec.toFixed(3)},asetpts=PTS-STARTPTS[${label}]`
        )
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
      filters.push(
        `anullsrc=r=${sampleRate}:cl=stereo,atrim=0:${padDurationSec.toFixed(3)}[silence]`
      )
      // Concatenate the mixed audio with silence
      filters.push(`[concat_out][silence]concat=n=2:v=0:a=1[out]`)
      console.log(
        `[FFmpeg:Mix] Adding ${padDurationSec.toFixed(2)}s silence to reach target duration`
      )
    } else {
      filters.push(`${concatInputs.join('')}concat=n=${pieces.length}:v=0:a=1[out]`)
    }

    const filterString = filters.join(';')
    console.log(`[FFmpeg:Mix] Splice filter (${filters.length} filters, ${pieces.length} pieces)`)

    // Estimate total command line length: inputs (~85 chars each) + filter string + overhead
    const estimatedInputLength = inputIndex * 85
    const estimatedCmdLength = estimatedInputLength + filterString.length + 500
    const CMD_LIMIT = 28_000 // Safe threshold below Windows 32K limit

    let filterScriptPath: string | null = null

    const cleanupFilterScript = async (): Promise<void> => {
      if (filterScriptPath) {
        try {
          await unlink(filterScriptPath)
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    try {
      if (estimatedCmdLength > CMD_LIMIT) {
        // Write filter graph to temp file to avoid ENAMETOOLONG on Windows
        filterScriptPath = path.join(tmpdir(), `dubdesk-filter-${randomUUID()}.txt`)
        writeFileSync(filterScriptPath, filterString, 'utf-8')
        console.log(
          `[FFmpeg:Mix] Filter too long (${filterString.length} chars), using script:`,
          filterScriptPath
        )
        command = command
          .outputOptions('-filter_complex_script', filterScriptPath)
          .outputOptions('-map', '[out]')
      } else {
        command.complexFilter(filterString, ['out'])
      }

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
        .on('end', async () => {
          await cleanupFilterScript()
          console.log('[FFmpeg:Mix] Complete:', outputPath)
          resolve({ outputPath, durationMs })
        })
        .on('error', async (err) => {
          await cleanupFilterScript()
          console.error('[FFmpeg:Mix] Error:', err)
          reject(new Error(`Audio mixing failed: ${err.message}`))
        })
        .save(outputPath)
    } catch (err) {
      cleanupFilterScript().finally(() => {
        reject(err instanceof Error ? err : new Error(String(err)))
      })
    }
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
