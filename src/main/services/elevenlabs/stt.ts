/**
 * ElevenLabs Speech-to-Text Service
 * Transcription using ElevenLabs Scribe API
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { getElevenLabsApiKey, getElevenLabsBaseUrl } from './index'

export interface TranscriptionWord {
  text: string
  start: number // seconds
  end: number // seconds
  type: 'word' | 'spacing' | 'audio_event'
}

export interface TranscriptionSegment {
  text: string
  startTimeMs: number
  endTimeMs: number
  speaker?: string
  words?: TranscriptionWord[]
}

export interface TranscriptionResult {
  text: string
  segments: TranscriptionSegment[]
  language_code?: string
  language_probability?: number
}

export interface TranscribeOptions {
  /** ISO 639-1 language code (e.g., 'en', 'es'). If not provided, language is auto-detected */
  languageCode?: string
  /** Enable speaker diarization */
  diarize?: boolean
  /** Number of speakers (helps with diarization) */
  numSpeakers?: number
  /** Timestamps granularity: 'word' or 'segment' */
  timestampsGranularity?: 'word' | 'segment'
  /** Tag audio events like laughter, applause */
  tagAudioEvents?: boolean
}

/**
 * Transcribe an audio file using ElevenLabs STT
 * @param audioPath Path to the audio file
 * @param options Transcription options
 * @returns Transcription result with segments
 */
export async function transcribeAudio(
  audioPath: string,
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const apiKey = await getElevenLabsApiKey()
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured')
  }

  // Verify file exists
  try {
    await stat(audioPath)
  } catch {
    throw new Error(`Audio file not found: ${audioPath}`)
  }

  // Create form data with the audio file
  const formData = new FormData()

  // Read file as blob
  const fileStream = createReadStream(audioPath)
  const chunks: Buffer[] = []
  for await (const chunk of fileStream) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)
  const blob = new Blob([buffer], { type: getMimeType(audioPath) })
  formData.append('file', blob, path.basename(audioPath))

  // model_id is required by ElevenLabs API
  formData.append('model_id', 'scribe_v1')

  // Add options
  if (options.languageCode) {
    formData.append('language_code', options.languageCode)
  }
  if (options.diarize !== undefined) {
    formData.append('diarize', String(options.diarize))
  }
  if (options.numSpeakers) {
    formData.append('num_speakers', String(options.numSpeakers))
  }
  if (options.timestampsGranularity) {
    formData.append('timestamps_granularity', options.timestampsGranularity)
  }
  if (options.tagAudioEvents !== undefined) {
    formData.append('tag_audio_events', String(options.tagAudioEvents))
  }

  // Make request
  const baseUrl = await getElevenLabsBaseUrl()
  const response = await fetch(`${baseUrl}/speech-to-text`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey
    },
    body: formData
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage: string
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.detail?.message || errorJson.message || errorText
    } catch {
      errorMessage = errorText
    }
    throw new Error(`Transcription failed (${response.status}): ${errorMessage}`)
  }

  const result = await response.json()

  // Parse response into our segment format
  return parseTranscriptionResponse(result)
}

/**
 * Parse ElevenLabs STT response into our segment format
 */
function parseTranscriptionResponse(response: {
  text: string
  words?: Array<{
    text: string
    start: number
    end: number
    type: string
    speaker_id?: string
  }>
  language_code?: string
  language_probability?: number
}): TranscriptionResult {
  const segments: TranscriptionSegment[] = []

  if (response.words && response.words.length > 0) {
    // Group words into segments (sentences/phrases)
    let currentSegment: {
      words: typeof response.words
      speaker?: string
    } | null = null

    for (const word of response.words) {
      // Skip audio events for segmentation but keep track of them
      if (word.type === 'audio_event') continue

      const isNewSpeaker = currentSegment && word.speaker_id !== currentSegment.speaker
      const isPunctuation = word.text.match(/[.!?]$/)

      if (!currentSegment) {
        currentSegment = { words: [word], speaker: word.speaker_id }
      } else if (isNewSpeaker) {
        // Save current segment and start new one
        segments.push(createSegmentFromWords(currentSegment.words, currentSegment.speaker))
        currentSegment = { words: [word], speaker: word.speaker_id }
      } else {
        currentSegment.words.push(word)

        // End segment on sentence-ending punctuation
        if (isPunctuation && currentSegment.words.length >= 3) {
          segments.push(createSegmentFromWords(currentSegment.words, currentSegment.speaker))
          currentSegment = null
        }
      }
    }

    // Don't forget the last segment
    if (currentSegment && currentSegment.words.length > 0) {
      segments.push(createSegmentFromWords(currentSegment.words, currentSegment.speaker))
    }
  } else {
    // No word-level timestamps, create a single segment
    segments.push({
      text: response.text,
      startTimeMs: 0,
      endTimeMs: 0 // Will need to be set from audio duration
    })
  }

  return {
    text: response.text,
    segments,
    language_code: response.language_code,
    language_probability: response.language_probability
  }
}

/**
 * Create a segment from a list of words
 */
function createSegmentFromWords(
  words: Array<{ text: string; start: number; end: number; type: string }>,
  speaker?: string
): TranscriptionSegment {
  const text = words
    .map((w) => w.text)
    .join('')
    .trim()

  return {
    text,
    startTimeMs: Math.round(words[0].start * 1000),
    endTimeMs: Math.round(words[words.length - 1].end * 1000),
    speaker,
    words: words.map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end,
      type: w.type as 'word' | 'spacing' | 'audio_event'
    }))
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm'
  }
  return mimeTypes[ext] || 'audio/mpeg'
}
