/**
 * File Import Service
 * Handles importing video and audio files, extracting metadata
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, dialog } from 'electron'

export interface VideoMetadata {
  duration: number // in milliseconds
  width: number
  height: number
  fps: number
  codec: string
  audioCodec?: string
  sampleRate?: number
}

export interface ImportedFile {
  path: string
  name: string
  size: number
  type: 'video' | 'audio'
  metadata: VideoMetadata
}

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac']

/**
 * Show file picker dialog for video files
 */
export async function showVideoFilePicker(parentWindow?: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(parentWindow || BrowserWindow.getFocusedWindow()!, {
    title: 'Select Video File',
    filters: [
      {
        name: 'Video Files',
        extensions: VIDEO_EXTENSIONS.map((e) => e.slice(1))
      },
      {
        name: 'All Files',
        extensions: ['*']
      }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Show file picker dialog for audio files
 */
export async function showAudioFilePicker(parentWindow?: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(parentWindow || BrowserWindow.getFocusedWindow()!, {
    title: 'Select Audio File',
    filters: [
      {
        name: 'Audio Files',
        extensions: AUDIO_EXTENSIONS.map((e) => e.slice(1))
      },
      {
        name: 'All Files',
        extensions: ['*']
      }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Show file picker dialog for CSV files
 */
export async function showCsvFilePicker(parentWindow?: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(parentWindow || BrowserWindow.getFocusedWindow()!, {
    title: 'Select CSV File',
    filters: [
      {
        name: 'CSV Files',
        extensions: ['csv']
      },
      {
        name: 'All Files',
        extensions: ['*']
      }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Show directory picker for export
 */
export async function showDirectoryPicker(
  parentWindow?: BrowserWindow,
  title = 'Select Output Directory'
): Promise<string | null> {
  const result = await dialog.showOpenDialog(parentWindow || BrowserWindow.getFocusedWindow()!, {
    title,
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Show save dialog for file export
 */
export async function showSaveDialog(
  parentWindow?: BrowserWindow,
  defaultName = 'export',
  filters?: Electron.FileFilter[]
): Promise<string | null> {
  const result = await dialog.showSaveDialog(parentWindow || BrowserWindow.getFocusedWindow()!, {
    title: 'Save File',
    defaultPath: defaultName,
    filters: filters || [
      {
        name: 'Video Files',
        extensions: ['mp4', 'mov', 'mkv']
      }
    ]
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath
}

/**
 * Get video/audio metadata using ffprobe
 */
export async function getMediaMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath]

    const ffprobe = spawn('ffprobe', args)
    let stdout = ''
    let stderr = ''

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`))
        return
      }

      try {
        const data = JSON.parse(stdout)
        const videoStream = data.streams?.find(
          (s: { codec_type: string }) => s.codec_type === 'video'
        )
        const audioStream = data.streams?.find(
          (s: { codec_type: string }) => s.codec_type === 'audio'
        )
        const format = data.format

        const metadata: VideoMetadata = {
          duration: Math.round(parseFloat(format?.duration || '0') * 1000),
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          fps: parseFps(videoStream?.r_frame_rate || '0'),
          codec: videoStream?.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
          sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined
        }

        resolve(metadata)
      } catch (error) {
        reject(new Error(`Failed to parse ffprobe output: ${error}`))
      }
    })

    ffprobe.on('error', (error) => {
      reject(new Error(`Failed to run ffprobe: ${error.message}`))
    })
  })
}

/**
 * Parse FPS from ffprobe frame rate string (e.g., "30000/1001" or "30")
 */
function parseFps(frameRate: string): number {
  if (frameRate.includes('/')) {
    const [num, den] = frameRate.split('/').map(Number)
    return Math.round((num / den) * 100) / 100
  }
  return parseFloat(frameRate) || 0
}

/**
 * Import a video file and get its metadata
 */
export async function importVideoFile(filePath: string): Promise<ImportedFile> {
  const stats = await fs.stat(filePath)
  const ext = path.extname(filePath).toLowerCase()

  if (!VIDEO_EXTENSIONS.includes(ext) && !AUDIO_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file format: ${ext}`)
  }

  const metadata = await getMediaMetadata(filePath)

  return {
    path: filePath,
    name: path.basename(filePath, ext),
    size: stats.size,
    type: VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'audio',
    metadata
  }
}

/**
 * Validate that a file exists and is readable
 */
export async function validateFile(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Extract audio from video file
 */
export async function extractAudio(
  videoPath: string,
  outputPath: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i',
      videoPath,
      '-vn', // No video
      '-acodec',
      'pcm_s16le', // WAV format
      '-ar',
      '44100', // Sample rate
      '-ac',
      '2', // Stereo
      '-y', // Overwrite
      outputPath
    ]

    const ffmpeg = spawn('ffmpeg', args)
    let stderr = ''

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString()

      // Parse progress from ffmpeg output
      const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (timeMatch && onProgress) {
        const [, hours, minutes, seconds] = timeMatch
        const currentTime =
          parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseFloat(seconds)
        // Progress calculation would need total duration - calling with percentage estimate
        onProgress(currentTime)
      }
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
        return
      }
      resolve()
    })

    ffmpeg.on('error', (error) => {
      reject(new Error(`Failed to run ffmpeg: ${error.message}`))
    })
  })
}

/**
 * Generate thumbnail from video
 */
export async function generateThumbnail(
  videoPath: string,
  outputPath: string,
  timeSeconds = 1
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i',
      videoPath,
      '-ss',
      timeSeconds.toString(),
      '-vframes',
      '1',
      '-vf',
      'scale=320:-1',
      '-y',
      outputPath
    ]

    const ffmpeg = spawn('ffmpeg', args)
    let stderr = ''

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
        return
      }
      resolve()
    })

    ffmpeg.on('error', (error) => {
      reject(new Error(`Failed to run ffmpeg: ${error.message}`))
    })
  })
}
