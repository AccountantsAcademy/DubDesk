/**
 * ElevenLabs Text-to-Speech Service
 * TTS generation using ElevenLabs API
 */

import { createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { PromisePool } from '@supercharge/promise-pool'
import { getElevenLabsApiKey, getElevenLabsBaseUrl } from './index'

export interface TTSOptions {
  /** Voice ID to use */
  voiceId: string
  /** Model ID (default: eleven_multilingual_v2) */
  modelId?: string
  /** Output format (default: mp3_44100_128) */
  outputFormat?: string
  /** Voice stability (0-1, default: 0.5) */
  stability?: number
  /** Voice similarity boost (0-1, default: 0.75) */
  similarityBoost?: number
  /** Voice style (0-1, default: 0) */
  style?: number
  /** Use speaker boost (default: true) */
  useSpeakerBoost?: boolean
  /** Speed multiplier (0.7-1.2, default: 1.0) - limited range in ElevenLabs API */
  speed?: number
}

export interface TTSResult {
  /** Path to the generated audio file */
  audioPath: string
  /** Duration of the audio in milliseconds */
  durationMs: number
  /** Character count used */
  characterCount: number
}

/**
 * Generate speech from text using ElevenLabs TTS
 * @param text Text to convert to speech
 * @param outputPath Path to save the audio file
 * @param options TTS options
 * @returns TTS result with audio path and duration
 */
export async function generateSpeech(
  text: string,
  outputPath: string,
  options: TTSOptions
): Promise<TTSResult> {
  const apiKey = await getElevenLabsApiKey()
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured')
  }

  if (!text.trim()) {
    throw new Error('Text cannot be empty')
  }

  if (!options.voiceId) {
    throw new Error('Voice ID is required')
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath)
  await mkdir(outputDir, { recursive: true })

  // Build request body
  const body = {
    text,
    model_id: options.modelId || 'eleven_multilingual_v2',
    voice_settings: {
      stability: options.stability ?? 0.5,
      similarity_boost: options.similarityBoost ?? 0.75,
      style: options.style ?? 0,
      use_speaker_boost: options.useSpeakerBoost ?? true
    }
  }

  // Build query params
  const params = new URLSearchParams({
    output_format: options.outputFormat || 'mp3_44100_128'
  })

  // Make request with timeout
  const baseUrl = await getElevenLabsBaseUrl()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

  let response: Response
  try {
    response = await fetch(`${baseUrl}/text-to-speech/${options.voiceId}?${params}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('TTS request timed out after 60 seconds')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage: string
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.detail?.message || errorJson.message || errorText
    } catch {
      errorMessage = errorText
    }
    throw new Error(`TTS generation failed (${response.status}): ${errorMessage}`)
  }

  // Get character count from headers
  const characterCount = Number.parseInt(response.headers.get('character-count') || '0', 10)

  // Stream response to file
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const writeStream = createWriteStream(outputPath)
  const readable = Readable.from(buffer)
  await pipeline(readable, writeStream)

  // Estimate duration from file size (rough estimate for MP3)
  // Better approach would be to parse the audio file
  const bitrate = 128000 // 128kbps
  const durationMs = Math.round((buffer.length * 8 * 1000) / bitrate)

  return {
    audioPath: outputPath,
    durationMs,
    characterCount
  }
}

/**
 * Generate speech with streaming (for real-time playback)
 * @param text Text to convert to speech
 * @param options TTS options
 * @returns Async iterator of audio chunks
 */
export async function* streamSpeech(text: string, options: TTSOptions): AsyncGenerator<Buffer> {
  const apiKey = await getElevenLabsApiKey()
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured')
  }

  if (!text.trim()) {
    throw new Error('Text cannot be empty')
  }

  if (!options.voiceId) {
    throw new Error('Voice ID is required')
  }

  const body = {
    text,
    model_id: options.modelId || 'eleven_multilingual_v2',
    voice_settings: {
      stability: options.stability ?? 0.5,
      similarity_boost: options.similarityBoost ?? 0.75,
      style: options.style ?? 0,
      use_speaker_boost: options.useSpeakerBoost ?? true
    }
  }

  const params = new URLSearchParams({
    output_format: options.outputFormat || 'mp3_44100_128'
  })

  const baseUrl = await getElevenLabsBaseUrl()
  const response = await fetch(`${baseUrl}/text-to-speech/${options.voiceId}/stream?${params}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`TTS streaming failed (${response.status}): ${errorText}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield Buffer.from(value)
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Generate speech for multiple segments in batch
 * @param segments Array of text segments with metadata
 * @param outputDir Directory to save audio files
 * @param options TTS options (voiceId can be overridden per segment)
 * @param onProgress Progress callback
 * @returns Array of TTS results
 */
const CONCURRENCY_LIMIT = 20

export async function generateSpeechBatch(
  segments: Array<{
    id: string
    text: string
    voiceId?: string
  }>,
  outputDir: string,
  options: Omit<TTSOptions, 'voiceId'> & { defaultVoiceId: string },
  onProgress?: (progress: {
    current: number
    total: number
    segmentId: string
    status?: string
  }) => void
): Promise<Array<TTSResult & { segmentId: string }>> {
  console.log(
    `[TTS:Batch] Starting batch generation of ${segments.length} segments (concurrency: ${CONCURRENCY_LIMIT})`
  )

  await mkdir(outputDir, { recursive: true })

  // Send initial progress
  onProgress?.({
    current: 0,
    total: segments.length,
    segmentId: '',
    status: 'starting'
  })

  let completedCount = 0

  const { results, errors } = await PromisePool.for(segments)
    .withConcurrency(CONCURRENCY_LIMIT)
    .process(async (segment) => {
      const voiceId = segment.voiceId || options.defaultVoiceId
      const outputPath = path.join(outputDir, `${segment.id}.mp3`)

      try {
        const result = await generateSpeech(segment.text, outputPath, {
          ...options,
          voiceId
        })

        return {
          ...result,
          segmentId: segment.id
        }
      } catch (error) {
        // Clean up partial file if it exists
        try {
          await unlink(outputPath)
        } catch {
          // Ignore cleanup errors
        }
        throw error
      } finally {
        completedCount++

        onProgress?.({
          current: completedCount,
          total: segments.length,
          segmentId: segment.id,
          status: 'completed'
        })

        if (completedCount % 10 === 0 || completedCount === segments.length) {
          console.log(`[TTS:Batch] Progress: ${completedCount}/${segments.length} segments`)
        }
      }
    })

  console.log(
    `[TTS:Batch] Batch generation complete: ${results.length} succeeded, ${errors.length} failed`
  )

  if (errors.length > 0) {
    const failedIds = errors.map((e) => (e.item as { id: string }).id).join(', ')
    throw new Error(`Failed to generate ${errors.length} segment(s): ${failedIds}`)
  }

  return results
}
