import { usePlaybackStore } from '@renderer/stores/playback.store'
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
    setShowOriginalAudio
  } = useTimelineStore()

  const { durationMs, currentTimeMs } = usePlaybackStore()

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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Keyboard shortcuts hint */}
      <div className="text-[10px] text-chrome-muted/60">
        Space: Play/Pause • ←/→: Seek • Cmd+/-: Zoom
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
