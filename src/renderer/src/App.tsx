import { SUPPORTED_LANGUAGES } from '@shared/constants/defaults'
import type { Segment, Speaker } from '@shared/types/segment'
import { useEffect, useMemo, useState } from 'react'
import { DubbedAudioPlayer, SegmentAudioPlayer } from './components/audio'
import {
  ExportSettingsModal,
  NewProjectModal,
  SettingsModal,
  SpeakerManagerModal
} from './components/modals'
import { Timeline } from './components/timeline'
import { ToastContainer } from './components/ui'
import { VideoPlayer } from './components/video'
import { VoiceSelector } from './components/voices'
import { WorkflowToolbar } from './components/workflow/WorkflowToolbar'
import { useKeyboardShortcuts } from './hooks'
import {
  isSegmentStale,
  selectStaleSegmentCount,
  useHistoryStore,
  usePlaybackStore,
  useProjectStore,
  useSegmentStore,
  useTimelineStore,
  useUIStore
} from './stores'

// Helper to get language name from code
function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name || code.toUpperCase()
}

function App(): React.JSX.Element {
  const loadRecentProjects = useProjectStore((state) => state.loadRecentProjects)
  const currentProject = useProjectStore((state) => state.currentProject)
  const addToast = useUIStore((state) => state.addToast)

  useEffect(() => {
    loadRecentProjects().catch((error) => {
      console.error('Failed to load recent projects:', error)
      addToast('error', 'Failed to load recent projects')
    })
  }, [loadRecentProjects, addToast])

  return (
    <div className="h-screen w-screen bg-chrome-bg text-chrome-text flex flex-col overflow-hidden">
      {currentProject ? <EditorView /> : <WelcomeView />}
      {/* Global Modals */}
      <NewProjectModal />
      <SettingsModal />
      <SpeakerManagerModal />
      <ExportSettingsModal />
      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  )
}

function WelcomeView(): React.JSX.Element {
  const recentProjects = useProjectStore((state) => state.recentProjects)
  const loadProject = useProjectStore((state) => state.loadProject)
  const openModal = useUIStore((state) => state.openModal)

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-2">DubDesk</h1>
      <p className="text-chrome-muted mb-8">AI-Powered Video Dubbing</p>

      <div className="flex gap-4 mb-12">
        <button
          onClick={() => openModal('newProject')}
          className="px-6 py-3 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg font-medium transition-colors"
        >
          New Project
        </button>
        <button
          onClick={() => openModal('openProject')}
          className="px-6 py-3 bg-chrome-surface hover:bg-chrome-hover border border-chrome-border rounded-lg font-medium transition-colors"
        >
          Open Project
        </button>
      </div>

      {recentProjects.length > 0 && (
        <div className="w-full max-w-md">
          <h2 className="text-lg font-medium mb-4">Recent Projects</h2>
          <div className="space-y-2">
            {recentProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => loadProject(project.id)}
                className="w-full p-4 bg-chrome-surface hover:bg-chrome-hover border border-chrome-border rounded-lg text-left transition-colors"
              >
                <div className="font-medium">{project.name}</div>
                <div className="text-sm text-chrome-muted truncate">{project.sourceVideoPath}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Check if running on macOS for traffic light padding
const isMac = navigator.platform.toLowerCase().includes('mac')

function EditorView(): React.JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const loadSegments = useSegmentStore((state) => state.loadSegments)
  const loadSpeakers = useSegmentStore((state) => state.loadSpeakers)
  const setDuration = usePlaybackStore((state) => state.setDuration)
  const selectedSegmentIds = useSegmentStore((state) => state.selectedSegmentIds)
  const segments = useSegmentStore((state) => state.segments)
  const openModal = useUIStore((state) => state.openModal)

  // History store for undo/redo
  const canUndo = useHistoryStore((state) => state.canUndo)
  const canRedo = useHistoryStore((state) => state.canRedo)
  const undo = useHistoryStore((state) => state.undo)
  const redo = useHistoryStore((state) => state.redo)
  const refreshHistoryState = useHistoryStore((state) => state.refreshState)

  // Load segments and speakers when project changes
  useEffect(() => {
    if (currentProject) {
      loadSegments(currentProject.id).catch(console.error)
      loadSpeakers(currentProject.id).catch(console.error)
      refreshHistoryState().catch(console.error)
      if (currentProject.sourceVideoDurationMs) {
        setDuration(currentProject.sourceVideoDurationMs)
      }
    }
  }, [currentProject, loadSegments, loadSpeakers, setDuration, refreshHistoryState])

  // Get selected segment(s) for properties panel
  const selectedSegment =
    selectedSegmentIds.size === 1 ? segments.find((s) => selectedSegmentIds.has(s.id)) : null
  const selectedSegments =
    selectedSegmentIds.size > 1
      ? segments
          .filter((s) => selectedSegmentIds.has(s.id))
          .sort((a, b) => a.startTimeMs - b.startTimeMs)
      : []

  // Enable keyboard shortcuts
  useKeyboardShortcuts({ enabled: true })

  // Listen for menu undo/redo events from main process
  useEffect(() => {
    // These may not be available if preload hasn't been rebuilt
    const unsubUndo = window.dubdesk.onMenuUndo?.(() => {
      useHistoryStore.getState().undo()
    })
    const unsubRedo = window.dubdesk.onMenuRedo?.(() => {
      useHistoryStore.getState().redo()
    })
    const unsubSelectAll = window.dubdesk.onMenuSelectAll?.(() => {
      useSegmentStore.getState().selectAll()
    })
    return () => {
      unsubUndo?.()
      unsubRedo?.()
      unsubSelectAll?.()
    }
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header - extra left padding on macOS for traffic lights */}
      <header
        className={`h-12 bg-chrome-surface border-b border-chrome-border flex items-center pr-4 gap-4 ${isMac ? 'pl-20' : 'pl-4'}`}
      >
        <button
          className="text-chrome-muted hover:text-chrome-text"
          title="Back to projects"
          onClick={() => useProjectStore.getState().closeProject()}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </button>
        <span className="font-medium">{currentProject?.name}</span>
        {currentProject?.sourceLanguage && currentProject?.targetLanguage && (
          <span className="text-sm text-chrome-muted">
            {getLanguageName(currentProject.sourceLanguage)} →{' '}
            {getLanguageName(currentProject.targetLanguage)}
          </span>
        )}

        {/* Undo/Redo Buttons */}
        <div className="flex items-center gap-1 ml-4">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 text-chrome-muted hover:text-chrome-text disabled:opacity-30 disabled:cursor-not-allowed rounded hover:bg-chrome-hover"
            title="Undo (Cmd+Z)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 text-chrome-muted hover:text-chrome-text disabled:opacity-30 disabled:cursor-not-allowed rounded hover:bg-chrome-hover"
            title="Redo (Cmd+Shift+Z)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1" />
        <button
          onClick={() => openModal('settings')}
          className="px-3 py-1.5 text-sm bg-chrome-hover hover:bg-chrome-active rounded"
          title="Project settings"
        >
          Settings
        </button>
      </header>

      {/* Workflow Toolbar */}
      <WorkflowToolbar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Video Preview Area */}
        <div className="flex-1 bg-chrome-deep min-w-0 h-full">
          <VideoPlayer />
        </div>

        {/* Right Panel - Properties */}
        <aside className="w-72 bg-chrome-surface border-l border-chrome-border overflow-y-auto">
          <div className="p-3">
            <h3 className="text-sm font-medium mb-2">Properties</h3>
            {selectedSegment ? (
              <SegmentProperties segment={selectedSegment} />
            ) : selectedSegments.length > 1 ? (
              <MultiSegmentProperties segments={selectedSegments} allSegments={segments} />
            ) : (
              <ProjectOverview />
            )}
          </div>
        </aside>
      </div>

      {/* Timeline */}
      <Timeline />

      {/* Dubbed Audio Player - handles playback of generated segment audio */}
      <DubbedAudioPlayer />
    </div>
  )
}

/**
 * Check if segments are consecutive (no gaps between them)
 */
function areSegmentsConsecutive(selectedSegments: Segment[], allSegments: Segment[]): boolean {
  if (selectedSegments.length < 2) return false

  // Sort selected segments by start time
  const sorted = [...selectedSegments].sort((a, b) => a.startTimeMs - b.startTimeMs)

  // Get all segments sorted by start time
  const allSorted = [...allSegments].sort((a, b) => a.startTimeMs - b.startTimeMs)

  // Find indices of selected segments in the full list
  const indices = sorted.map((s) => allSorted.findIndex((as) => as.id === s.id))

  // Check if indices are consecutive
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) {
      return false
    }
  }

  return true
}

// Multi-segment properties panel (when 2+ segments selected)
function MultiSegmentProperties({
  segments: selectedSegments,
  allSegments
}: {
  segments: Segment[]
  allSegments: Segment[]
}): React.JSX.Element {
  const batchUpdateSegments = useSegmentStore((state) => state.batchUpdateSegments)
  const mergeSegments = useSegmentStore((state) => state.mergeSegments)
  const regenerateSegmentAudio = useSegmentStore((state) => state.regenerateSegmentAudio)
  const speakers = useSegmentStore((state) => state.speakers)
  const addToast = useUIStore((state) => state.addToast)

  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 })

  const canMerge = areSegmentsConsecutive(selectedSegments, allSegments)
  const segmentsWithText = selectedSegments.filter((s) => s.translatedText?.trim())

  // Handle batch generate audio
  const handleBatchGenerate = async () => {
    if (segmentsWithText.length === 0) {
      addToast('error', 'No segments with translated text to generate')
      return
    }

    setIsGenerating(true)
    setGenerationProgress({ current: 0, total: segmentsWithText.length })

    try {
      for (let i = 0; i < segmentsWithText.length; i++) {
        const segment = segmentsWithText[i]
        // Check if segment has a voice (from segment, speaker, or selected)
        const speaker = segment.speakerId
          ? speakers.find((s) => s.id === segment.speakerId)
          : undefined
        const voiceId = segment.voiceId || speaker?.defaultVoiceId

        if (!voiceId) {
          addToast(
            'error',
            `Segment at ${(segment.startTimeMs / 1000).toFixed(1)}s has no voice assigned`
          )
          continue
        }

        await regenerateSegmentAudio(segment.id)
        setGenerationProgress({ current: i + 1, total: segmentsWithText.length })
      }
      addToast('success', `Generated audio for ${segmentsWithText.length} segments`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
      setGenerationProgress({ current: 0, total: 0 })
    }
  }

  // Handle apply voice to all selected
  const handleApplyVoice = async () => {
    if (!selectedVoiceId) {
      addToast('error', 'Please select a voice first')
      return
    }

    try {
      const updates = selectedSegments.map((s) => ({
        id: s.id,
        updates: { voiceId: selectedVoiceId }
      }))
      await batchUpdateSegments(updates)
      addToast('success', `Applied voice to ${selectedSegments.length} segments`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to apply voice')
    }
  }

  // Handle merge segments
  const handleMerge = async () => {
    if (!canMerge) {
      addToast('error', 'Can only merge consecutive segments')
      return
    }

    try {
      const ids = selectedSegments.map((s) => s.id)
      await mergeSegments(ids)
      addToast('success', `Merged ${selectedSegments.length} segments`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to merge segments')
    }
  }

  // Calculate combined duration
  const sorted = [...selectedSegments].sort((a, b) => a.startTimeMs - b.startTimeMs)
  const totalDuration = sorted[sorted.length - 1].endTimeMs - sorted[0].startTimeMs

  return (
    <div className="space-y-3">
      {/* Selection Info */}
      <div className="p-2 bg-accent-primary/10 border border-accent-primary/30 rounded text-xs">
        <div className="font-medium text-accent-primary">
          {selectedSegments.length} segments selected
        </div>
        <div className="text-chrome-muted mt-1">
          Total duration: {(totalDuration / 1000).toFixed(2)}s
        </div>
      </div>

      {/* Batch Generate Audio */}
      <div className="space-y-1.5">
        <label className="block text-xs text-chrome-muted">Batch Generate Audio</label>
        <button
          type="button"
          onClick={handleBatchGenerate}
          disabled={isGenerating || segmentsWithText.length === 0}
          className={`
            w-full px-3 py-2 text-xs rounded flex items-center justify-center gap-2 transition-colors
            ${
              isGenerating || segmentsWithText.length === 0
                ? 'bg-chrome-hover text-chrome-muted cursor-not-allowed'
                : 'bg-accent-primary hover:bg-accent-primary-hover text-white'
            }
          `}
        >
          {isGenerating ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
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
              Generating {generationProgress.current}/{generationProgress.total}...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.828"
                />
              </svg>
              Generate Audio ({segmentsWithText.length} segments)
            </>
          )}
        </button>
        {segmentsWithText.length === 0 && (
          <p className="text-[10px] text-chrome-muted">No segments have translated text</p>
        )}
      </div>

      {/* Change Voice */}
      <div className="space-y-1.5">
        <label className="block text-xs text-chrome-muted">Change Voice</label>
        <div className="flex gap-1.5">
          <div className="flex-1">
            <VoiceSelector
              value={selectedVoiceId}
              onChange={setSelectedVoiceId}
              placeholder="Select voice..."
              compact
            />
          </div>
          <button
            type="button"
            onClick={handleApplyVoice}
            disabled={!selectedVoiceId}
            className={`
              px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap
              ${
                !selectedVoiceId
                  ? 'bg-chrome-hover text-chrome-muted cursor-not-allowed'
                  : 'bg-chrome-hover hover:bg-chrome-active text-chrome-text'
              }
            `}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Merge Segments */}
      <div className="space-y-1.5">
        <label className="block text-xs text-chrome-muted">Merge Segments</label>
        <button
          type="button"
          onClick={handleMerge}
          disabled={!canMerge}
          className={`
            w-full px-3 py-2 text-xs rounded flex items-center justify-center gap-2 transition-colors
            ${
              !canMerge
                ? 'bg-chrome-hover text-chrome-muted cursor-not-allowed'
                : 'bg-chrome-hover hover:bg-chrome-active text-chrome-text border border-chrome-border'
            }
          `}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
          Merge {selectedSegments.length} Segments
        </button>
        {!canMerge && (
          <p className="text-[10px] text-chrome-muted">Only consecutive segments can be merged</p>
        )}
      </div>

      {/* Preview of merged content */}
      {canMerge && (
        <div className="space-y-1.5">
          <label className="block text-xs text-chrome-muted">Merge Preview</label>
          <div className="p-2 bg-chrome-bg border border-chrome-border rounded text-[10px] space-y-1">
            <div>
              <span className="text-chrome-muted">Original: </span>
              <span className="text-chrome-text">
                {sorted
                  .map((s) => s.originalText || '')
                  .join(' ')
                  .slice(0, 100)}
                {sorted.map((s) => s.originalText || '').join(' ').length > 100 ? '...' : ''}
              </span>
            </div>
            <div>
              <span className="text-chrome-muted">Translated: </span>
              <span className="text-chrome-text">
                {sorted
                  .map((s) => s.translatedText)
                  .join(' ')
                  .slice(0, 100)}
                {sorted.map((s) => s.translatedText).join(' ').length > 100 ? '...' : ''}
              </span>
            </div>
            <div className="text-chrome-muted">
              Time: {(sorted[0].startTimeMs / 1000).toFixed(2)}s →{' '}
              {(sorted[sorted.length - 1].endTimeMs / 1000).toFixed(2)}s
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Project overview when no segments selected
function ProjectOverview(): React.JSX.Element {
  const staleCount = useSegmentStore(selectStaleSegmentCount)
  const segments = useSegmentStore((state) => state.segments)
  const regenerateAllStaleAudio = useSegmentStore((state) => state.regenerateAllStaleAudio)
  const selectSegment = useSegmentStore((state) => state.selectSegment)
  const scrollToTime = useTimelineStore((state) => state.scrollToTime)
  const addToast = useUIStore((state) => state.addToast)

  // Playback volume controls
  const originalAudioVolume = usePlaybackStore((state) => state.originalAudioVolume)
  const dubbedAudioVolume = usePlaybackStore((state) => state.dubbedAudioVolume)
  const setOriginalAudioVolume = usePlaybackStore((state) => state.setOriginalAudioVolume)
  const setDubbedAudioVolume = usePlaybackStore((state) => state.setDubbedAudioVolume)
  const soloOriginal = usePlaybackStore((state) => state.soloOriginal)
  const soloDubbed = usePlaybackStore((state) => state.soloDubbed)
  const toggleSoloOriginal = usePlaybackStore((state) => state.toggleSoloOriginal)
  const toggleSoloDubbed = usePlaybackStore((state) => state.toggleSoloDubbed)

  const [isRegenerating, setIsRegenerating] = useState(false)

  // Compute stretched segments with useMemo to avoid infinite loops
  // Calculate actual stretch based on audio duration vs segment duration
  const stretchedOrange = useMemo(
    () =>
      segments.filter((s) => {
        if (!s.audioFilePath || !s.audioDurationMs) return false
        const segmentDuration = s.endTimeMs - s.startTimeMs
        const stretchRatio = segmentDuration / s.audioDurationMs
        const stretchPercent = Math.abs(stretchRatio - 1) * 100
        return stretchPercent > 15 && stretchPercent <= 25
      }),
    [segments]
  )

  const stretchedRed = useMemo(
    () =>
      segments.filter((s) => {
        if (!s.audioFilePath || !s.audioDurationMs) return false
        const segmentDuration = s.endTimeMs - s.startTimeMs
        const stretchRatio = segmentDuration / s.audioDurationMs
        const stretchPercent = Math.abs(stretchRatio - 1) * 100
        return stretchPercent > 25
      }),
    [segments]
  )

  const handleRegenerateAll = async () => {
    if (staleCount === 0) return
    setIsRegenerating(true)
    try {
      await regenerateAllStaleAudio()
      addToast('success', `Regenerated ${staleCount} stale segment(s)`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Regeneration failed')
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleSelectAndScroll = (segment: Segment) => {
    selectSegment(segment.id, false) // Select without multi-select
    scrollToTime(segment.startTimeMs)
  }

  const totalSegments = segments.length
  const segmentsWithAudio = segments.filter((s) => s.audioFilePath).length

  return (
    <div className="space-y-4">
      {/* Playback Volume Controls */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-chrome-muted uppercase tracking-wide">
          Playback Mix
        </h4>

        {/* Original Audio Volume */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-chrome-text">Original Audio</label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-chrome-muted w-8 text-right">
                {Math.round(originalAudioVolume * 100)}%
              </span>
              <button
                type="button"
                onClick={toggleSoloOriginal}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                  soloOriginal
                    ? 'bg-accent-primary text-white'
                    : 'bg-chrome-bg text-chrome-muted hover:text-chrome-text'
                }`}
                title="Solo original audio"
              >
                S
              </button>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={originalAudioVolume}
            onChange={(e) => setOriginalAudioVolume(Number(e.target.value))}
            className="w-full h-1.5 bg-chrome-bg rounded-full appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Dubbed Audio Volume */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-chrome-text">Dubbed Audio</label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-chrome-muted w-8 text-right">
                {Math.round(dubbedAudioVolume * 100)}%
              </span>
              <button
                type="button"
                onClick={toggleSoloDubbed}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                  soloDubbed
                    ? 'bg-accent-primary text-white'
                    : 'bg-chrome-bg text-chrome-muted hover:text-chrome-text'
                }`}
                title="Solo dubbed audio"
              >
                S
              </button>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={dubbedAudioVolume}
            onChange={(e) => setDubbedAudioVolume(Number(e.target.value))}
            className="w-full h-1.5 bg-chrome-bg rounded-full appearance-none cursor-pointer accent-orange-500"
          />
        </div>
      </div>

      <hr className="border-chrome-border" />

      {/* Overview stats */}
      <div className="text-xs text-chrome-muted">
        <div className="flex justify-between">
          <span>Total segments:</span>
          <span className="text-chrome-text">{totalSegments}</span>
        </div>
        <div className="flex justify-between">
          <span>With audio:</span>
          <span className="text-chrome-text">{segmentsWithAudio}</span>
        </div>
      </div>

      {/* Stale Segments */}
      {staleCount > 0 && (
        <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs text-yellow-500 font-medium">
              {staleCount} stale segment{staleCount !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRegenerateAll}
            disabled={isRegenerating}
            className="w-full px-2 py-1.5 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded transition-colors disabled:opacity-50"
          >
            {isRegenerating ? 'Regenerating...' : 'Regenerate All Stale'}
          </button>
        </div>
      )}

      {/* Stretched Segments - Red (>25%) */}
      {stretchedRed.length > 0 && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs text-red-500 font-medium">
              {stretchedRed.length} severely stretched ({'>'}25%)
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSelectAndScroll(stretchedRed[0])}
            className="w-full px-2 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded transition-colors"
          >
            Go to First
          </button>
        </div>
      )}

      {/* Stretched Segments - Orange (>15%) */}
      {stretchedOrange.length > 0 && (
        <div className="p-2 bg-orange-500/10 border border-orange-500/30 rounded">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs text-orange-500 font-medium">
              {stretchedOrange.length} stretched ({'>'}15%)
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSelectAndScroll(stretchedOrange[0])}
            className="w-full px-2 py-1.5 text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-500 rounded transition-colors"
          >
            Go to First
          </button>
        </div>
      )}

      {/* All good message */}
      {staleCount === 0 && stretchedRed.length === 0 && stretchedOrange.length === 0 && (
        <div className="p-2 bg-green-500/10 border border-green-500/30 rounded">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs text-green-500 font-medium">All segments are up to date</span>
          </div>
        </div>
      )}

      {/* Tip */}
      <p className="text-[10px] text-chrome-muted">
        Tip: Use <kbd className="px-1 py-0.5 bg-chrome-bg rounded text-[9px]">⌘A</kbd> to select all
        segments
      </p>
    </div>
  )
}

// Enhanced segment properties panel
function SegmentProperties({ segment }: { segment: Segment }): React.JSX.Element {
  const updateSegment = useSegmentStore((state) => state.updateSegment)
  const speakers = useSegmentStore((state) => state.speakers)

  const isStale = isSegmentStale(segment)
  const speaker = speakers.find((s: Speaker) => s.id === segment.speakerId)

  return (
    <div className="space-y-2.5">
      {/* Stale Status Indicator */}
      {isStale && segment.translatedText?.trim() && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs">
          <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-yellow-500">Audio outdated</span>
        </div>
      )}

      {/* Audio Player */}
      <div>
        <label className="block text-xs text-chrome-muted mb-1">Audio</label>
        <SegmentAudioPlayer segment={segment} />
      </div>

      {/* Speaker & Voice in same row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-chrome-muted mb-1">Speaker</label>
          <select
            value={segment.speakerId || ''}
            onChange={(e) => updateSegment(segment.id, { speakerId: e.target.value || undefined })}
            className="w-full px-1.5 py-1 bg-chrome-bg border border-chrome-border rounded text-xs"
          >
            <option value="">None</option>
            {speakers.map((s: Speaker) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-chrome-muted mb-1">Voice</label>
          <VoiceSelector
            value={segment.voiceId || speaker?.defaultVoiceId}
            onChange={(voiceId) => updateSegment(segment.id, { voiceId })}
            compact
          />
        </div>
      </div>
      {speaker && (
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: speaker.color }} />
          <span className="text-[10px] text-chrome-muted">{speaker.name}</span>
          {!segment.voiceId && speaker?.defaultVoiceId && (
            <span className="text-[10px] text-chrome-muted/60 ml-auto">default voice</span>
          )}
        </div>
      )}

      {/* Original Text */}
      <div>
        <label className="block text-xs text-chrome-muted mb-1">Original</label>
        <textarea
          value={segment.originalText || ''}
          onChange={(e) => updateSegment(segment.id, { originalText: e.target.value })}
          className="w-full px-1.5 py-1 bg-chrome-bg border border-chrome-border rounded text-xs resize-none"
          rows={3}
          placeholder="Original text..."
        />
      </div>

      {/* Translated Text */}
      <div>
        <label className="block text-xs text-chrome-muted mb-1">Translated</label>
        <textarea
          value={segment.translatedText}
          onChange={(e) => updateSegment(segment.id, { translatedText: e.target.value })}
          className="w-full px-1.5 py-1 bg-chrome-bg border border-chrome-border rounded text-xs resize-none"
          rows={3}
          placeholder="Translated text..."
        />
      </div>

      {/* Timing */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-chrome-muted mb-1">Start (ms)</label>
          <input
            type="number"
            value={segment.startTimeMs}
            onChange={(e) =>
              updateSegment(segment.id, { startTimeMs: parseInt(e.target.value, 10) || 0 })
            }
            className="w-full px-1.5 py-1 bg-chrome-bg border border-chrome-border rounded text-xs"
          />
        </div>
        <div>
          <label className="block text-xs text-chrome-muted mb-1">End (ms)</label>
          <input
            type="number"
            value={segment.endTimeMs}
            onChange={(e) =>
              updateSegment(segment.id, { endTimeMs: parseInt(e.target.value, 10) || 0 })
            }
            className="w-full px-1.5 py-1 bg-chrome-bg border border-chrome-border rounded text-xs"
          />
        </div>
      </div>

      {/* Duration and Speed */}
      <div className="flex justify-between text-[10px] text-chrome-muted">
        <span>Duration: {((segment.endTimeMs - segment.startTimeMs) / 1000).toFixed(2)}s</span>
        {segment.audioDurationMs && (
          <span>Audio: {(segment.audioDurationMs / 1000).toFixed(2)}s</span>
        )}
      </div>

      {/* Speed & Pitch Adjustments */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-chrome-muted mb-0.5">Speed</label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={segment.speedAdjustment}
            onChange={(e) =>
              updateSegment(segment.id, { speedAdjustment: parseFloat(e.target.value) })
            }
            className="w-full h-1"
          />
          <span className="text-[10px] text-chrome-muted">
            {segment.speedAdjustment.toFixed(1)}x
          </span>
        </div>
        <div>
          <label className="block text-xs text-chrome-muted mb-0.5">Pitch</label>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={segment.pitchAdjustment}
            onChange={(e) =>
              updateSegment(segment.id, { pitchAdjustment: parseInt(e.target.value, 10) })
            }
            className="w-full h-1"
          />
          <span className="text-[10px] text-chrome-muted">
            {segment.pitchAdjustment > 0 ? '+' : ''}
            {segment.pitchAdjustment}
          </span>
        </div>
      </div>
    </div>
  )
}

export default App
