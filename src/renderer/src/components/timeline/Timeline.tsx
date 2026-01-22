import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import { useUIStore } from '@renderer/stores/ui.store'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Playhead } from './Playhead'
import { TimelineControls } from './TimelineControls'
import { TimelineHeader } from './TimelineHeader'
import { TimelineTrack } from './TimelineTrack'

export function Timeline(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)

  const timelineHeight = useUIStore((state) => state.timelineHeight)
  const { setScrollPosition, setViewportWidth, scrollPosition, msToPixels, pixelsToMs } =
    useTimelineStore()
  // Only subscribe to non-time values to avoid re-renders during playback
  const durationMs = usePlaybackStore((state) => state.durationMs)
  const seek = usePlaybackStore((state) => state.seek)
  const pause = usePlaybackStore((state) => state.pause)
  const segments = useSegmentStore((state) => state.segments)
  const clearSelection = useSegmentStore((state) => state.clearSelection)

  // Track viewport width for zoom calculations
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const updateViewportWidth = (): void => {
      setViewportWidth(container.clientWidth)
    }

    updateViewportWidth()
    const resizeObserver = new ResizeObserver(updateViewportWidth)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [setViewportWidth])

  // Sync scroll position from store to container (for zoom centering)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // Only sync if the difference is significant (avoid feedback loop)
    if (Math.abs(container.scrollLeft - scrollPosition) > 1) {
      container.scrollLeft = scrollPosition
    }
  }, [scrollPosition])

  // Calculate timeline width based on duration and zoom
  const timelineWidth = useMemo(() => {
    if (durationMs <= 0) return 1000 // Default width when no media
    return msToPixels(durationMs)
  }, [durationMs, msToPixels])

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollPosition(e.currentTarget.scrollLeft)
    },
    [setScrollPosition]
  )

  // Calculate time from mouse position
  const getTimeFromMouseEvent = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const container = scrollContainerRef.current
      if (!container) return null

      const rect = container.getBoundingClientRect()
      const clickX = e.clientX - rect.left + container.scrollLeft - 80 // Subtract 80px for track labels
      if (clickX < 0) return 0
      const timeMs = pixelsToMs(clickX)
      return Math.max(0, Math.min(timeMs, durationMs))
    },
    [pixelsToMs, durationMs]
  )

  // Handle mouse down to start scrubbing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle left click
      if (e.button !== 0) return

      // Don't scrub if clicking on segments
      if ((e.target as HTMLElement).closest('.segment-item')) return

      // Clear selection when clicking background
      clearSelection()

      const timeMs = getTimeFromMouseEvent(e)
      if (timeMs === null) return

      setIsScrubbing(true)
      pause() // Pause playback while scrubbing
      seek(timeMs)
    },
    [getTimeFromMouseEvent, seek, pause, clearSelection]
  )

  // Handle mouse move while scrubbing
  useEffect(() => {
    if (!isScrubbing) return

    const handleMouseMove = (e: MouseEvent) => {
      const timeMs = getTimeFromMouseEvent(e)
      if (timeMs !== null) {
        seek(timeMs)
      }
    }

    const handleMouseUp = () => {
      setIsScrubbing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isScrubbing, getTimeFromMouseEvent, seek])

  // Reset scroll to start when duration changes (new video loaded)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (container && durationMs > 0) {
      container.scrollLeft = 0
    }
  }, [durationMs])

  // Auto-scroll to keep playhead visible during playback (using direct subscription)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    let lastScrollTime = 0

    const unsubscribe = usePlaybackStore.subscribe((state) => {
      // Only auto-scroll during playback
      if (state.state !== 'playing') return

      // Throttle scroll updates
      const now = Date.now()
      if (now - lastScrollTime < 500) return

      const { pixelsPerSecond } = useTimelineStore.getState()
      const playheadX = (state.currentTimeMs / 1000) * pixelsPerSecond + 80
      const containerWidth = container.clientWidth
      const scrollLeft = container.scrollLeft

      // Only scroll when playhead is about to exit visible area
      const exitMargin = 50
      if (playheadX < scrollLeft + exitMargin) {
        container.scrollTo({
          left: Math.max(0, playheadX - containerWidth * 0.75),
          behavior: 'smooth'
        })
        lastScrollTime = now
      } else if (playheadX > scrollLeft + containerWidth - exitMargin) {
        container.scrollTo({
          left: playheadX - containerWidth * 0.25,
          behavior: 'smooth'
        })
        lastScrollTime = now
      }
    })

    return () => unsubscribe()
  }, [])

  // Keyboard shortcuts for timeline
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        (e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'TEXTAREA'
      )
        return

      const { zoomIn, zoomOut, setZoom } = useTimelineStore.getState()
      const { currentTimeMs } = usePlaybackStore.getState()

      switch (e.key) {
        case '=':
        case '+':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            zoomIn(currentTimeMs)
          }
          break
        case '-':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            zoomOut(currentTimeMs)
          }
          break
        case '0':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            setZoom(1, currentTimeMs)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-chrome-bg border-t border-chrome-border flex-shrink-0"
      style={{ height: timelineHeight, minHeight: timelineHeight }}
    >
      {/* Timeline Controls */}
      <TimelineControls />

      {/* Scrollable Timeline Area */}
      <div
        ref={scrollContainerRef}
        className={`timeline-scroll-container flex-1 overflow-x-auto overflow-y-hidden relative ${isScrubbing ? 'cursor-grabbing select-none' : 'cursor-pointer'}`}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
      >
        <div
          className="relative"
          style={{ width: Math.max(timelineWidth + 80, 1000), minHeight: '100%' }}
        >
          {/* Time Ruler */}
          <TimelineHeader width={timelineWidth} />

          {/* Main Track Area */}
          <div className="relative" style={{ height: timelineHeight - 70 }}>
            {/* Original Audio Track */}
            <TimelineTrack label="Original" type="original" height={50} />

            {/* Segments Track */}
            <TimelineTrack label="Dubbed" type="dubbed" height={80} segments={segments} />

            {/* Playhead */}
            <Playhead />
          </div>
        </div>
      </div>
    </div>
  )
}
