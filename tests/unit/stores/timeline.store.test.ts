import {
  selectIsDragging,
  selectIsResizing,
  selectVisibleTimeRange,
  useTimelineStore
} from '@renderer/stores/timeline.store'
import { beforeEach, describe, expect, it } from 'vitest'

describe('TimelineStore', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
  })

  describe('zoom', () => {
    it('should set zoom level', () => {
      const { setZoom } = useTimelineStore.getState()
      setZoom(2)
      expect(useTimelineStore.getState().zoom).toBe(2)
    })

    it('should clamp zoom to min value', () => {
      const { setZoom } = useTimelineStore.getState()
      setZoom(0.1)
      expect(useTimelineStore.getState().zoom).toBe(0.5)
    })

    it('should clamp zoom to max value', () => {
      const { setZoom } = useTimelineStore.getState()
      setZoom(20)
      expect(useTimelineStore.getState().zoom).toBe(10)
    })

    it('should zoom in by 25%', () => {
      const { setZoom, zoomIn } = useTimelineStore.getState()
      setZoom(1)
      zoomIn()
      expect(useTimelineStore.getState().zoom).toBe(1.25)
    })

    it('should zoom out by 25%', () => {
      const { setZoom, zoomOut } = useTimelineStore.getState()
      setZoom(1)
      zoomOut()
      expect(useTimelineStore.getState().zoom).toBe(0.8)
    })

    it('should zoom to fit duration in viewport', () => {
      const { zoomToFit } = useTimelineStore.getState()
      // 60000ms = 60 seconds, 1000px viewport
      // Target pps = 1000 / 60 = 16.67
      // Target zoom = 16.67 / 100 = 0.167, clamped to 0.5
      zoomToFit(60000, 1000)
      expect(useTimelineStore.getState().zoom).toBe(0.5)
      expect(useTimelineStore.getState().scrollPosition).toBe(0)
    })
  })

  describe('scroll', () => {
    it('should set scroll position', () => {
      const { setScrollPosition } = useTimelineStore.getState()
      setScrollPosition(500)
      expect(useTimelineStore.getState().scrollPosition).toBe(500)
    })

    it('should not allow negative scroll position', () => {
      const { setScrollPosition } = useTimelineStore.getState()
      setScrollPosition(-100)
      expect(useTimelineStore.getState().scrollPosition).toBe(0)
    })
  })

  describe('snap', () => {
    it('should enable/disable snap', () => {
      const { setSnapEnabled } = useTimelineStore.getState()

      setSnapEnabled(false)
      expect(useTimelineStore.getState().snapEnabled).toBe(false)

      setSnapEnabled(true)
      expect(useTimelineStore.getState().snapEnabled).toBe(true)
    })

    it('should snap time to grid when enabled', () => {
      const { setSnapEnabled, setSnapThreshold, snapToGrid } = useTimelineStore.getState()
      setSnapEnabled(true)
      setSnapThreshold(100) // 100ms grid

      expect(snapToGrid(150)).toBe(200)
      expect(snapToGrid(149)).toBe(100)
      expect(snapToGrid(50)).toBe(100)
      expect(snapToGrid(49)).toBe(0)
    })

    it('should not snap when disabled', () => {
      const { setSnapEnabled, snapToGrid } = useTimelineStore.getState()
      setSnapEnabled(false)

      expect(snapToGrid(150)).toBe(150)
      expect(snapToGrid(42)).toBe(42)
    })
  })

  describe('time conversion', () => {
    it('should convert milliseconds to pixels', () => {
      const { setZoom, msToPixels } = useTimelineStore.getState()
      setZoom(1) // 100 pixels per second
      expect(msToPixels(1000)).toBe(100) // 1 second = 100px
      expect(msToPixels(500)).toBe(50) // 0.5 seconds = 50px
    })

    it('should convert pixels to milliseconds', () => {
      const { setZoom, pixelsToMs } = useTimelineStore.getState()
      setZoom(1) // 100 pixels per second
      expect(pixelsToMs(100)).toBe(1000) // 100px = 1 second
      expect(pixelsToMs(50)).toBe(500) // 50px = 0.5 seconds
    })

    it('should scale conversion with zoom', () => {
      const { setZoom, msToPixels, pixelsToMs } = useTimelineStore.getState()
      setZoom(2) // 200 pixels per second

      expect(msToPixels(1000)).toBe(200) // 1 second = 200px at 2x zoom
      expect(pixelsToMs(200)).toBe(1000) // 200px = 1 second at 2x zoom
    })
  })

  describe('drag and resize state', () => {
    it('should track dragged segment', () => {
      const { startDrag, endDrag } = useTimelineStore.getState()

      startDrag('segment-1')
      expect(useTimelineStore.getState().draggedSegmentId).toBe('segment-1')

      endDrag()
      expect(useTimelineStore.getState().draggedSegmentId).toBeNull()
    })

    it('should track resizing segment and edge', () => {
      const { startResize, endResize } = useTimelineStore.getState()

      startResize('segment-1', 'start')
      const state = useTimelineStore.getState()
      expect(state.resizingSegmentId).toBe('segment-1')
      expect(state.resizeEdge).toBe('start')

      endResize()
      const afterState = useTimelineStore.getState()
      expect(afterState.resizingSegmentId).toBeNull()
      expect(afterState.resizeEdge).toBeNull()
    })
  })

  describe('view options', () => {
    it('should toggle waveform visibility', () => {
      const { setShowWaveform } = useTimelineStore.getState()

      setShowWaveform(false)
      expect(useTimelineStore.getState().showWaveform).toBe(false)

      setShowWaveform(true)
      expect(useTimelineStore.getState().showWaveform).toBe(true)
    })

    it('should toggle original audio visibility', () => {
      const { setShowOriginalAudio } = useTimelineStore.getState()

      setShowOriginalAudio(false)
      expect(useTimelineStore.getState().showOriginalAudio).toBe(false)

      setShowOriginalAudio(true)
      expect(useTimelineStore.getState().showOriginalAudio).toBe(true)
    })
  })

  describe('cursor position', () => {
    it('should set cursor position', () => {
      const { setCursorPosition } = useTimelineStore.getState()
      setCursorPosition(5000)
      expect(useTimelineStore.getState().cursorPositionMs).toBe(5000)
    })

    it('should not allow negative cursor position', () => {
      const { setCursorPosition } = useTimelineStore.getState()
      setCursorPosition(-1000)
      expect(useTimelineStore.getState().cursorPositionMs).toBe(0)
    })
  })

  describe('viewport', () => {
    it('should set viewport width', () => {
      const { setViewportWidth } = useTimelineStore.getState()
      setViewportWidth(1200)
      expect(useTimelineStore.getState().viewportWidth).toBe(1200)
    })
  })

  describe('hovered segment', () => {
    it('should set hovered segment', () => {
      const { setHoveredSegment } = useTimelineStore.getState()
      setHoveredSegment('segment-1')
      expect(useTimelineStore.getState().hoveredSegmentId).toBe('segment-1')
    })

    it('should clear hovered segment', () => {
      const { setHoveredSegment } = useTimelineStore.getState()
      setHoveredSegment('segment-1')
      setHoveredSegment(null)
      expect(useTimelineStore.getState().hoveredSegmentId).toBeNull()
    })
  })

  describe('selectors', () => {
    it('selectVisibleTimeRange should return correct range', () => {
      const { setZoom, setScrollPosition, setViewportWidth } = useTimelineStore.getState()
      setZoom(1) // 100 pixels per second
      setScrollPosition(100) // 100 pixels scrolled = 1 second
      setViewportWidth(500) // 500 pixels wide = 5 seconds visible

      const range = selectVisibleTimeRange(useTimelineStore.getState())
      expect(range.startMs).toBe(1000) // 1 second
      expect(range.endMs).toBe(6000) // 6 seconds
    })

    it('selectIsDragging should return true when dragging', () => {
      const { startDrag } = useTimelineStore.getState()
      expect(selectIsDragging(useTimelineStore.getState())).toBe(false)

      startDrag('segment-1')
      expect(selectIsDragging(useTimelineStore.getState())).toBe(true)
    })

    it('selectIsResizing should return true when resizing', () => {
      const { startResize } = useTimelineStore.getState()
      expect(selectIsResizing(useTimelineStore.getState())).toBe(false)

      startResize('segment-1', 'end')
      expect(selectIsResizing(useTimelineStore.getState())).toBe(true)
    })
  })
})
