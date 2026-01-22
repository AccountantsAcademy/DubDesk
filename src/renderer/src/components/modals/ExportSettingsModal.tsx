/**
 * Export Settings Modal
 * Pre-export dialog for configuring output settings
 */

import { useProjectStore } from '@renderer/stores/project.store'
import { useUIStore } from '@renderer/stores/ui.store'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

type VideoFormat = 'mp4' | 'mkv' | 'mov'
type AudioFormat = 'm4a' | 'mp3' | 'wav' | 'flac'
type ExportFormat = VideoFormat | AudioFormat
type QualityPreset = 'low' | 'medium' | 'high' | 'custom'

export interface ExportSettings {
  format: ExportFormat
  quality: QualityPreset
  originalVolume: number
  dubbedVolume: number
}

const VIDEO_FORMAT_OPTIONS: Array<{ value: VideoFormat; label: string; description: string }> = [
  { value: 'mp4', label: 'MP4', description: 'Most compatible, recommended' },
  { value: 'mkv', label: 'MKV', description: 'Better quality, archiving' },
  { value: 'mov', label: 'MOV', description: 'Apple devices, Final Cut' }
]

const AUDIO_FORMAT_OPTIONS: Array<{ value: AudioFormat; label: string; description: string }> = [
  { value: 'm4a', label: 'M4A', description: 'AAC, good quality & size' },
  { value: 'mp3', label: 'MP3', description: 'Universal compatibility' },
  { value: 'wav', label: 'WAV', description: 'Lossless, large files' },
  { value: 'flac', label: 'FLAC', description: 'Lossless, compressed' }
]

const QUALITY_OPTIONS: Array<{ value: QualityPreset; label: string; description: string }> = [
  { value: 'low', label: 'Low', description: 'Smaller file, faster export' },
  { value: 'medium', label: 'Medium', description: 'Balanced quality and size' },
  { value: 'high', label: 'High', description: 'Best quality, larger file' },
  { value: 'custom', label: 'Custom', description: 'Advanced settings' }
]

export function ExportSettingsModal(): React.JSX.Element | null {
  const isOpen = useUIStore((state) => state.modals.exportSettings.isOpen)
  const modalData = useUIStore((state) => state.modals.exportSettings.data)
  const closeModal = useUIStore((state) => state.closeModal)
  const currentProject = useProjectStore((state) => state.currentProject)

  const isAudioOnly = modalData?.mode === 'audio-only'

  const [settings, setSettings] = useState<ExportSettings>({
    format: 'mp4',
    quality: 'medium',
    originalVolume: 0.3,
    dubbedVolume: 1.0
  })

  // Load volume settings from project and set default format based on mode
  useEffect(() => {
    if (isOpen) {
      setSettings((prev) => ({
        ...prev,
        format: isAudioOnly ? 'm4a' : 'mp4',
        originalVolume: currentProject?.settings?.originalAudioVolume ?? 0.3,
        dubbedVolume: currentProject?.settings?.dubbedAudioVolume ?? 1.0
      }))
    }
  }, [isOpen, currentProject, isAudioOnly])

  const handleClose = useCallback(() => {
    closeModal('exportSettings')
  }, [closeModal])

  const handleExport = useCallback(() => {
    // Call the onExport callback with settings if provided
    const onExport = modalData?.onExport as ((settings: ExportSettings) => void) | undefined
    if (onExport) {
      onExport(settings)
    }
    closeModal('exportSettings')
  }, [settings, modalData, closeModal])

  const updateSetting = <K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ): void => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-chrome-surface border border-chrome-border rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-chrome-border">
          <h2 className="text-lg font-medium">
            {isAudioOnly ? 'Export Audio Settings' : 'Export Video Settings'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-chrome-muted hover:text-chrome-text"
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

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Format Selection */}
          <div>
            <label className="block text-sm text-chrome-muted mb-2">Output Format</label>
            <div className={`grid gap-2 ${isAudioOnly ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {(isAudioOnly ? AUDIO_FORMAT_OPTIONS : VIDEO_FORMAT_OPTIONS).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateSetting('format', option.value)}
                  className={`
                    p-3 rounded border text-center transition-colors
                    ${
                      settings.format === option.value
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-chrome-border hover:border-chrome-hover'
                    }
                  `}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-chrome-muted">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quality Selection - only for video export */}
          {!isAudioOnly && (
            <div>
              <label className="block text-sm text-chrome-muted mb-2">Quality</label>
              <div className="grid grid-cols-4 gap-2">
                {QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateSetting('quality', option.value)}
                    className={`
                      p-2 rounded border text-center transition-colors
                      ${
                        settings.quality === option.value
                          ? 'border-accent-primary bg-accent-primary/10'
                          : 'border-chrome-border hover:border-chrome-hover'
                      }
                    `}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Volume Settings */}
          <div className="space-y-3 pt-2 border-t border-chrome-border">
            <label className="block text-sm text-chrome-muted">Audio Volume Levels</label>

            {/* Original Audio Volume */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-chrome-muted">Original Audio (in gaps)</span>
                <span className="text-chrome-text">
                  {Math.round(settings.originalVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={settings.originalVolume * 100}
                onChange={(e) => updateSetting('originalVolume', Number(e.target.value) / 100)}
                className="w-full h-1.5 bg-chrome-bg rounded-lg appearance-none cursor-pointer accent-accent-primary"
              />
            </div>

            {/* Dubbed Audio Volume */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-chrome-muted">Dubbed Audio (generated)</span>
                <span className="text-chrome-text">{Math.round(settings.dubbedVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={settings.dubbedVolume * 100}
                onChange={(e) => updateSetting('dubbedVolume', Number(e.target.value) / 100)}
                className="w-full h-1.5 bg-chrome-bg rounded-lg appearance-none cursor-pointer accent-accent-primary"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-chrome-border">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm bg-chrome-hover hover:bg-chrome-active rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="px-4 py-2 text-sm bg-accent-primary hover:bg-accent-primary-hover text-white rounded"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  )
}
