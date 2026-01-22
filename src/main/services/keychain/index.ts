/**
 * Keychain Service
 * Secure API key storage using OS-native credential storage:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: libsecret (GNOME Keyring / KWallet)
 */

import keytar from 'keytar'

const SERVICE_NAME = 'DubDesk'

// API key identifiers
export const API_KEYS = {
  ELEVENLABS: 'elevenlabs_api_key',
  ELEVENLABS_REGION: 'elevenlabs_region',
  ANTHROPIC: 'anthropic_api_key',
  OPENAI: 'openai_api_key'
} as const

export type ElevenLabsRegion = 'us' | 'eu'

export type APIKeyType = (typeof API_KEYS)[keyof typeof API_KEYS]

/**
 * Store a secret securely in the system keychain
 */
export async function setSecret(key: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, key, value)
}

/**
 * Retrieve a secret from the system keychain
 */
export async function getSecret(key: string): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, key)
}

/**
 * Delete a secret from the system keychain
 */
export async function deleteSecret(key: string): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, key)
}

/**
 * Check if a secret exists in the keychain
 */
export async function hasSecret(key: string): Promise<boolean> {
  const value = await getSecret(key)
  return value !== null && value.length > 0
}

/**
 * List all stored keys (names only, not values)
 */
export async function listKeys(): Promise<string[]> {
  const credentials = await keytar.findCredentials(SERVICE_NAME)
  return credentials.map((c) => c.account)
}

/**
 * Store an API key
 */
export async function setAPIKey(keyType: APIKeyType, value: string): Promise<void> {
  await setSecret(keyType, value)
}

/**
 * Get an API key
 */
export async function getAPIKey(keyType: APIKeyType): Promise<string | null> {
  return getSecret(keyType)
}

/**
 * Delete an API key
 */
export async function deleteAPIKey(keyType: APIKeyType): Promise<boolean> {
  return deleteSecret(keyType)
}

/**
 * Check if an API key is stored
 */
export async function hasAPIKey(keyType: APIKeyType): Promise<boolean> {
  return hasSecret(keyType)
}

/**
 * Get the status of all API keys (excludes non-secret settings like region)
 */
export async function getAPIKeyStatus(): Promise<{
  [API_KEYS.ELEVENLABS]: boolean
  [API_KEYS.ANTHROPIC]: boolean
  [API_KEYS.OPENAI]: boolean
}> {
  const [elevenlabs, anthropic, openai] = await Promise.all([
    hasAPIKey(API_KEYS.ELEVENLABS),
    hasAPIKey(API_KEYS.ANTHROPIC),
    hasAPIKey(API_KEYS.OPENAI)
  ])

  return {
    [API_KEYS.ELEVENLABS]: elevenlabs,
    [API_KEYS.ANTHROPIC]: anthropic,
    [API_KEYS.OPENAI]: openai
  }
}

/**
 * Clear all stored credentials for the app
 */
export async function clearAll(): Promise<void> {
  const keys = await listKeys()
  await Promise.all(keys.map((key) => deleteSecret(key)))
}

// Export the keychain service as an object for easier use
export const keychainService = {
  setSecret,
  getSecret,
  deleteSecret,
  hasSecret,
  listKeys,
  setAPIKey,
  getAPIKey,
  deleteAPIKey,
  hasAPIKey,
  getAPIKeyStatus,
  clearAll
}

export default keychainService
