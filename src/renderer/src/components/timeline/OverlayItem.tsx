/**
 * OverlayItem
 * Renders a single image overlay as a bar on the timeline track.
 * Supports drag-to-move (preserving duration) and edge resize handles.
 */

import { useOverlayStore } from '@renderer/stores/overlay.store'
import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import type { ImageOverlay } from '@shared/types/overlay'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

type PendingTimes = { startTimeMs: number; endTimeMs: number }

interface OverlayItemProps {
  overlay: ImageOverlay
  trackHeight: number
}

export function OverlayItem({ overlay }: OverlayItemProps): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null)
  const [pendingTimes, setPendingTimesState] = useState<PendingTimes | null>(null)
  const pendingTimesRef = useRef<PendingTimes | null>(null)
  const setPendingTimes = useCallback((val: PendingTimes | null) => {
    pendingTimesRef.current = val
    setPendingTimesState(val)
  }, [])

  const dragStartRef = useRef<{ mouseX: number; startTimeMs: number; endTimeMs: number } | null>(
    null
  )

  const { msToPixels, pixelsToMs } = useTimelineStore()
  const selectedOverlayId = useOverlayStore((state) => state.selectedOverlayId)
  const selectOverlay = useOverlayStore((state) => state.selectOverlay)
  const updateOverlay = useOverlayStore((state) => state.updateOverlay)
  const clearSegmentSelection = useSegmentStore((state) => state.clearSelection)
  const { jumpToSegment } = usePlaybackStore()
  const durationMs = usePlaybackStore((state) => state.durationMs)

  const isSelected = selectedOverlayId === overlay.id

  const displayStart = pendingTimes?.startTimeMs ?? overlay.startTimeMs
  const displayEnd = pendingTimes?.endTimeMs ?? overlay.endTimeMs

  const left = msToPixels(displayStart)
  const rawWidth = msToPixels(displayEnd - displayStart)
  const width = Math.max(rawWidth - 2, 2)

  // Click to select
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      clearSegmentSelection()
      selectOverlay(overlay.id)
    },
    [overlay.id, selectOverlay, clearSegmentSelection]
  )

  // Double-click to jump
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      jumpToSegment(overlay.startTimeMs)
    },
    [overlay.startTimeMs, jumpToSegment]
  )

  // --- Drag to move ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).dataset.edge) return
      e.stopPropagation()
      e.preventDefault()
      clearSegmentSelection()
      selectOverlay(overlay.id)
      setIsDragging(true)
      dragStartRef.current = {
        mouseX: e.clientX,
        startTimeMs: overlay.startTimeMs,
        endTimeMs: overlay.endTimeMs
      }
    },
    [overlay, selectOverlay, clearSegmentSelection]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const dx = e.clientX - dragStartRef.current.mouseX
      const deltaMs = pixelsToMs(dx)
      const duration = dragStartRef.current.endTimeMs - dragStartRef.current.startTimeMs

      let newStart = dragStartRef.current.startTimeMs + deltaMs
      let newEnd = newStart + duration

      // Clamp to video bounds
      if (newStart < 0) {
        newStart = 0
        newEnd = duration
      }
      if (newEnd > durationMs) {
        newEnd = durationMs
        newStart = durationMs - duration
      }

      setPendingTimes({ startTimeMs: newStart, endTimeMs: newEnd })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      const p = pendingTimesRef.current
      if (p) {
        updateOverlay(overlay.id, {
          startTimeMs: Math.round(p.startTimeMs),
          endTimeMs: Math.round(p.endTimeMs)
        })
        setPendingTimes(null)
      }
      dragStartRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, durationMs, overlay.id, pixelsToMs, updateOverlay, setPendingTimes])

  // --- Edge resize ---
  const handleEdgeMouseDown = useCallback(
    (e: React.MouseEvent, edge: 'start' | 'end') => {
      e.stopPropagation()
      e.preventDefault()
      clearSegmentSelection()
      selectOverlay(overlay.id)
      setIsResizing(edge)
      dragStartRef.current = {
        mouseX: e.clientX,
        startTimeMs: overlay.startTimeMs,
        endTimeMs: overlay.endTimeMs
      }
    },
    [overlay, selectOverlay, clearSegmentSelection]
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const dx = e.clientX - dragStartRef.current.mouseX
      const deltaMs = pixelsToMs(dx)

      let newStart = dragStartRef.current.startTimeMs
      let newEnd = dragStartRef.current.endTimeMs

      if (isResizing === 'start') {
        newStart += deltaMs
        newStart = Math.max(0, Math.min(newStart, newEnd - 100)) // min 100ms
      } else {
        newEnd += deltaMs
        newEnd = Math.max(newStart + 100, Math.min(newEnd, durationMs))
      }

      setPendingTimes({ startTimeMs: newStart, endTimeMs: newEnd })
    }

    const handleMouseUp = () => {
      setIsResizing(null)
      const p = pendingTimesRef.current
      if (p) {
        updateOverlay(overlay.id, {
          startTimeMs: Math.round(p.startTimeMs),
          endTimeMs: Math.round(p.endTimeMs)
        })
        setPendingTimes(null)
      }
      dragStartRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, durationMs, overlay.id, pixelsToMs, updateOverlay, setPendingTimes])

  return (
    <div
      className={`overlay-item absolute top-1 bottom-1 rounded-sm flex items-center overflow-hidden select-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${isSelected ? 'ring-2 ring-white' : ''}`}
      style={{
        left,
        width,
        backgroundColor: 'rgba(168, 85, 247, 0.6)', // purple
        borderLeft: '2px solid rgb(168, 85, 247)',
        borderRight: '2px solid rgb(168, 85, 247)'
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Start edge handle */}
      <div
        data-edge="start"
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/40 z-10"
        onMouseDown={(e) => handleEdgeMouseDown(e, 'start')}
      />

      {/* Content */}
      <div className="flex-1 px-1 min-w-0 flex items-center gap-1">
        <svg
          className="w-3 h-3 text-white/80 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="text-[10px] text-white/90 truncate">{overlay.originalFilename}</span>
      </div>

      {/* End edge handle */}
      <div
        data-edge="end"
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/40 z-10"
        onMouseDown={(e) => handleEdgeMouseDown(e, 'end')}
      />
    </div>
  )
}
