/**
 * FFmpeg Path Resolution
 * Centralized path resolution for ffmpeg and ffprobe binaries.
 * Handles asar unpacking for packaged Electron apps.
 */

import { existsSync } from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import ffmpeg from 'fluent-ffmpeg'

function resolveAsarPath(rawPath: string | null | undefined): string | null {
  if (!rawPath) return null
  const unpacked = rawPath.replace('app.asar', 'app.asar.unpacked')
  if (existsSync(unpacked)) return unpacked
  if (existsSync(rawPath)) return rawPath
  // Return unpacked path anyway (may work at runtime even if not found at startup)
  return unpacked
}

export const ffmpegPath = resolveAsarPath(ffmpegStatic)
export const ffprobePath = resolveAsarPath(ffprobeStatic?.path)

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath)
  console.log('[FFmpeg:Paths] ffmpeg:', ffmpegPath)
} else {
  console.warn('[FFmpeg:Paths] ffmpeg binary not found')
}

if (ffprobePath) {
  ffmpeg.setFfprobePath(ffprobePath)
  console.log('[FFmpeg:Paths] ffprobe:', ffprobePath)
} else {
  console.warn('[FFmpeg:Paths] ffprobe binary not found')
}
