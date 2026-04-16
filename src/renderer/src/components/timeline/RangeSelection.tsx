import { useTimelineStore } from '@renderer/stores/timeline.store'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

/**
 * Visual overlay for time-range selection on the timeline.
 * Renders a semi-transparent rectangle between rangeStartMs and rangeEndMs
 * with draggable edges to adjust the range.
 */
export function RangeSelection(): React.JSX.Element | null {
  const { rangeStartMs, rangeEndMs, msToPixels, pixelsToMs, setRange } =
    useTimelineStore()

  const [resizingEdge, setResizingEdge] = useState<'start' | 'end' | null>(null)

  const handleEdgeMouseDown = useCallback(
    (edge: 'start' | 'end', e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setResizingEdge(edge)
    },
    []
  )

  // Handle edge dragging
  useEffect(() => {
    if (!resizingEdge) return

    const handleMouseMove = (e: MouseEvent) => {
      const scrollContainer = document.querySelector('.timeline-scroll-container')
      if (!scrollContainer) return

      const rect = scrollContainer.getBoundingClientRect()
      const clickX = e.clientX - rect.left + scrollContainer.scrollLeft - 80
      const timeMs = Math.max(0, pixelsToMs(Math.max(0, clickX)))

      const { rangeStartMs: currentStart, rangeEndMs: currentEnd } =
        useTimelineStore.getState()

      if (resizingEdge === 'start' && currentEnd !== null) {
        setRange(timeMs, currentEnd)
      } else if (resizingEdge === 'end' && currentStart !== null) {
        setRange(currentStart, timeMs)
      }
    }

    const handleMouseUp = () => {
      setResizingEdge(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingEdge, pixelsToMs, setRange])

  if (rangeStartMs === null || rangeEndMs === null) return null

  const leftPx = msToPixels(rangeStartMs)
  const rightPx = msToPixels(rangeEndMs)
  const widthPx = rightPx - leftPx

  // Minimum 2px width to be visible
  if (widthPx < 2) return null

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-20"
      style={{ left: leftPx, width: widthPx }}
    >
      {/* Selection overlay */}
      <div className="absolute inset-0 bg-accent-primary/15 border-l border-r border-accent-primary/40" />

      {/* Start edge handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 bg-accent-primary/60 hover:bg-accent-primary cursor-col-resize pointer-events-auto"
        onMouseDown={(e) => handleEdgeMouseDown('start', e)}
      >
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-6 bg-accent-primary rounded-sm opacity-0 hover:opacity-100 transition-opacity" />
      </div>

      {/* End edge handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 bg-accent-primary/60 hover:bg-accent-primary cursor-col-resize pointer-events-auto"
        onMouseDown={(e) => handleEdgeMouseDown('end', e)}
      >
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-6 bg-accent-primary rounded-sm opacity-0 hover:opacity-100 transition-opacity" />
      </div>

      {/* Time labels */}
      <div className="absolute -top-5 left-0 text-[10px] text-accent-primary font-mono">
        {formatTimeLabel(rangeStartMs)}
      </div>
      <div className="absolute -top-5 right-0 text-[10px] text-accent-primary font-mono text-right">
        {formatTimeLabel(rangeEndMs)}
      </div>
    </div>
  )
}

function formatTimeLabel(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}
