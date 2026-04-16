/**
 * ElevenLabs Voice Cloning Service
 * Instant voice cloning using the ElevenLabs API
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { getElevenLabsApiKey, getElevenLabsBaseUrl } from './index'

export interface CloneVoiceOptions {
  description?: string
  labels?: Record<string, string>
}

export interface CloneVoiceResult {
  voiceId: string
  name: string
}

/**
 * Clone a voice from an audio file using ElevenLabs Instant Voice Cloning
 * @param audioPath Path to the audio file (WAV, MP3, etc.)
 * @param voiceName Name for the cloned voice
 * @param options Optional description and labels
 * @returns The cloned voice ID and name
 */
export async function cloneVoiceFromAudio(
  audioPath: string,
  voiceName: string,
  options: CloneVoiceOptions = {}
): Promise<CloneVoiceResult> {
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

  // Read audio file into buffer
  const fileStream = createReadStream(audioPath)
  const chunks: Buffer[] = []
  for await (const chunk of fileStream) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  // Determine MIME type
  const ext = path.extname(audioPath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac'
  }
  const mimeType = mimeTypes[ext] || 'audio/mpeg'

  // Build FormData
  const formData = new FormData()
  formData.append('name', voiceName)

  const blob = new Blob([buffer], { type: mimeType })
  formData.append('files', blob, path.basename(audioPath))

  if (options.description) {
    formData.append('description', options.description)
  }
  if (options.labels) {
    formData.append('labels', JSON.stringify(options.labels))
  }

  // POST to voice cloning endpoint
  const baseUrl = await getElevenLabsBaseUrl()
  const response = await fetch(`${baseUrl}/voices/add`, {
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
    throw new Error(`Voice cloning failed (${response.status}): ${errorMessage}`)
  }

  const result = await response.json()

  console.log(`[VoiceClone] Successfully cloned voice: ${result.voice_id} (${voiceName})`)

  return {
    voiceId: result.voice_id,
    name: voiceName
  }
}

/**
 * Delete a cloned voice from ElevenLabs
 * @param voiceId The voice ID to delete
 */
export async function deleteClonedVoice(voiceId: string): Promise<void> {
  const apiKey = await getElevenLabsApiKey()
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured')
  }

  const baseUrl = await getElevenLabsBaseUrl()
  const response = await fetch(`${baseUrl}/voices/${voiceId}`, {
    method: 'DELETE',
    headers: {
      'xi-api-key': apiKey
    }
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
    throw new Error(`Failed to delete voice (${response.status}): ${errorMessage}`)
  }

  console.log(`[VoiceClone] Deleted voice: ${voiceId}`)
}
