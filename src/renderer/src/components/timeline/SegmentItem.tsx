import { usePlaybackStore } from '@renderer/stores/playback.store'
import { isSegmentStale, useSegmentStore } from '@renderer/stores/segment.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import type { Segment } from '@shared/types/segment'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface SegmentItemProps {
  segment: Segment
  trackHeight: number
}

export function SegmentItem({ segment, trackHeight }: SegmentItemProps): React.JSX.Element {
  const elementRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  // Track pending times during drag/resize (only commit to DB on mouse up)
  const [pendingTimes, setPendingTimes] = useState<{
    startTimeMs: number
    endTimeMs: number
  } | null>(null)

  const {
    msToPixels,
    pixelsToMs,
    snapToGrid,
    draggedSegmentId,
    resizingSegmentId,
    startDrag,
    endDrag,
    startResize,
    endResize
  } = useTimelineStore()

  const { selectedSegmentIds, selectSegment, updateSegment, speakers, segments } = useSegmentStore()

  const { jumpToSegment, currentSegmentId } = usePlaybackStore()
  const regenerateSegmentAudio = useSegmentStore((state) => state.regenerateSegmentAudio)

  const isSelected = selectedSegmentIds.has(segment.id)
  const isCurrent = currentSegmentId === segment.id
  const isStale = isSegmentStale(segment)
  const isBeingDragged = draggedSegmentId === segment.id
  const isBeingResized = resizingSegmentId === segment.id

  // Use pending times during drag/resize, otherwise use segment times
  const displayStartMs = pendingTimes?.startTimeMs ?? segment.startTimeMs
  const displayEndMs = pendingTimes?.endTimeMs ?? segment.endTimeMs

  // Calculate position and size using display times
  const left = msToPixels(displayStartMs)
  const rawWidth = msToPixels(displayEndMs - displayStartMs)
  // Add a small gap (2px) between segments for visual separation when zoomed out
  const width = Math.max(rawWidth - 2, 2)

  // Get speaker info
  const speaker = useMemo(
    () => speakers.find((s) => s.id === segment.speakerId),
    [speakers, segment.speakerId]
  )
  const speakerColor = speaker?.color || '#3b82f6'
  const speakerName = speaker?.name

  // Handle double-click to jump to segment
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      jumpToSegment(segment.startTimeMs)
    },
    [segment.startTimeMs, jumpToSegment]
  )

  // Handle stale indicator click - regenerate audio
  const handleStaleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      regenerateSegmentAudio(segment.id)
    },
    [segment.id, regenerateSegmentAudio]
  )

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return // Only left click
      if ((e.target as HTMLElement).classList.contains('resize-handle')) return

      e.preventDefault()
      e.stopPropagation()

      const element = elementRef.current
      if (!element) return

      const rect = element.getBoundingClientRect()
      setDragOffset(e.clientX - rect.left)
      setIsDragging(true)
      startDrag(segment.id)

      const isMultiSelect = e.shiftKey || e.metaKey
      if (!isSelected) {
        selectSegment(segment.id, isMultiSelect)
      } else if (isMultiSelect) {
        // If already selected and shift/cmd held, toggle it off
        selectSegment(segment.id, true)
      }
    },
    [segment.id, isSelected, selectSegment, startDrag]
  )

  // Handle resize start
  const handleResizeMouseDown = useCallback(
    (edge: 'start' | 'end') => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      setIsResizing(edge)
      startResize(segment.id, edge)
    },
    [segment.id, startResize]
  )

  // Handle mouse move for drag/resize
  useEffect(() => {
    if (!isDragging && !isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const scrollContainer = document.querySelector('.timeline-scroll-container')
      const scrollLeft = scrollContainer?.scrollLeft || 0

      if (isDragging) {
        const containerRect = scrollContainer?.getBoundingClientRect()
        if (!containerRect) return

        const newX = e.clientX - containerRect.left + scrollLeft - dragOffset - 80 // Account for track label
        let newStartMs = snapToGrid(pixelsToMs(Math.max(0, newX)))
        const duration = segment.endTimeMs - segment.startTimeMs

        // Find adjacent segments to prevent overlap
        const sortedSegments = [...segments].sort((a, b) => a.startTimeMs - b.startTimeMs)
        const currentIndex = sortedSegments.findIndex((s) => s.id === segment.id)
        const prevSegment = currentIndex > 0 ? sortedSegments[currentIndex - 1] : null
        const nextSegment =
          currentIndex < sortedSegments.length - 1 ? sortedSegments[currentIndex + 1] : null

        // Constrain: can't start before previous segment ends
        if (prevSegment && newStartMs < prevSegment.endTimeMs) {
          newStartMs = prevSegment.endTimeMs
        }

        // Constrain: can't end after next segment starts
        const newEndMs = newStartMs + duration
        if (nextSegment && newEndMs > nextSegment.startTimeMs) {
          newStartMs = nextSegment.startTimeMs - duration
        }

        // Ensure we don't go negative
        newStartMs = Math.max(0, newStartMs)

        // Update local pending times (no database write during drag)
        setPendingTimes({ startTimeMs: newStartMs, endTimeMs: newStartMs + duration })
      } else if (isResizing) {
        const containerRect = scrollContainer?.getBoundingClientRect()
        if (!containerRect) return

        const mouseX = e.clientX - containerRect.left + scrollLeft - 80
        const mouseTimeMs = snapToGrid(pixelsToMs(Math.max(0, mouseX)))

        // Find adjacent segments to prevent overlap
        const sortedSegments = [...segments].sort((a, b) => a.startTimeMs - b.startTimeMs)
        const currentIndex = sortedSegments.findIndex((s) => s.id === segment.id)
        const prevSegment = currentIndex > 0 ? sortedSegments[currentIndex - 1] : null
        const nextSegment =
          currentIndex < sortedSegments.length - 1 ? sortedSegments[currentIndex + 1] : null

        // Use current pending times or segment times as base
        const currentStartMs = pendingTimes?.startTimeMs ?? segment.startTimeMs
        const currentEndMs = pendingTimes?.endTimeMs ?? segment.endTimeMs

        if (isResizing === 'start') {
          // Can't go earlier than previous segment's end (or 0)
          const minStartMs = prevSegment ? prevSegment.endTimeMs : 0
          // Can't go later than current segment's end minus min duration
          const maxStartMs = currentEndMs - 100
          const newStartMs = Math.max(minStartMs, Math.min(mouseTimeMs, maxStartMs))
          // Update local pending times (no database write during resize)
          setPendingTimes({ startTimeMs: newStartMs, endTimeMs: currentEndMs })
        } else {
          // Can't go earlier than current segment's start plus min duration
          const minEndMs = currentStartMs + 100
          // Can't go later than next segment's start (or infinity)
          const maxEndMs = nextSegment ? nextSegment.startTimeMs : Number.MAX_SAFE_INTEGER
          const newEndMs = Math.min(maxEndMs, Math.max(mouseTimeMs, minEndMs))
          // Update local pending times (no database write during resize)
          setPendingTimes({ startTimeMs: currentStartMs, endTimeMs: newEndMs })
        }
      }
    }

    const handleMouseUp = () => {
      // Commit pending changes to database on mouse up
      if (pendingTimes) {
        const hasTimesChanged =
          pendingTimes.startTimeMs !== segment.startTimeMs ||
          pendingTimes.endTimeMs !== segment.endTimeMs
        const hasDurationChanged =
          pendingTimes.endTimeMs - pendingTimes.startTimeMs !==
          segment.endTimeMs - segment.startTimeMs

        if (hasTimesChanged) {
          updateSegment(segment.id, {
            startTimeMs: pendingTimes.startTimeMs,
            endTimeMs: pendingTimes.endTimeMs,
            // Mark as stale only if duration changed (resize, not drag)
            ...(hasDurationChanged ? { translatedTextHash: null } : {})
          })
        }
        setPendingTimes(null)
      }

      setIsDragging(false)
      setIsResizing(null)
      endDrag()
      endResize()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [
    isDragging,
    isResizing,
    dragOffset,
    segment,
    segments,
    pendingTimes,
    pixelsToMs,
    snapToGrid,
    updateSegment,
    endDrag,
    endResize
  ])

  // Truncate text helper
  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength - 1)}…`
  }

  // Display text - prefer original, fall back to translated
  const displayText = segment.originalText || segment.translatedText || ''

  return (
    <div
      ref={elementRef}
      className={`segment-item absolute top-1 cursor-pointer rounded ${
        isSelected ? 'ring-2 ring-white shadow-lg z-20' : 'hover:brightness-110 z-10'
      } ${isCurrent ? 'ring-2 ring-accent-primary animate-pulse' : ''} ${
        isBeingDragged || isBeingResized ? 'opacity-80' : ''
      }`}
      style={{
        left,
        width: Math.max(width, 4),
        height: trackHeight - 8,
        backgroundColor: isSelected ? '#f59e0b' : speakerColor,
        borderLeft: '1px solid rgba(0,0,0,0.4)',
        borderRight: '1px solid rgba(0,0,0,0.4)',
        borderTop: '1px solid rgba(255,255,255,0.2)',
        borderBottom: '1px solid rgba(0,0,0,0.3)',
        boxShadow: isSelected
          ? '0 2px 8px rgba(0,0,0,0.3)'
          : '1px 0 0 rgba(0,0,0,0.5), -1px 0 0 rgba(0,0,0,0.5)',
        // Only transition colors, not size/position
        transition: 'background-color 150ms, box-shadow 150ms, opacity 150ms'
      }}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Resize handle - start */}
      <div
        className="resize-handle absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/40 z-30"
        style={{ marginLeft: -4 }}
        onMouseDown={handleResizeMouseDown('start')}
      />

      {/* Resize handle - end */}
      <div
        className="resize-handle absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/40 z-30"
        style={{ marginRight: -4 }}
        onMouseDown={handleResizeMouseDown('end')}
      />

      {/* Segment content */}
      <div className="px-2 py-1 overflow-hidden h-full flex flex-col justify-center">
        {/* Speaker name */}
        {speakerName && (
          <div className="text-[10px] font-medium text-white/90 truncate">{speakerName}</div>
        )}

        {/* Original text */}
        <div className="text-xs text-white truncate" title={displayText}>
          {truncateText(displayText, Math.floor(width / 6))}
        </div>

        {/* Translated text (if different from original) */}
        {segment.translatedText &&
          segment.originalText &&
          segment.translatedText !== segment.originalText && (
            <div className="text-[10px] text-white/70 truncate" title={segment.translatedText}>
              {truncateText(segment.translatedText, Math.floor(width / 6))}
            </div>
          )}

        {/* Status indicators */}
        <div className="flex items-center gap-1 mt-auto">
          {isStale && (
            <button
              type="button"
              onClick={handleStaleClick}
              className="text-[8px] bg-yellow-500/30 rounded px-1 hover:bg-yellow-500/50 cursor-pointer"
              title="Audio outdated - click to regenerate"
            >
              ⚠️
            </button>
          )}
          {/* Stretch warning/error indicators */}
          {segment.audioFilePath &&
            !isStale &&
            (() => {
              // Calculate actual stretch based on audio duration vs segment duration
              const segmentDuration = segment.endTimeMs - segment.startTimeMs
              const audioDuration = segment.audioDurationMs || segmentDuration
              const stretchRatio = segmentDuration / audioDuration
              const stretchPercent = Math.abs(stretchRatio - 1) * 100
              if (stretchPercent > 25) {
                return (
                  <span
                    className="text-[8px] bg-red-500/40 rounded px-1"
                    title={`Audio stretched ${stretchPercent.toFixed(0)}% - quality may be affected`}
                  >
                    🔴
                  </span>
                )
              }
              if (stretchPercent > 15) {
                return (
                  <span
                    className="text-[8px] bg-yellow-500/40 rounded px-1"
                    title={`Audio stretched ${stretchPercent.toFixed(0)}%`}
                  >
                    🟡
                  </span>
                )
              }
              return (
                <span className="text-[8px] bg-white/20 rounded px-1" title="Audio generated">
                  🔊
                </span>
              )
            })()}
          {segment.translatedText && (
            <span className="text-[8px] bg-white/20 rounded px-1" title="Translated">
              🌐
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
