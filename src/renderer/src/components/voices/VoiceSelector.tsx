/**
 * Voice Selector
 * Dropdown component for selecting ElevenLabs voices
 */

import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { VoicePreviewButton } from './VoicePreviewButton'

interface Voice {
  voice_id: string
  name: string
  category?: string
  description?: string
  preview_url?: string
  labels?: Record<string, string>
}

interface VoiceSelectorProps {
  value?: string
  onChange: (voiceId: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  compact?: boolean
}

type VoiceCategory = 'premade' | 'cloned' | 'professional' | 'other'

const CATEGORY_LABELS: Record<VoiceCategory, string> = {
  premade: 'Premade Voices',
  cloned: 'Cloned Voices',
  professional: 'Professional Voices',
  other: 'Other Voices'
}

const CATEGORY_ORDER: VoiceCategory[] = ['premade', 'cloned', 'professional', 'other']

export function VoiceSelector({
  value,
  onChange,
  placeholder = 'Select voice...',
  disabled = false,
  className = '',
  compact = false
}: VoiceSelectorProps): React.JSX.Element {
  const [voices, setVoices] = useState<Voice[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  // Fetch voices on mount
  useEffect(() => {
    const fetchVoices = async (): Promise<void> => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await window.dubdesk.tts.getVoices()
        if (result.success && result.data) {
          setVoices(result.data)
        } else {
          setError(result.error || 'Failed to load voices')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load voices')
      } finally {
        setIsLoading(false)
      }
    }

    fetchVoices()
  }, [])

  // Group voices by category
  const groupedVoices = useMemo(() => {
    const groups: Record<VoiceCategory, Voice[]> = {
      premade: [],
      cloned: [],
      professional: [],
      other: []
    }

    for (const voice of voices) {
      const category = voice.category?.toLowerCase() || 'other'
      if (category === 'premade' || category === 'cloned' || category === 'professional') {
        groups[category].push(voice)
      } else {
        groups.other.push(voice)
      }
    }

    return groups
  }, [voices])

  // Get selected voice
  const selectedVoice = useMemo(() => voices.find((v) => v.voice_id === value), [voices, value])

  const handleSelect = useCallback(
    (voiceId: string) => {
      onChange(voiceId)
      setIsOpen(false)
    },
    [onChange]
  )

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev)
    }
  }, [disabled])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (!target.closest('.voice-selector')) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div className={`voice-selector relative ${className}`}>
      {/* Selected Value / Trigger */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled || isLoading}
        className={`
          w-full flex items-center justify-between gap-1.5
          bg-chrome-bg border border-chrome-border rounded text-left
          ${compact ? 'px-1.5 py-1 text-xs' : 'px-3 py-2 text-sm'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-chrome-hover cursor-pointer'}
        `}
      >
        {isLoading ? (
          <span className="text-chrome-muted">{compact ? 'Loading...' : 'Loading voices...'}</span>
        ) : error ? (
          <span className="text-red-400 truncate">{compact ? 'Error' : error}</span>
        ) : selectedVoice ? (
          <span className="truncate">{selectedVoice.name}</span>
        ) : (
          <span className="text-chrome-muted truncate">{compact ? 'Select...' : placeholder}</span>
        )}
        <svg
          className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-chrome-muted transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && !isLoading && !error && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-chrome-surface border border-chrome-border rounded shadow-lg">
          {CATEGORY_ORDER.map((category) => {
            const categoryVoices = groupedVoices[category]
            if (categoryVoices.length === 0) return null

            return (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs font-medium text-chrome-muted bg-chrome-bg sticky top-0">
                  {CATEGORY_LABELS[category]}
                </div>
                {categoryVoices.map((voice) => (
                  <div
                    key={voice.voice_id}
                    className={`
                      flex items-center justify-between px-3 py-2 cursor-pointer
                      ${voice.voice_id === value ? 'bg-accent-primary/20' : 'hover:bg-chrome-hover'}
                    `}
                    onClick={() => handleSelect(voice.voice_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{voice.name}</div>
                      {voice.description && (
                        <div className="text-xs text-chrome-muted truncate">
                          {voice.description}
                        </div>
                      )}
                    </div>
                    <VoicePreviewButton
                      previewUrl={voice.preview_url}
                      voiceName={voice.name}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
