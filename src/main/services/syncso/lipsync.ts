/**
 * Sync.so Lip-Sync Service
 * Submit lip-sync jobs, poll for completion, and download results
 */

import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { getSyncSoApiKey, getSyncSoBaseUrl } from './index'

export interface LipsyncOptions {
  /** Model to use (default: lipsync-2) */
  model?: 'lipsync-2' | 'sync-3' | 'lipsync-2-pro'
}

export interface LipsyncStatus {
  id: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED'
  outputUrl?: string
  outputDuration?: number
  error?: string
  errorCode?: string
}

export interface LipsyncResult {
  outputUrl: string
  outputDuration: number
}

/**
 * Submit a lip-sync generation job with local video and audio files
 * Uses the multipart/form-data "Create with Files" endpoint
 */
export async function submitLipsync(
  videoPath: string,
  audioPath: string,
  options: LipsyncOptions = {}
): Promise<{ generationId: string }> {
  const apiKey = await getSyncSoApiKey()
  if (!apiKey) {
    throw new Error('Sync.so API key not configured')
  }

  // Verify files exist
  for (const filePath of [videoPath, audioPath]) {
    try {
      await stat(filePath)
    } catch {
      throw new Error(`File not found: ${filePath}`)
    }
  }

  // Read files into buffers
  const [videoBuffer, audioBuffer] = await Promise.all([
    readFileToBuffer(videoPath),
    readFileToBuffer(audioPath)
  ])

  // Build multipart form data
  const formData = new FormData()
  formData.append('model', options.model || 'lipsync-2')

  const videoBlob = new Blob([new Uint8Array(videoBuffer)], { type: getMimeType(videoPath) })
  formData.append('video', videoBlob, path.basename(videoPath))

  const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: getAudioMimeType(audioPath) })
  formData.append('audio', audioBlob, path.basename(audioPath))

  const baseUrl = getSyncSoBaseUrl()
  const response = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey
    },
    body: formData
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage: string
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error || errorJson.message || errorText
    } catch {
      errorMessage = errorText
    }
    throw new Error(`Lip-sync submission failed (${response.status}): ${errorMessage}`)
  }

  const result = await response.json()
  console.log(`[SyncSo] Lip-sync job submitted: ${result.id}`)

  return { generationId: result.id }
}

/**
 * Poll the status of a lip-sync generation job
 */
export async function pollLipsyncStatus(generationId: string): Promise<LipsyncStatus> {
  const apiKey = await getSyncSoApiKey()
  if (!apiKey) {
    throw new Error('Sync.so API key not configured')
  }

  const baseUrl = getSyncSoBaseUrl()
  const response = await fetch(`${baseUrl}/generate/${generationId}`, {
    headers: {
      'x-api-key': apiKey
    }
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Generation not found: ${generationId}`)
    }
    throw new Error(`Failed to poll status (${response.status})`)
  }

  const result = await response.json()

  return {
    id: result.id,
    status: result.status,
    outputUrl: result.outputUrl,
    outputDuration: result.outputDuration,
    error: result.error,
    errorCode: result.error_code
  }
}

/**
 * Wait for a lip-sync job to complete by polling
 * @param generationId The generation ID to wait for
 * @param onProgress Optional callback for status updates
 * @param timeoutMs Maximum wait time (default: 5 minutes)
 */
export async function waitForLipsync(
  generationId: string,
  onProgress?: (status: LipsyncStatus) => void,
  timeoutMs = 5 * 60 * 1000
): Promise<LipsyncResult> {
  const pollIntervalMs = 3000
  const startTime = Date.now()

  while (true) {
    const status = await pollLipsyncStatus(generationId)
    onProgress?.(status)

    if (status.status === 'COMPLETED') {
      if (!status.outputUrl) {
        throw new Error('Lip-sync completed but no output URL returned')
      }
      console.log(`[SyncSo] Lip-sync completed: ${status.outputUrl}`)
      return {
        outputUrl: status.outputUrl,
        outputDuration: status.outputDuration || 0
      }
    }

    if (status.status === 'FAILED' || status.status === 'REJECTED') {
      throw new Error(`Lip-sync ${status.status.toLowerCase()}: ${status.error || 'Unknown error'}`)
    }

    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Lip-sync timed out after ${timeoutMs / 1000}s (status: ${status.status})`)
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}

/**
 * Download the lip-sync result video to a local path
 */
export async function downloadLipsyncResult(
  outputUrl: string,
  outputPath: string
): Promise<{ outputPath: string; fileSize: number }> {
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  const response = await fetch(outputUrl)
  if (!response.ok) {
    throw new Error(`Failed to download lip-sync result (${response.status})`)
  }

  if (!response.body) {
    throw new Error('Response body is empty')
  }

  const writeStream = createWriteStream(outputPath)
  const readable = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  await pipeline(readable, writeStream)

  const fileStat = await stat(outputPath)
  console.log(
    `[SyncSo] Downloaded lip-sync result: ${outputPath} (${(fileStat.size / 1024 / 1024).toFixed(1)}MB)`
  )

  return { outputPath, fileSize: fileStat.size }
}

// --- Helpers ---

async function readFileToBuffer(filePath: string): Promise<Buffer> {
  const stream = createReadStream(filePath)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo'
  }
  return types[ext] || 'video/mp4'
}

function getAudioMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const types: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac'
  }
  return types[ext] || 'audio/mpeg'
}
