/**
 * Sync.so Service
 * API key management and entry point for Sync.so lip-sync integration
 */

import { API_KEYS, keychainService } from '../keychain'

const SYNC_SO_BASE_URL = 'https://api.sync.so/v2'

/**
 * Get the Sync.so API key from keychain or environment variable
 */
export async function getSyncSoApiKey(): Promise<string | null> {
  const keychainKey = await keychainService.getAPIKey(API_KEYS.SYNC_SO)
  if (keychainKey) return keychainKey

  return process.env.SYNC_SO_API_KEY || null
}

/**
 * Check if a Sync.so API key is configured
 */
export async function hasSyncSoApiKey(): Promise<boolean> {
  const key = await getSyncSoApiKey()
  return key !== null && key.length > 0
}

/**
 * Get the Sync.so base URL
 */
export function getSyncSoBaseUrl(): string {
  return SYNC_SO_BASE_URL
}

export * from './lipsync'
