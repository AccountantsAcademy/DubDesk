import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useProjectStore } from '@renderer/stores/project.store'
import { useQuickDubStore } from '@renderer/stores/quickdub.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import { selectIsModalOpen, selectModalData, useUIStore } from '@renderer/stores/ui.store'
import type React from 'react'
import { useCallback, useEffect } from 'react'

export function QuickDubModal(): React.JSX.Element | null {
  const isOpen = useUIStore(selectIsModalOpen('quickDub'))
  const modalData = useUIStore(selectModalData('quickDub'))
  const closeModal = useUIStore((state) => state.closeModal)
  const addToast = useUIStore((state) => state.addToast)

  const currentProject = useProjectStore((state) => state.currentProject)
  const loadSegments = useSegmentStore((state) => state.loadSegments)

  const {
    step,
    rangeStartMs,
    rangeEndMs,
    transcribedText,
    editedText,
    skipLipsync,
    error,
    startQuickDub,
    setEditedText,
    setSkipLipsync,
    generateAudio,
    cancel,
    reset
  } = useQuickDubStore()

  const clearRange = useTimelineStore((state) => state.clearRange)
  const setRangeSelectionMode = useTimelineStore((state) => state.setRangeSelectionMode)

  // Start transcription when modal opens with range data
  useEffect(() => {
    if (isOpen && modalData && step === 'idle' && currentProject) {
      const startMs = modalData.rangeStartMs as number
      const endMs = modalData.rangeEndMs as number
      const audioPath = currentProject.sourceAudioPath || currentProject.sourceVideoPath

      startQuickDub(startMs, endMs, currentProject.id, audioPath, currentProject.sourceLanguage)
    }
  }, [isOpen, modalData, step, currentProject, startQuickDub])

  const handleClose = useCallback(() => {
    cancel()
    clearRange()
    setRangeSelectionMode(false)
    closeModal('quickDub')
  }, [cancel, clearRange, setRangeSelectionMode, closeModal])

  const handleGenerate = useCallback(async () => {
    if (!currentProject) return
    const audioPath = currentProject.sourceAudioPath || currentProject.sourceVideoPath
    const videoPath = currentProject.sourceVideoPath
    await generateAudio(currentProject.id, audioPath, videoPath, currentProject.name)
  }, [currentProject, generateAudio])

  const handleDone = useCallback(async () => {
    if (currentProject) {
      // Reload segments to include the newly created one
      await loadSegments(currentProject.id)

      // Set volumes based on language: same language = both at 100%, different = 30/100
      const isSameLanguage =
        currentProject.sourceLanguage &&
        currentProject.targetLanguage &&
        currentProject.sourceLanguage === currentProject.targetLanguage
      const { setOriginalAudioVolume, setDubbedAudioVolume } = usePlaybackStore.getState()
      if (isSameLanguage) {
        setOriginalAudioVolume(1.0)
        setDubbedAudioVolume(1.0)
      } else {
        setOriginalAudioVolume(0.3)
        setDubbedAudioVolume(1.0)
      }

      addToast('success', 'Quick Edit segment added to timeline')
    }
    reset()
    clearRange()
    setRangeSelectionMode(false)
    closeModal('quickDub')
  }, [currentProject, loadSegments, addToast, reset, clearRange, setRangeSelectionMode, closeModal])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-chrome-surface border border-chrome-border rounded-xl shadow-2xl w-[480px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chrome-border">
          <div>
            <h2 className="text-base font-semibold">Quick Edit</h2>
            {rangeStartMs !== null && rangeEndMs !== null && (
              <p className="text-xs text-chrome-muted mt-0.5">
                {formatTime(rangeStartMs)} - {formatTime(rangeEndMs)}
                <span className="ml-2 text-chrome-muted/60">
                  ({((rangeEndMs - rangeStartMs) / 1000).toFixed(1)}s)
                </span>
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-chrome-hover text-chrome-muted hover:text-chrome-text"
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
        <div className="px-5 py-4">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-5">
            <StepIndicator
              label="Transcribe"
              active={step === 'transcribing'}
              done={['editing', 'cloning', 'generating', 'lipsyncing', 'complete'].includes(step)}
            />
            <StepConnector />
            <StepIndicator
              label="Edit"
              active={step === 'editing'}
              done={['cloning', 'generating', 'lipsyncing', 'complete'].includes(step)}
            />
            <StepConnector />
            <StepIndicator
              label="Generate"
              active={step === 'cloning' || step === 'generating'}
              done={['lipsyncing', 'complete'].includes(step)}
            />
            <StepConnector />
            <StepIndicator
              label="Lip-Sync"
              active={step === 'lipsyncing'}
              done={step === 'complete'}
            />
          </div>

          {/* Transcribing step */}
          {step === 'transcribing' && (
            <div className="flex flex-col items-center py-8">
              <Spinner />
              <p className="text-sm text-chrome-muted mt-3">Transcribing selected range...</p>
              <p className="text-xs text-chrome-muted/60 mt-1">Extracting and analyzing audio</p>
            </div>
          )}

          {/* Editing step */}
          {step === 'editing' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-chrome-muted mb-1.5">
                  Transcribed text (edit below)
                </label>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full px-3 py-2 bg-chrome-bg border border-chrome-border rounded-lg text-sm resize-none focus:outline-none focus:border-accent-primary"
                  rows={5}
                  placeholder="Enter text to dub..."
                />
                {transcribedText !== editedText && (
                  <p className="text-[10px] text-accent-primary mt-1">Modified from original</p>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-chrome-muted cursor-pointer hover:text-chrome-text">
                <input
                  type="checkbox"
                  checked={skipLipsync}
                  onChange={(e) => setSkipLipsync(e.target.checked)}
                  className="w-3 h-3 rounded border-chrome-border bg-chrome-bg accent-accent-primary"
                />
                Skip lip-sync (audio only)
              </label>

              <button
                onClick={handleGenerate}
                disabled={!editedText.trim()}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  editedText.trim()
                    ? 'bg-accent-primary hover:bg-accent-primary-hover text-white'
                    : 'bg-chrome-hover text-chrome-muted cursor-not-allowed'
                }`}
              >
                Clone Voice & Generate Audio
              </button>
            </div>
          )}

          {/* Cloning step */}
          {step === 'cloning' && (
            <div className="flex flex-col items-center py-8">
              <Spinner />
              <p className="text-sm text-chrome-muted mt-3">Cloning voice from video...</p>
              <p className="text-xs text-chrome-muted/60 mt-1">
                This may take a moment on first use (cached afterward)
              </p>
            </div>
          )}

          {/* Generating step */}
          {step === 'generating' && (
            <div className="flex flex-col items-center py-8">
              <Spinner />
              <p className="text-sm text-chrome-muted mt-3">Generating dubbed audio...</p>
              <p className="text-xs text-chrome-muted/60 mt-1">
                Synthesizing speech with cloned voice
              </p>
            </div>
          )}

          {/* Lip-syncing step */}
          {step === 'lipsyncing' && (
            <div className="flex flex-col items-center py-8">
              <Spinner />
              <p className="text-sm text-chrome-muted mt-3">Lip-syncing video...</p>
              <p className="text-xs text-chrome-muted/60 mt-1">
                Matching lip movements to new audio (this may take a minute)
              </p>
              <button
                onClick={() => useQuickDubStore.setState({ step: 'complete', isProcessing: false })}
                className="mt-4 px-4 py-1.5 text-xs text-chrome-muted hover:text-chrome-text bg-chrome-hover hover:bg-chrome-active rounded transition-colors"
              >
                Skip lip-sync
              </button>
            </div>
          )}

          {/* Complete step */}
          {step === 'complete' && (
            <div className="flex flex-col items-center py-6">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                <svg
                  className="w-6 h-6 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium mb-1">Quick Edit Complete</p>
              <p className="text-xs text-chrome-muted mb-4">
                The dubbed segment has been added to your timeline.
              </p>
              <button
                onClick={handleDone}
                className="px-6 py-2 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Error step */}
          {step === 'error' && (
            <div className="flex flex-col items-center py-6">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
                <svg
                  className="w-6 h-6 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-red-400 mb-1">Something went wrong</p>
              <p className="text-xs text-chrome-muted mb-4 text-center max-w-sm">{error}</p>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-chrome-hover hover:bg-chrome-active text-chrome-text rounded-lg text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StepIndicator({
  label,
  active,
  done
}: {
  label: string
  active: boolean
  done: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors ${
          done
            ? 'bg-green-500 text-white'
            : active
              ? 'bg-accent-primary text-white'
              : 'bg-chrome-hover text-chrome-muted'
        }`}
      >
        {done ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </div>
      <span
        className={`text-xs ${active ? 'text-chrome-text font-medium' : done ? 'text-green-500' : 'text-chrome-muted'}`}
      >
        {label}
      </span>
    </div>
  )
}

function StepConnector(): React.JSX.Element {
  return <div className="flex-1 h-px bg-chrome-border" />
}

function Spinner(): React.JSX.Element {
  return (
    <svg className="w-8 h-8 animate-spin text-accent-primary" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}
