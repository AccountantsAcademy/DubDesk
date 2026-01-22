/**
 * ElevenLabs Service
 * Main entry point for ElevenLabs API integration
 */

export * from './stt'
export * from './tts'
export * from './voices'

import { API_KEYS, type ElevenLabsRegion, keychainService } from '../keychain'

const BASE_URLS = {
  us: 'https://api.elevenlabs.io/v1',
  eu: 'https://api.eu.residency.elevenlabs.io/v1'
} as const

/**
 * Get the ElevenLabs API key from keychain or environment variable
 */
export async function getElevenLabsApiKey(): Promise<string | null> {
  // First try keychain
  const keychainKey = await keychainService.getAPIKey(API_KEYS.ELEVENLABS)
  if (keychainKey) return keychainKey

  // Fallback to environment variable for development
  return process.env.ELEVENLABS_API_KEY || null
}

/**
 * Detect region from API key suffix (e.g., _residency_eu)
 */
function detectRegionFromKey(apiKey: string): ElevenLabsRegion | null {
  if (apiKey.endsWith('_residency_eu')) return 'eu'
  if (apiKey.endsWith('_residency_us')) return 'us'
  return null
}

/**
 * Get the configured ElevenLabs region (auto-detects from API key if not set)
 */
export async function getElevenLabsRegion(): Promise<ElevenLabsRegion> {
  // First check if region is explicitly set
  const savedRegion = await keychainService.getSecret(API_KEYS.ELEVENLABS_REGION)
  if (savedRegion === 'eu' || savedRegion === 'us') {
    return savedRegion
  }

  // Auto-detect from API key suffix
  const apiKey = await getElevenLabsApiKey()
  if (apiKey) {
    const detectedRegion = detectRegionFromKey(apiKey)
    if (detectedRegion) {
      // Save the detected region for future use
      await setElevenLabsRegion(detectedRegion)
      return detectedRegion
    }
  }

  return 'us'
}

/**
 * Set the ElevenLabs region
 */
export async function setElevenLabsRegion(region: ElevenLabsRegion): Promise<void> {
  await keychainService.setSecret(API_KEYS.ELEVENLABS_REGION, region)
}

/**
 * Get the ElevenLabs base URL for the configured region
 */
export async function getElevenLabsBaseUrl(): Promise<string> {
  const region = await getElevenLabsRegion()
  return BASE_URLS[region]
}

/**
 * Check if ElevenLabs API key is configured
 */
export async function hasElevenLabsApiKey(): Promise<boolean> {
  return keychainService.hasAPIKey(API_KEYS.ELEVENLABS)
}

/**
 * Make an authenticated request to ElevenLabs API
 */
export async function elevenLabsRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = await getElevenLabsApiKey()
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured')
  }

  const baseUrl = await getElevenLabsBaseUrl()
  const url = `${baseUrl}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'xi-api-key': apiKey,
      ...options.headers
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
    throw new Error(`ElevenLabs API error (${response.status}): ${errorMessage}`)
  }

  // Check if response is JSON
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return response.json() as Promise<T>
  }

  // Return response object for binary data
  return response as unknown as T
}

/**
 * Get user info to validate API key
 */
export async function getElevenLabsUser(): Promise<{
  subscription: {
    tier: string
    character_count: number
    character_limit: number
  }
}> {
  return elevenLabsRequest('/user')
}
