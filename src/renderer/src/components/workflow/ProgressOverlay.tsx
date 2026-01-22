import type React from 'react'
import { useCallback } from 'react'

interface ProgressOverlayProps {
  isOpen: boolean
  stage: string
  progress: number
  message: string
  onCancel?: () => void
  canCancel?: boolean
}

export function ProgressOverlay({
  isOpen,
  stage,
  progress,
  message,
  onCancel,
  canCancel = true
}: ProgressOverlayProps): React.JSX.Element | null {
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel()
    }
  }, [onCancel])

  if (!isOpen) return null

  const stageLabels: Record<string, string> = {
    transcribing: 'Transcribing Audio',
    translating: 'Translating Text',
    generating: 'Generating Speech',
    exporting: 'Exporting Video'
  }

  const stageLabel = stageLabels[stage] || stage

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-chrome-surface border border-chrome-border rounded-lg shadow-xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-accent-primary animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-medium">{stageLabel}</h3>
            <p className="text-sm text-chrome-muted">{message}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-chrome-muted">Progress</span>
            <span className="text-chrome-text">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-chrome-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stage indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <StageIndicator
            label="Transcribe"
            active={stage === 'transcribing'}
            completed={['translating', 'generating', 'exporting'].includes(stage)}
          />
          <div className="w-8 h-px bg-chrome-border" />
          <StageIndicator
            label="Translate"
            active={stage === 'translating'}
            completed={['generating', 'exporting'].includes(stage)}
          />
          <div className="w-8 h-px bg-chrome-border" />
          <StageIndicator
            label="Generate"
            active={stage === 'generating'}
            completed={['exporting'].includes(stage)}
          />
          <div className="w-8 h-px bg-chrome-border" />
          <StageIndicator label="Export" active={stage === 'exporting'} completed={false} />
        </div>

        {/* Cancel button */}
        {canCancel && onCancel && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-chrome-muted hover:text-chrome-text hover:bg-chrome-hover rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface StageIndicatorProps {
  label: string
  active: boolean
  completed: boolean
}

function StageIndicator({ label, active, completed }: StageIndicatorProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`
          w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
          ${
            active
              ? 'bg-accent-primary text-white'
              : completed
                ? 'bg-green-500 text-white'
                : 'bg-chrome-hover text-chrome-muted'
          }
        `}
      >
        {completed ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : active ? (
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
        ) : null}
      </div>
      <span className={`text-xs ${active ? 'text-accent-primary' : 'text-chrome-muted'}`}>
        {label}
      </span>
    </div>
  )
}
