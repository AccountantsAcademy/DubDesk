/**
 * Settings IPC Handlers
 * Handles settings and API key related IPC communication
 */

import { IPC_CHANNELS } from '@shared/constants/channels'
import { ipcMain } from 'electron'
import { settingsRepository } from '../services/database/repositories'
import {
  getElevenLabsBaseUrl,
  getElevenLabsRegion,
  setElevenLabsRegion
} from '../services/elevenlabs'
import {
  API_KEYS,
  type APIKeyType,
  type ElevenLabsRegion,
  keychainService
} from '../services/keychain'

export function registerSettingsHandlers(): void {
  const { SETTINGS } = IPC_CHANNELS

  // Get a setting value
  ipcMain.handle(SETTINGS.GET, async (_event, data: { key: string }) => {
    try {
      const value = settingsRepository.get(data.key)
      return {
        success: true,
        value
      }
    } catch (error) {
      console.error('[Settings:Get] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get setting'
      }
    }
  })

  // Get all settings
  ipcMain.handle(SETTINGS.GET_ALL, async () => {
    try {
      const settings = settingsRepository.getAll()
      return {
        success: true,
        settings
      }
    } catch (error) {
      console.error('[Settings:GetAll] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get settings'
      }
    }
  })

  // Set a setting value
  ipcMain.handle(SETTINGS.SET, async (_event, data: { key: string; value: string }) => {
    try {
      settingsRepository.set(data.key, data.value)
      return { success: true }
    } catch (error) {
      console.error('[Settings:Set] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set setting'
      }
    }
  })

  // Set multiple settings at once
  ipcMain.handle(SETTINGS.SET_BULK, async (_event, data: { settings: Record<string, string> }) => {
    try {
      settingsRepository.setBulk(data.settings)
      return { success: true }
    } catch (error) {
      console.error('[Settings:SetBulk] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set settings'
      }
    }
  })

  // Get an API key (from secure keychain)
  ipcMain.handle(SETTINGS.GET_API_KEY, async (_event, data: { keyType: APIKeyType }) => {
    try {
      // First check if the key type is valid
      if (!Object.values(API_KEYS).includes(data.keyType)) {
        return {
          success: false,
          error: 'Invalid API key type'
        }
      }

      const value = await keychainService.getAPIKey(data.keyType)

      // Don't return the full key, just indicate if it exists and return masked version
      if (value) {
        const masked = maskAPIKey(value)
        return {
          success: true,
          exists: true,
          masked
        }
      }

      return {
        success: true,
        exists: false,
        masked: null
      }
    } catch (error) {
      console.error('[Settings:GetAPIKey] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get API key'
      }
    }
  })

  // Set an API key (to secure keychain)
  ipcMain.handle(
    SETTINGS.SET_API_KEY,
    async (_event, data: { keyType: APIKeyType; value: string }) => {
      try {
        // Validate key type
        if (!Object.values(API_KEYS).includes(data.keyType)) {
          return {
            success: false,
            error: 'Invalid API key type'
          }
        }

        // Store in keychain
        await keychainService.setAPIKey(data.keyType, data.value)

        return { success: true }
      } catch (error) {
        console.error('[Settings:SetAPIKey] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set API key'
        }
      }
    }
  )

  // Delete an API key
  ipcMain.handle(SETTINGS.DELETE_API_KEY, async (_event, data: { keyType: APIKeyType }) => {
    try {
      // Validate key type
      if (!Object.values(API_KEYS).includes(data.keyType)) {
        return {
          success: false,
          error: 'Invalid API key type'
        }
      }

      const deleted = await keychainService.deleteAPIKey(data.keyType)

      return {
        success: true,
        deleted
      }
    } catch (error) {
      console.error('[Settings:DeleteAPIKey] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete API key'
      }
    }
  })

  // Validate an API key against the service
  ipcMain.handle(SETTINGS.VALIDATE_API_KEY, async (_event, data: { keyType: APIKeyType }) => {
    try {
      // Validate key type
      if (!Object.values(API_KEYS).includes(data.keyType)) {
        return {
          success: false,
          error: 'Invalid API key type'
        }
      }

      const apiKey = await keychainService.getAPIKey(data.keyType)
      if (!apiKey) {
        return {
          success: true,
          valid: false,
          error: 'API key not found'
        }
      }

      // Validate based on key type
      let valid = false
      let error: string | undefined

      if (data.keyType === API_KEYS.ELEVENLABS) {
        const result = await validateElevenLabsKey(apiKey)
        valid = result.valid
        error = result.error
      } else if (data.keyType === API_KEYS.ANTHROPIC) {
        const result = await validateAnthropicKey(apiKey)
        valid = result.valid
        error = result.error
      } else if (data.keyType === API_KEYS.OPENAI) {
        // OpenAI validation not implemented yet
        valid = true
      }

      return {
        success: true,
        valid,
        error
      }
    } catch (error) {
      console.error('[Settings:ValidateAPIKey] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate API key'
      }
    }
  })

  // Get status of all API keys
  ipcMain.handle(SETTINGS.GET_API_KEY_STATUS, async () => {
    try {
      const status = await keychainService.getAPIKeyStatus()
      return {
        success: true,
        status
      }
    } catch (error) {
      console.error('[Settings:GetAPIKeyStatus] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get API key status'
      }
    }
  })

  // Get ElevenLabs region
  ipcMain.handle(SETTINGS.GET_ELEVENLABS_REGION, async () => {
    try {
      const region = await getElevenLabsRegion()
      return {
        success: true,
        region
      }
    } catch (error) {
      console.error('[Settings:GetElevenLabsRegion] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get ElevenLabs region'
      }
    }
  })

  // Set ElevenLabs region
  ipcMain.handle(
    SETTINGS.SET_ELEVENLABS_REGION,
    async (_event, data: { region: ElevenLabsRegion }) => {
      try {
        if (data.region !== 'us' && data.region !== 'eu') {
          return {
            success: false,
            error: 'Invalid region. Must be "us" or "eu"'
          }
        }

        await setElevenLabsRegion(data.region)
        return { success: true }
      } catch (error) {
        console.error('[Settings:SetElevenLabsRegion] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set ElevenLabs region'
        }
      }
    }
  )

  console.log('[IPC] Settings handlers registered')
}

/**
 * Validate an ElevenLabs API key
 */
async function validateElevenLabsKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const baseUrl = await getElevenLabsBaseUrl()
    const response = await fetch(`${baseUrl}/user`, {
      headers: {
        'xi-api-key': apiKey
      }
    })

    if (response.ok) {
      return { valid: true }
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' }
    }

    return { valid: false, error: `API error: ${response.status}` }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

/**
 * Validate an Anthropic API key
 */
async function validateAnthropicKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Use a minimal request to validate the key
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    })

    // A successful response or rate limit means the key is valid
    if (response.ok || response.status === 429) {
      return { valid: true }
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' }
    }

    return { valid: false, error: `API error: ${response.status}` }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

/**
 * Mask an API key for display (show first 4 and last 4 characters)
 */
function maskAPIKey(key: string): string {
  if (key.length <= 8) {
    return '*'.repeat(key.length)
  }
  const first = key.slice(0, 4)
  const last = key.slice(-4)
  const middle = '*'.repeat(Math.min(key.length - 8, 20))
  return `${first}${middle}${last}`
}
