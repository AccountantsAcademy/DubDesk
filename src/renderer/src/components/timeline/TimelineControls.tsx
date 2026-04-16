import { useOverlayStore } from '@renderer/stores/overlay.store'
import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useProjectStore } from '@renderer/stores/project.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import type React from 'react'
import { useCallback } from 'react'

export function TimelineControls(): React.JSX.Element {
  const {
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    snapEnabled,
    setSnapEnabled,
    showWaveform,
    setShowWaveform,
    showOriginalAudio,
    setShowOriginalAudio,
    rangeSelectionMode,
    setRangeSelectionMode
  } = useTimelineStore()

  const { durationMs, currentTimeMs } = usePlaybackStore()
  const currentProject = useProjectStore((state) => state.currentProject)

  const importAndCreateOverlay = useOverlayStore((state) => state.importAndCreateOverlay)

  const isSameLanguage =
    currentProject?.sourceLanguage &&
    currentProject?.targetLanguage &&
    currentProject.sourceLanguage === currentProject.targetLanguage

  const handleAddOverlay = useCallback(() => {
    if (!currentProject?.id) return
    importAndCreateOverlay(currentProject.id, currentTimeMs, durationMs)
  }, [currentProject?.id, currentTimeMs, durationMs, importAndCreateOverlay])

  const handleZoomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setZoom(parseFloat(e.target.value), currentTimeMs)
    },
    [setZoom, currentTimeMs]
  )

  const handleZoomIn = useCallback(() => {
    zoomIn(currentTimeMs)
  }, [zoomIn, currentTimeMs])

  const handleZoomOut = useCallback(() => {
    zoomOut(currentTimeMs)
  }, [zoomOut, currentTimeMs])

  const handleZoomToFit = useCallback(() => {
    // Get timeline scroll container width
    const scrollContainer = document.querySelector('.overflow-x-auto')
    const viewportWidth = scrollContainer?.clientWidth || window.innerWidth - 400
    // Subtract 80px for track labels, add some padding
    const availableWidth = Math.max(viewportWidth - 100, 200)
    zoomToFit(durationMs, availableWidth)
  }, [durationMs, zoomToFit])

  return (
    <div className="h-8 bg-chrome-panel border-b border-chrome-border flex items-center px-3 gap-4">
      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleZoomOut}
          className="p-1 rounded hover:bg-chrome-hover text-chrome-muted hover:text-chrome-text"
          title="Zoom out (Cmd+-)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        <input
          type="range"
          min={0.01}
          max={10}
          step={0.01}
          value={zoom}
          onChange={handleZoomChange}
          className="w-32 h-1 bg-chrome-border rounded-lg appearance-none cursor-pointer accent-accent-primary"
          title={`Zoom: ${Math.round(zoom * 100)}%`}
        />

        <button
          onClick={handleZoomIn}
          className="p-1 rounded hover:bg-chrome-hover text-chrome-muted hover:text-chrome-text"
          title="Zoom in (Cmd++)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <button
          onClick={handleZoomToFit}
          className="px-2 py-1 text-xs rounded hover:bg-chrome-hover text-chrome-muted hover:text-chrome-text"
          title="Zoom to fit"
        >
          Fit
        </button>

        <span className="text-xs text-chrome-muted w-12 text-right">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-chrome-border" />

      {/* View options */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-chrome-muted cursor-pointer hover:text-chrome-text">
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(e) => setSnapEnabled(e.target.checked)}
            className="w-3 h-3 rounded border-chrome-border bg-chrome-bg accent-accent-primary"
          />
          Snap
        </label>

        <label className="flex items-center gap-1.5 text-xs text-chrome-muted cursor-pointer hover:text-chrome-text">
          <input
            type="checkbox"
            checked={showWaveform}
            onChange={(e) => setShowWaveform(e.target.checked)}
            className="w-3 h-3 rounded border-chrome-border bg-chrome-bg accent-accent-primary"
          />
          Waveform
        </label>

        <label className="flex items-center gap-1.5 text-xs text-chrome-muted cursor-pointer hover:text-chrome-text">
          <input
            type="checkbox"
            checked={showOriginalAudio}
            onChange={(e) => setShowOriginalAudio(e.target.checked)}
            className="w-3 h-3 rounded border-chrome-border bg-chrome-bg accent-accent-primary"
          />
          Original
        </label>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-chrome-border" />

      {/* Timeline info */}
      <div className="text-xs text-chrome-muted">
        {durationMs > 0 ? formatDuration(durationMs) : 'No media'}
      </div>

      {/* Quick Edit toggle — only shown when source and target language are the same */}
      {isSameLanguage && (
        <>
          <div className="h-4 w-px bg-chrome-border" />
          <button
            onClick={() => setRangeSelectionMode(!rangeSelectionMode)}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
              rangeSelectionMode
                ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40'
                : 'hover:bg-chrome-hover text-chrome-muted hover:text-chrome-text'
            }`}
            title="Quick Edit - select a range to transcribe and re-record (Q)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            Quick Edit
          </button>
        </>
      )}

      {/* Image overlay button */}
      {currentProject && (
        <>
          <div className="h-4 w-px bg-chrome-border" />
          <button
            onClick={handleAddOverlay}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-chrome-hover text-chrome-muted hover:text-chrome-text"
            title="Add image overlay"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Overlay
          </button>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Keyboard shortcuts hint */}
      <div className="text-[10px] text-chrome-muted/60">
        Space: Play/Pause • ←/→: Seek{isSameLanguage ? ' • Q: Quick Edit' : ''} • Cmd+/-: Zoom
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
