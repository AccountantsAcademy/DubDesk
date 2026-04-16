/**
 * FFmpeg Video Export
 * Combine video with dubbed audio for final export
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { mkdir, readdir, rmdir, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { ffmpegPath } from './paths'

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
    try {
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
    } catch (err) {
      if (exportId) {
        activeExports.delete(exportId)
      }
      reject(err instanceof Error ? err : new Error(String(err)))
    }
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
    try {
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
    } catch (err) {
      if (exportId) {
        activeExports.delete(exportId)
      }
      reject(err instanceof Error ? err : new Error(String(err)))
    }
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

// ============================================
// Image Overlay Compositing
// ============================================

import type { ImageOverlay } from '@shared/types/overlay'

export interface OverlayExportSegment {
  imagePath: string
  startTimeSec: number
  endTimeSec: number
  x: number
  y: number
  width: number
  height: number
  opacity: number
}

/**
 * Build FFmpeg filter graph to composite image overlays onto video.
 * Each overlay image is scaled to the correct size and overlaid at the correct position
 * with a time-based enable expression.
 */
function buildOverlayFilterGraph(overlays: OverlayExportSegment[]): {
  filterComplex: string
  outputLabel: string
} {
  if (overlays.length === 0) {
    return { filterComplex: '', outputLabel: '[0:v]' }
  }

  const filters: string[] = []

  // Normalize video to display dimensions (square pixels).
  // The browser's <video>.videoWidth/Height returns display dimensions (SAR-corrected),
  // but FFmpeg decodes to coded dimensions which may differ. This ensures they match.
  filters.push('[0:v]scale=iw*sar:ih,setsar=1[base]')
  let lastLabel = 'base'

  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i]
    const imgIdx = i + 1 // input 0 is video, images start at 1
    const imgLabel = `img${i}`
    const outLabel = i === overlays.length - 1 ? 'outv' : `tmp${i}`

    // Scale the image to the target size and ensure rgba format for transparency
    filters.push(
      `[${imgIdx}:v]scale=${o.width}:${o.height},format=rgba${o.opacity < 1 ? `,colorchannelmixer=aa=${o.opacity.toFixed(2)}` : ''}[${imgLabel}]`
    )

    // Overlay with time-based enable
    const startSec = o.startTimeSec.toFixed(3)
    const endSec = o.endTimeSec.toFixed(3)
    filters.push(
      `[${lastLabel}][${imgLabel}]overlay=${o.x}:${o.y}:enable='between(t,${startSec},${endSec})'[${outLabel}]`
    )

    lastLabel = outLabel
  }

  return {
    filterComplex: filters.join(';'),
    outputLabel: `[${lastLabel}]`
  }
}

/**
 * Convert ImageOverlay fractional coordinates to absolute pixel coordinates for FFmpeg.
 */
function overlaysToExportSegments(
  overlays: ImageOverlay[],
  videoWidth: number,
  videoHeight: number
): OverlayExportSegment[] {
  return overlays
    .sort((a, b) => a.zIndex - b.zIndex) // lower z-index first
    .map((o) => ({
      imagePath: o.imagePath,
      startTimeSec: o.startTimeMs / 1000,
      endTimeSec: o.endTimeMs / 1000,
      x: Math.round(o.positionX * videoWidth),
      y: Math.round(o.positionY * videoHeight),
      width: Math.max(2, Math.round(o.widthFraction * videoWidth)),
      height: Math.max(2, Math.round(o.heightFraction * videoHeight)),
      opacity: o.opacity
    }))
}

/**
 * Export video with image overlays composited using FFmpeg filter graphs.
 * This always re-encodes the video stream since overlay filters cannot be used with stream copy.
 */
export async function exportVideoWithOverlays(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  overlays: ImageOverlay[],
  _videoWidth: number,
  _videoHeight: number,
  options: ExportOptions = {},
  onProgress?: (progress: { percent: number }) => void
): Promise<ExportResult> {
  // Verify inputs
  for (const filePath of [videoPath, audioPath]) {
    try {
      await stat(filePath)
    } catch {
      throw new Error(`File not found: ${filePath}`)
    }
  }

  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  // Probe video and compute DISPLAY dimensions (what the browser's <video> element shows).
  // Coded dimensions may differ from display dimensions when SAR ≠ 1:1.
  // The filter graph normalizes the video to display dims with scale=iw*sar:ih,setsar=1,
  // so overlay coordinates must be relative to display dimensions.
  const displayDims = await probeDisplayDimensions(videoPath)
  console.log(
    `[FFmpeg:OverlayExport] Display dimensions: ${displayDims.width}x${displayDims.height}`
  )

  for (const o of overlays) {
    console.log(
      `[FFmpeg:OverlayExport] Overlay "${o.originalFilename}": pos=(${o.positionX.toFixed(3)}, ${o.positionY.toFixed(3)}) size=(${o.widthFraction.toFixed(3)}, ${o.heightFraction.toFixed(3)})`
    )
  }

  const exportSegments = overlaysToExportSegments(overlays, displayDims.width, displayDims.height)

  for (const s of exportSegments) {
    console.log(
      `[FFmpeg:OverlayExport] Export segment: pos=(${s.x}, ${s.y}) size=(${s.width}x${s.height})`
    )
  }

  const { filterComplex, outputLabel } = buildOverlayFilterGraph(exportSegments)
  console.log(`[FFmpeg:OverlayExport] Filter: ${filterComplex}`)

  const format = options.format || 'mp4'
  const preset = options.preset || 'medium'
  const crf = options.crf ?? 23
  const audioBitrate = options.audioBitrate || '192k'

  // Build FFmpeg arguments
  const args: string[] = ['-i', videoPath]

  // Add each overlay image as an input
  for (const seg of exportSegments) {
    args.push('-i', seg.imagePath)
  }

  // Add mixed audio as input
  args.push('-i', audioPath)

  // Apply filter complex
  args.push('-filter_complex', filterComplex)

  // Map filtered video and audio
  args.push('-map', outputLabel)
  const audioInputIdx = 1 + exportSegments.length // audio is last input
  args.push('-map', `${audioInputIdx}:a`)

  // Video encoding (must re-encode with overlay filters)
  args.push('-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p')

  // Audio encoding
  args.push('-c:a', 'aac', '-b:a', audioBitrate)

  if (format === 'mp4') {
    args.push('-movflags', '+faststart')
  }

  args.push('-f', format, '-y', outputPath)

  console.log(`[FFmpeg:OverlayExport] Compositing ${overlays.length} image overlay(s)...`)

  await runFfmpegCmd(args)
  onProgress?.({ percent: 100 })

  // Get result info
  let fileSize = 0
  let durationMs = 0
  try {
    const stats = await stat(outputPath)
    fileSize = stats.size
  } catch {
    // Ignore
  }

  try {
    durationMs = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(outputPath, (err, metadata) => {
        if (err) return reject(err)
        resolve((metadata.format.duration || 0) * 1000)
      })
    })
  } catch {
    // Ignore
  }

  console.log(
    `[FFmpeg:OverlayExport] Complete: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`
  )

  return { outputPath, durationMs: Math.round(durationMs), fileSize }
}

// ============================================
// Video Splicing (Lip-sync clips into export)
// ============================================

export interface LipsyncSegment {
  lipsyncVideoPath: string
  startTimeMs: number
  endTimeMs: number
}

interface OriginalVideoPiece {
  type: 'original'
  startMs: number
  endMs: number
}

interface LipsyncVideoPiece {
  type: 'lipsync'
  videoPath: string
  startMs: number
  endMs: number
}

type VideoPiece = OriginalVideoPiece | LipsyncVideoPiece

interface VideoProperties {
  width: number
  height: number
  fps: number
}

/**
 * Probe video DISPLAY dimensions (accounting for non-square pixels / SAR).
 * This matches what the browser's <video>.videoWidth/Height returns.
 */
function probeDisplayDimensions(videoPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe video: ${err.message}`))
        return
      }
      const vs = metadata.streams.find((s) => s.codec_type === 'video')
      if (!vs) {
        reject(new Error('No video stream found'))
        return
      }

      const codedW = vs.width || 1920
      const codedH = vs.height || 1080

      // Parse SAR (sample aspect ratio) to compute display dimensions
      let sarNum = 1
      let sarDen = 1
      if (vs.sample_aspect_ratio && vs.sample_aspect_ratio !== '0:1') {
        const parts = vs.sample_aspect_ratio.split(':')
        if (parts.length === 2) {
          sarNum = Number.parseInt(parts[0], 10) || 1
          sarDen = Number.parseInt(parts[1], 10) || 1
        }
      }

      const displayW = Math.round(codedW * (sarNum / sarDen))
      const displayH = codedH

      console.log(
        `[FFmpeg:Probe] coded=${codedW}x${codedH} SAR=${sarNum}:${sarDen} display=${displayW}x${displayH}`
      )

      resolve({ width: displayW, height: displayH })
    })
  })
}

/**
 * Probe original video properties (resolution, fps)
 */
function probeVideoProperties(videoPath: string): Promise<VideoProperties> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to probe video: ${err.message}`))
        return
      }
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
      if (!videoStream) {
        reject(new Error('No video stream found'))
        return
      }

      let fps = 30
      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/')
        if (parts.length === 2) {
          const num = Number.parseInt(parts[0], 10)
          const den = Number.parseInt(parts[1], 10)
          if (den > 0) fps = num / den
        } else {
          fps = Number.parseFloat(videoStream.r_frame_rate) || 30
        }
      }

      resolve({
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
        fps
      })
    })
  })
}

/**
 * Run a single ffmpeg command via spawn. Returns a promise that resolves on exit code 0.
 */
function runFfmpegCmd(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('FFmpeg binary not found'))
      return
    }
    const proc = spawn(ffmpegPath, args)
    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => {
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
 * Extract a single video piece to an MP4 file, re-encoded to a common format.
 */
async function extractVideoPiece(
  piece: VideoPiece,
  originalVideoPath: string,
  outPath: string,
  props: VideoProperties
): Promise<void> {
  const scaleFilter = `scale=${props.width}:${props.height}:force_original_aspect_ratio=decrease,pad=${props.width}:${props.height}:-1:-1,fps=${props.fps.toFixed(3)}`

  if (piece.type === 'original') {
    const startSec = (piece.startMs / 1000).toFixed(3)
    const durationSec = ((piece.endMs - piece.startMs) / 1000).toFixed(3)
    await runFfmpegCmd([
      '-ss',
      startSec,
      '-t',
      durationSec,
      '-i',
      originalVideoPath,
      '-an',
      '-vf',
      scaleFilter,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-y',
      outPath
    ])
  } else {
    await runFfmpegCmd([
      '-i',
      piece.videoPath,
      '-an',
      '-vf',
      scaleFilter,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-y',
      outPath
    ])
  }
}

/**
 * Splice lip-synced video clips into the original video.
 * Uses a two-phase concat-demuxer approach that scales to 500+ segments:
 *   Phase 1: Extract each video piece (original gaps + lipsync clips) in parallel
 *   Phase 2: Concatenate via demuxer + mux with mixed audio
 */
export async function spliceVideo(
  originalVideoPath: string,
  lipsyncSegments: LipsyncSegment[],
  mixedAudioPath: string,
  outputPath: string,
  options: ExportOptions = {},
  onProgress?: (progress: { percent: number }) => void
): Promise<ExportResult> {
  // Verify inputs
  for (const filePath of [originalVideoPath, mixedAudioPath]) {
    try {
      await stat(filePath)
    } catch {
      throw new Error(`File not found: ${filePath}`)
    }
  }

  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  const format = options.format || 'mp4'
  const audioBitrate = options.audioBitrate || '192k'

  // Probe original video properties
  console.log('[FFmpeg:Splice] Probing video properties...')
  const props = await probeVideoProperties(originalVideoPath)
  console.log(`[FFmpeg:Splice] Video: ${props.width}x${props.height} @ ${props.fps.toFixed(2)}fps`)

  // Get total duration
  const totalDurationMs = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(originalVideoPath, (err, metadata) => {
      if (err) return reject(err)
      resolve((metadata.format.duration || 0) * 1000)
    })
  })

  // Sort lipsync segments by start time
  const sorted = [...lipsyncSegments].sort((a, b) => a.startTimeMs - b.startTimeMs)

  // Build video piece list
  const pieces: VideoPiece[] = []
  let currentMs = 0

  for (const seg of sorted) {
    if (seg.startTimeMs > currentMs) {
      pieces.push({ type: 'original', startMs: currentMs, endMs: seg.startTimeMs })
    }
    pieces.push({
      type: 'lipsync',
      videoPath: seg.lipsyncVideoPath,
      startMs: seg.startTimeMs,
      endMs: seg.endTimeMs
    })
    currentMs = seg.endTimeMs
  }

  if (currentMs < totalDurationMs) {
    pieces.push({ type: 'original', startMs: currentMs, endMs: totalDurationMs })
  }

  console.log(
    `[FFmpeg:Splice] Built ${pieces.length} video pieces (${sorted.length} lipsync clips)`
  )

  // Create temp directory
  const tempDir = path.join(tmpdir(), `dubdesk-splice-${randomUUID()}`)
  await mkdir(tempDir, { recursive: true })

  const pieceFiles = pieces.map((_, i) =>
    path.join(tempDir, `piece_${String(i).padStart(5, '0')}.mp4`)
  )

  let completedCount = 0
  const totalCount = pieces.length

  try {
    // Phase 1: Extract all video pieces in parallel
    console.log(`[FFmpeg:Splice] Phase 1: Extracting ${totalCount} video pieces`)
    const tasks = pieces.map(
      (piece, i) => () =>
        extractVideoPiece(piece, originalVideoPath, pieceFiles[i], props).then(() => {
          completedCount++
          const pct = (completedCount / totalCount) * 85
          onProgress?.({ percent: pct })
        })
    )
    await parallelLimit(tasks, 8)

    // Phase 2: Concatenate all pieces + mux with audio
    console.log(`[FFmpeg:Splice] Phase 2: Concatenating ${totalCount} pieces + muxing audio`)
    onProgress?.({ percent: 88 })

    const listContent = pieceFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
    const listPath = path.join(tempDir, 'concat-list.txt')
    writeFileSync(listPath, listContent, 'utf-8')

    const args = [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-i',
      mixedAudioPath,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      audioBitrate
    ]

    if (format === 'mp4') {
      args.push('-movflags', '+faststart')
    }

    args.push('-f', format, '-y', outputPath)

    await runFfmpegCmd(args)
    onProgress?.({ percent: 100 })

    // Get result info
    let fileSize = 0
    try {
      const stats = await stat(outputPath)
      fileSize = stats.size
    } catch {
      // Ignore
    }

    console.log(
      `[FFmpeg:Splice] Complete: ${outputPath} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`
    )

    return {
      outputPath,
      durationMs: Math.round(totalDurationMs),
      fileSize
    }
  } finally {
    // Cleanup temp directory
    try {
      const files = await readdir(tempDir)
      await Promise.all(files.map((f) => unlink(path.join(tempDir, f)).catch(() => {})))
      await rmdir(tempDir).catch(() => {})
    } catch {
      console.warn('[FFmpeg:Splice] Failed to clean up temp dir:', tempDir)
    }
  }
}
