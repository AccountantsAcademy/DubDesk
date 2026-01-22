/**
 * ElevenLabs Voices Service
 * Voice listing and management
 */

import { elevenLabsRequest } from './index'

export interface Voice {
  voice_id: string
  name: string
  category: 'premade' | 'cloned' | 'generated' | 'professional'
  description?: string
  preview_url?: string
  labels?: Record<string, string>
  settings?: {
    stability: number
    similarity_boost: number
    style?: number
    use_speaker_boost?: boolean
  }
}

export interface VoiceWithPreview extends Voice {
  previewAudioPath?: string
}

// Voice cache
let voiceCache: Voice[] | null = null
let voiceCacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get all available voices
 * @param forceRefresh Force refresh the cache
 * @returns List of available voices
 */
export async function getVoices(forceRefresh = false): Promise<Voice[]> {
  // Return cached voices if valid
  if (!forceRefresh && voiceCache && Date.now() - voiceCacheTime < CACHE_TTL) {
    return voiceCache
  }

  const response = await elevenLabsRequest<{ voices: Voice[] }>('/voices')

  voiceCache = response.voices
  voiceCacheTime = Date.now()

  return voiceCache
}

/**
 * Get a specific voice by ID
 * @param voiceId Voice ID
 * @returns Voice details
 */
export async function getVoice(voiceId: string): Promise<Voice> {
  return elevenLabsRequest<Voice>(`/voices/${voiceId}`)
}

/**
 * Get voices grouped by category
 * @returns Voices grouped by category
 */
export async function getVoicesByCategory(): Promise<Record<string, Voice[]>> {
  const voices = await getVoices()

  const grouped: Record<string, Voice[]> = {
    premade: [],
    cloned: [],
    generated: [],
    professional: []
  }

  for (const voice of voices) {
    const category = voice.category || 'premade'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(voice)
  }

  return grouped
}

/**
 * Search voices by name or labels
 * @param query Search query
 * @returns Matching voices
 */
export async function searchVoices(query: string): Promise<Voice[]> {
  const voices = await getVoices()
  const lowerQuery = query.toLowerCase()

  return voices.filter((voice) => {
    // Match by name
    if (voice.name.toLowerCase().includes(lowerQuery)) {
      return true
    }

    // Match by description
    if (voice.description?.toLowerCase().includes(lowerQuery)) {
      return true
    }

    // Match by labels
    if (voice.labels) {
      for (const [key, value] of Object.entries(voice.labels)) {
        if (key.toLowerCase().includes(lowerQuery) || value.toLowerCase().includes(lowerQuery)) {
          return true
        }
      }
    }

    return false
  })
}

/**
 * Get default voice settings
 * @param voiceId Voice ID
 * @returns Default settings for the voice
 */
export async function getVoiceSettings(voiceId: string): Promise<{
  stability: number
  similarity_boost: number
  style: number
  use_speaker_boost: boolean
}> {
  return elevenLabsRequest(`/voices/${voiceId}/settings`)
}

/**
 * Get available voice models
 * @returns List of available models
 */
export async function getModels(): Promise<
  Array<{
    model_id: string
    name: string
    description: string
    can_be_finetuned: boolean
    can_do_text_to_speech: boolean
    can_do_voice_conversion: boolean
    languages: Array<{ language_id: string; name: string }>
  }>
> {
  return elevenLabsRequest('/models')
}

/**
 * Clear the voice cache
 */
export function clearVoiceCache(): void {
  voiceCache = null
  voiceCacheTime = 0
}

/**
 * Get recommended voices for a language
 * @param languageCode ISO 639-1 language code
 * @returns Voices that support the language
 */
export async function getVoicesForLanguage(languageCode: string): Promise<Voice[]> {
  const voices = await getVoices()

  // Filter by language label if available
  return voices.filter((voice) => {
    if (voice.labels?.language) {
      const voiceLang = voice.labels.language.toLowerCase()
      return (
        voiceLang === languageCode.toLowerCase() || voiceLang.startsWith(languageCode.toLowerCase())
      )
    }
    // Include multilingual voices
    return voice.labels?.['use case']?.toLowerCase().includes('multilingual')
  })
}
