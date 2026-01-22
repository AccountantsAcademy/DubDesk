import { useUIStore } from '@renderer/stores/ui.store'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

type TabId = 'apiKeys' | 'general'

interface APIKeyState {
  elevenlabs: { exists: boolean; masked: string | null; validating: boolean; valid?: boolean }
  anthropic: { exists: boolean; masked: string | null; validating: boolean; valid?: boolean }
}

type ElevenLabsRegion = 'us' | 'eu'

const API_KEY_TYPES = {
  ELEVENLABS: 'elevenlabs_api_key',
  ANTHROPIC: 'anthropic_api_key'
} as const

export function SettingsModal(): React.JSX.Element | null {
  const isOpen = useUIStore((state) => state.modals.settings.isOpen)
  const closeModal = useUIStore((state) => state.closeModal)
  const addToast = useUIStore((state) => state.addToast)

  const [activeTab, setActiveTab] = useState<TabId>('apiKeys')
  const [apiKeyInputs, setApiKeyInputs] = useState({
    elevenlabs: '',
    anthropic: ''
  })
  const [apiKeyState, setApiKeyState] = useState<APIKeyState>({
    elevenlabs: { exists: false, masked: null, validating: false },
    anthropic: { exists: false, masked: null, validating: false }
  })
  const [showKeys, setShowKeys] = useState({
    elevenlabs: false,
    anthropic: false
  })
  const [isLoading, setIsLoading] = useState(false)
  const [elevenLabsRegion, setElevenLabsRegion] = useState<ElevenLabsRegion>('us')

  const loadApiKeyStatus = useCallback(async () => {
    try {
      const [elevenlabsResult, anthropicResult, regionResult] = await Promise.all([
        window.dubdesk.settings.getApiKey(API_KEY_TYPES.ELEVENLABS),
        window.dubdesk.settings.getApiKey(API_KEY_TYPES.ANTHROPIC),
        window.dubdesk.settings.getElevenLabsRegion()
      ])

      setApiKeyState({
        elevenlabs: {
          exists: elevenlabsResult.success && elevenlabsResult.exists,
          masked: elevenlabsResult.masked || null,
          validating: false
        },
        anthropic: {
          exists: anthropicResult.success && anthropicResult.exists,
          masked: anthropicResult.masked || null,
          validating: false
        }
      })

      if (regionResult.success && regionResult.region) {
        setElevenLabsRegion(regionResult.region)
      }
    } catch (error) {
      console.error('Failed to load API key status:', error)
    }
  }, [])

  // Load API key status on mount
  useEffect(() => {
    if (isOpen) {
      loadApiKeyStatus()
    }
  }, [isOpen, loadApiKeyStatus])

  const handleClose = useCallback(() => {
    closeModal('settings')
    // Reset state
    setApiKeyInputs({ elevenlabs: '', anthropic: '' })
    setShowKeys({ elevenlabs: false, anthropic: false })
    setActiveTab('apiKeys')
  }, [closeModal])

  const handleSaveApiKey = useCallback(
    async (keyType: 'elevenlabs' | 'anthropic') => {
      const apiKeyType =
        keyType === 'elevenlabs' ? API_KEY_TYPES.ELEVENLABS : API_KEY_TYPES.ANTHROPIC
      const value = apiKeyInputs[keyType]

      if (!value.trim()) {
        addToast('error', 'Please enter an API key')
        return
      }

      setIsLoading(true)
      try {
        const result = await window.dubdesk.settings.setApiKey(apiKeyType, value.trim())

        if (result.success) {
          addToast(
            'success',
            `${keyType === 'elevenlabs' ? 'ElevenLabs' : 'Anthropic'} API key saved`
          )
          setApiKeyInputs((prev) => ({ ...prev, [keyType]: '' }))
          await loadApiKeyStatus()
        } else {
          addToast('error', result.error || 'Failed to save API key')
        }
      } catch (error) {
        console.error('Failed to save API key:', error)
        addToast('error', 'Failed to save API key')
      } finally {
        setIsLoading(false)
      }
    },
    [apiKeyInputs, addToast, loadApiKeyStatus]
  )

  const handleDeleteApiKey = useCallback(
    async (keyType: 'elevenlabs' | 'anthropic') => {
      const apiKeyType =
        keyType === 'elevenlabs' ? API_KEY_TYPES.ELEVENLABS : API_KEY_TYPES.ANTHROPIC

      setIsLoading(true)
      try {
        const result = await window.dubdesk.settings.deleteApiKey(apiKeyType)

        if (result.success) {
          addToast(
            'success',
            `${keyType === 'elevenlabs' ? 'ElevenLabs' : 'Anthropic'} API key deleted`
          )
          await loadApiKeyStatus()
        } else {
          addToast('error', result.error || 'Failed to delete API key')
        }
      } catch (error) {
        console.error('Failed to delete API key:', error)
        addToast('error', 'Failed to delete API key')
      } finally {
        setIsLoading(false)
      }
    },
    [addToast, loadApiKeyStatus]
  )

  const handleRegionChange = useCallback(
    async (region: ElevenLabsRegion) => {
      try {
        const result = await window.dubdesk.settings.setElevenLabsRegion(region)
        if (result.success) {
          setElevenLabsRegion(region)
          addToast('success', `ElevenLabs region set to ${region.toUpperCase()}`)
        } else {
          addToast('error', result.error || 'Failed to set region')
        }
      } catch (error) {
        console.error('Failed to set region:', error)
        addToast('error', 'Failed to set region')
      }
    },
    [addToast]
  )

  const handleValidateApiKey = useCallback(
    async (keyType: 'elevenlabs' | 'anthropic') => {
      const apiKeyType =
        keyType === 'elevenlabs' ? API_KEY_TYPES.ELEVENLABS : API_KEY_TYPES.ANTHROPIC

      setApiKeyState((prev) => ({
        ...prev,
        [keyType]: { ...prev[keyType], validating: true, valid: undefined }
      }))

      try {
        const result = await window.dubdesk.settings.validateApiKey(apiKeyType)

        if (result.success) {
          setApiKeyState((prev) => ({
            ...prev,
            [keyType]: { ...prev[keyType], validating: false, valid: result.valid }
          }))

          if (result.valid) {
            addToast(
              'success',
              `${keyType === 'elevenlabs' ? 'ElevenLabs' : 'Anthropic'} API key is valid`
            )
          } else {
            addToast('error', result.error || 'API key is invalid')
          }
        } else {
          setApiKeyState((prev) => ({
            ...prev,
            [keyType]: { ...prev[keyType], validating: false }
          }))
          addToast('error', result.error || 'Failed to validate API key')
        }
      } catch (error) {
        console.error('Failed to validate API key:', error)
        setApiKeyState((prev) => ({
          ...prev,
          [keyType]: { ...prev[keyType], validating: false }
        }))
        addToast('error', 'Failed to validate API key')
      }
    },
    [addToast]
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70">
      <div className="bg-chrome-surface border border-chrome-border rounded-lg shadow-xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-chrome-border">
          <h2 className="text-lg font-medium">Settings</h2>
          <button
            onClick={handleClose}
            className="text-chrome-muted hover:text-chrome-text"
            type="button"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-chrome-border">
          <button
            type="button"
            onClick={() => setActiveTab('apiKeys')}
            className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'apiKeys'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-chrome-muted hover:text-chrome-text'
            }`}
          >
            API Keys
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'general'
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-chrome-muted hover:text-chrome-text'
            }`}
          >
            General
          </button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[400px]">
          {activeTab === 'apiKeys' && (
            <div className="space-y-6">
              <p className="text-sm text-chrome-muted">
                API keys are stored securely in your system's keychain. They are never sent to our
                servers.
              </p>

              {/* ElevenLabs API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">ElevenLabs API Key</label>
                  {apiKeyState.elevenlabs.exists && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        apiKeyState.elevenlabs.valid === true
                          ? 'bg-green-500/20 text-green-400'
                          : apiKeyState.elevenlabs.valid === false
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-chrome-hover text-chrome-muted'
                      }`}
                    >
                      {apiKeyState.elevenlabs.validating
                        ? 'Validating...'
                        : apiKeyState.elevenlabs.valid === true
                          ? 'Valid'
                          : apiKeyState.elevenlabs.valid === false
                            ? 'Invalid'
                            : 'Configured'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-chrome-muted">
                  Used for speech-to-text transcription and text-to-speech generation.{' '}
                  <a
                    href="https://elevenlabs.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    Get an API key
                  </a>
                </p>

                {apiKeyState.elevenlabs.exists ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 bg-chrome-bg border border-chrome-border rounded text-sm text-chrome-muted font-mono">
                      {showKeys.elevenlabs ? apiKeyState.elevenlabs.masked : '••••••••••••••••'}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setShowKeys((prev) => ({ ...prev, elevenlabs: !prev.elevenlabs }))
                      }
                      className="px-3 py-2 text-sm bg-chrome-hover rounded hover:bg-chrome-active"
                    >
                      {showKeys.elevenlabs ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleValidateApiKey('elevenlabs')}
                      disabled={apiKeyState.elevenlabs.validating || isLoading}
                      className="px-3 py-2 text-sm bg-chrome-hover rounded hover:bg-chrome-active disabled:opacity-50"
                    >
                      {apiKeyState.elevenlabs.validating ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteApiKey('elevenlabs')}
                      disabled={isLoading}
                      className="px-3 py-2 text-sm text-red-400 bg-red-500/10 rounded hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={apiKeyInputs.elevenlabs}
                      onChange={(e) =>
                        setApiKeyInputs((prev) => ({ ...prev, elevenlabs: e.target.value }))
                      }
                      placeholder="sk-..."
                      className="flex-1 px-3 py-2 bg-chrome-bg border border-chrome-border rounded focus:outline-none focus:border-accent-primary text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveApiKey('elevenlabs')}
                      disabled={isLoading || !apiKeyInputs.elevenlabs.trim()}
                      className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded text-sm disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                )}

                {/* ElevenLabs Region */}
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-sm text-chrome-muted">Region:</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRegionChange('us')}
                      className={`px-3 py-1.5 text-sm rounded ${
                        elevenLabsRegion === 'us'
                          ? 'bg-accent-primary text-white'
                          : 'bg-chrome-hover text-chrome-muted hover:text-chrome-text'
                      }`}
                    >
                      US
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegionChange('eu')}
                      className={`px-3 py-1.5 text-sm rounded ${
                        elevenLabsRegion === 'eu'
                          ? 'bg-accent-primary text-white'
                          : 'bg-chrome-hover text-chrome-muted hover:text-chrome-text'
                      }`}
                    >
                      EU
                    </button>
                  </div>
                  <span className="text-xs text-chrome-muted">
                    (Auto-detected from API key suffix)
                  </span>
                </div>
              </div>

              {/* Anthropic API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Anthropic API Key</label>
                  {apiKeyState.anthropic.exists && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        apiKeyState.anthropic.valid === true
                          ? 'bg-green-500/20 text-green-400'
                          : apiKeyState.anthropic.valid === false
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-chrome-hover text-chrome-muted'
                      }`}
                    >
                      {apiKeyState.anthropic.validating
                        ? 'Validating...'
                        : apiKeyState.anthropic.valid === true
                          ? 'Valid'
                          : apiKeyState.anthropic.valid === false
                            ? 'Invalid'
                            : 'Configured'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-chrome-muted">
                  Used for AI-powered translation with Claude.{' '}
                  <a
                    href="https://console.anthropic.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    Get an API key
                  </a>
                </p>

                {apiKeyState.anthropic.exists ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 bg-chrome-bg border border-chrome-border rounded text-sm text-chrome-muted font-mono">
                      {showKeys.anthropic ? apiKeyState.anthropic.masked : '••••••••••••••••'}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setShowKeys((prev) => ({ ...prev, anthropic: !prev.anthropic }))
                      }
                      className="px-3 py-2 text-sm bg-chrome-hover rounded hover:bg-chrome-active"
                    >
                      {showKeys.anthropic ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleValidateApiKey('anthropic')}
                      disabled={apiKeyState.anthropic.validating || isLoading}
                      className="px-3 py-2 text-sm bg-chrome-hover rounded hover:bg-chrome-active disabled:opacity-50"
                    >
                      {apiKeyState.anthropic.validating ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteApiKey('anthropic')}
                      disabled={isLoading}
                      className="px-3 py-2 text-sm text-red-400 bg-red-500/10 rounded hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={apiKeyInputs.anthropic}
                      onChange={(e) =>
                        setApiKeyInputs((prev) => ({ ...prev, anthropic: e.target.value }))
                      }
                      placeholder="sk-ant-..."
                      className="flex-1 px-3 py-2 bg-chrome-bg border border-chrome-border rounded focus:outline-none focus:border-accent-primary text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveApiKey('anthropic')}
                      disabled={isLoading || !apiKeyInputs.anthropic.trim()}
                      className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded text-sm disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-6">
              <p className="text-chrome-muted">General settings coming soon.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-chrome-border">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-chrome-muted hover:text-chrome-text"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
