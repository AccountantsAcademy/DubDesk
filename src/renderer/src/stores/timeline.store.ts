import { TIMELINE_DEFAULTS } from '@shared/constants/defaults'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'

export interface WaveformData {
  peaks: number[]
  samplesPerSecond: number
  durationMs: number
}

interface TimelineState {
  zoom: number
  scrollPosition: number
  viewportWidth: number
  pixelsPerSecond: number
  snapEnabled: boolean
  snapThresholdMs: number
  showWaveform: boolean
  showOriginalAudio: boolean
  hoveredSegmentId: string | null
  draggedSegmentId: string | null
  resizingSegmentId: string | null
  resizeEdge: 'start' | 'end' | null
  cursorPositionMs: number
  waveformData: WaveformData | null
  waveformLoading: boolean
  waveformError: string | null
}

interface TimelineActions {
  setZoom: (zoom: number, anchorMs?: number) => void
  zoomIn: (anchorMs?: number) => void
  zoomOut: (anchorMs?: number) => void
  zoomToFit: (durationMs: number, viewportWidth: number) => void
  setScrollPosition: (position: number) => void
  setViewportWidth: (width: number) => void
  setSnapEnabled: (enabled: boolean) => void
  setSnapThreshold: (thresholdMs: number) => void
  setShowWaveform: (show: boolean) => void
  setShowOriginalAudio: (show: boolean) => void
  setHoveredSegment: (id: string | null) => void
  startDrag: (segmentId: string) => void
  endDrag: () => void
  startResize: (segmentId: string, edge: 'start' | 'end') => void
  endResize: () => void
  setCursorPosition: (positionMs: number) => void
  msToPixels: (ms: number) => number
  pixelsToMs: (pixels: number) => number
  snapToGrid: (ms: number) => number
  scrollToTime: (timeMs: number) => void
  loadWaveform: (mediaPath: string, projectId: string) => Promise<void>
  clearWaveform: () => void
  reset: () => void
}

type TimelineStore = TimelineState & TimelineActions

const initialState: TimelineState = {
  zoom: TIMELINE_DEFAULTS.DEFAULT_ZOOM,
  scrollPosition: 0,
  viewportWidth: 0,
  pixelsPerSecond: TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
  snapEnabled: true,
  snapThresholdMs: TIMELINE_DEFAULTS.SNAP_THRESHOLD_MS,
  showWaveform: true,
  showOriginalAudio: true,
  hoveredSegmentId: null,
  draggedSegmentId: null,
  resizingSegmentId: null,
  resizeEdge: null,
  cursorPositionMs: 0,
  waveformData: null,
  waveformLoading: false,
  waveformError: null
}

export const useTimelineStore = create<TimelineStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      setZoom: (zoom, anchorMs) => {
        const { scrollPosition, viewportWidth } = get()
        const clampedZoom = Math.max(
          TIMELINE_DEFAULTS.MIN_ZOOM,
          Math.min(TIMELINE_DEFAULTS.MAX_ZOOM, zoom)
        )
        const newPixelsPerSecond = TIMELINE_DEFAULTS.PIXELS_PER_SECOND * clampedZoom

        // If anchor point provided, adjust scroll to keep it in the same viewport position
        let newScrollPosition = scrollPosition
        if (anchorMs !== undefined && viewportWidth > 0) {
          const anchorPixelsAfter = (anchorMs / 1000) * newPixelsPerSecond
          // Keep anchor at the same relative position in viewport (center it)
          const viewportCenter = viewportWidth / 2
          newScrollPosition = Math.max(0, anchorPixelsAfter - viewportCenter)
        }

        set({
          zoom: clampedZoom,
          pixelsPerSecond: newPixelsPerSecond,
          scrollPosition: newScrollPosition
        })
      },

      zoomIn: (anchorMs) => {
        const { zoom, scrollPosition, viewportWidth } = get()
        const newZoom = Math.min(TIMELINE_DEFAULTS.MAX_ZOOM, zoom * 1.25)
        const newPixelsPerSecond = TIMELINE_DEFAULTS.PIXELS_PER_SECOND * newZoom

        // If anchor point provided, adjust scroll to keep it centered
        let newScrollPosition = scrollPosition
        if (anchorMs !== undefined && viewportWidth > 0) {
          const anchorPixelsAfter = (anchorMs / 1000) * newPixelsPerSecond
          const viewportCenter = viewportWidth / 2
          newScrollPosition = Math.max(0, anchorPixelsAfter - viewportCenter)
        }

        set({
          zoom: newZoom,
          pixelsPerSecond: newPixelsPerSecond,
          scrollPosition: newScrollPosition
        })
      },

      zoomOut: (anchorMs) => {
        const { zoom, scrollPosition, viewportWidth } = get()
        const newZoom = Math.max(TIMELINE_DEFAULTS.MIN_ZOOM, zoom / 1.25)
        const newPixelsPerSecond = TIMELINE_DEFAULTS.PIXELS_PER_SECOND * newZoom

        // If anchor point provided, adjust scroll to keep it centered
        let newScrollPosition = scrollPosition
        if (anchorMs !== undefined && viewportWidth > 0) {
          const anchorPixelsAfter = (anchorMs / 1000) * newPixelsPerSecond
          const viewportCenter = viewportWidth / 2
          newScrollPosition = Math.max(0, anchorPixelsAfter - viewportCenter)
        }

        set({
          zoom: newZoom,
          pixelsPerSecond: newPixelsPerSecond,
          scrollPosition: newScrollPosition
        })
      },

      zoomToFit: (durationMs, viewportWidth) => {
        const durationSeconds = durationMs / 1000
        const targetPps = viewportWidth / durationSeconds
        const targetZoom = targetPps / TIMELINE_DEFAULTS.PIXELS_PER_SECOND
        const clampedZoom = Math.max(
          TIMELINE_DEFAULTS.MIN_ZOOM,
          Math.min(TIMELINE_DEFAULTS.MAX_ZOOM, targetZoom)
        )
        set({
          zoom: clampedZoom,
          pixelsPerSecond: TIMELINE_DEFAULTS.PIXELS_PER_SECOND * clampedZoom,
          scrollPosition: 0
        })
      },

      setScrollPosition: (position) => set({ scrollPosition: Math.max(0, position) }),

      setViewportWidth: (width) => set({ viewportWidth: width }),

      setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),

      setSnapThreshold: (thresholdMs) => set({ snapThresholdMs: thresholdMs }),

      setShowWaveform: (show) => set({ showWaveform: show }),

      setShowOriginalAudio: (show) => set({ showOriginalAudio: show }),

      setHoveredSegment: (id) => set({ hoveredSegmentId: id }),

      startDrag: (segmentId) => set({ draggedSegmentId: segmentId }),

      endDrag: () => set({ draggedSegmentId: null }),

      startResize: (segmentId, edge) => set({ resizingSegmentId: segmentId, resizeEdge: edge }),

      endResize: () => set({ resizingSegmentId: null, resizeEdge: null }),

      setCursorPosition: (positionMs) => set({ cursorPositionMs: Math.max(0, positionMs) }),

      msToPixels: (ms) => {
        const { pixelsPerSecond } = get()
        return (ms / 1000) * pixelsPerSecond
      },

      pixelsToMs: (pixels) => {
        const { pixelsPerSecond } = get()
        return (pixels / pixelsPerSecond) * 1000
      },

      snapToGrid: (ms) => {
        const { snapEnabled, snapThresholdMs } = get()
        if (!snapEnabled) return ms
        return Math.round(ms / snapThresholdMs) * snapThresholdMs
      },

      scrollToTime: (timeMs) => {
        const { pixelsPerSecond, viewportWidth } = get()
        const timePixels = (timeMs / 1000) * pixelsPerSecond
        // Center the time in the viewport, accounting for 80px label width
        const newScrollPosition = Math.max(0, timePixels - viewportWidth / 2 + 80)
        set({ scrollPosition: newScrollPosition })
      },

      loadWaveform: async (mediaPath, projectId) => {
        const { waveformLoading } = get()

        // Don't reload if already loading
        if (waveformLoading) return

        set({ waveformLoading: true, waveformError: null })

        try {
          const response = await window.dubdesk.ffmpeg.extractWaveform({
            mediaPath,
            projectId,
            samplesPerSecond: TIMELINE_DEFAULTS.WAVEFORM_SAMPLES_PER_SECOND
          })

          if (!response.success) {
            throw new Error(response.error || 'Failed to extract waveform')
          }

          set({
            waveformData: response.data,
            waveformLoading: false
          })

          console.log(
            '[Timeline] Waveform loaded:',
            response.data.peaks.length,
            'peaks',
            response.cached ? '(cached)' : '(fresh)'
          )
        } catch (error) {
          console.error('[Timeline] Waveform error:', error)
          set({
            waveformError: error instanceof Error ? error.message : 'Waveform extraction failed',
            waveformLoading: false
          })
        }
      },

      clearWaveform: () => {
        set({ waveformData: null, waveformLoading: false, waveformError: null })
      },

      reset: () => set(initialState)
    })),
    { name: 'timeline-store' }
  )
)

// Selectors
export const selectVisibleTimeRange = (state: TimelineStore) => {
  const { scrollPosition, viewportWidth, pixelsPerSecond } = state
  const startMs = (scrollPosition / pixelsPerSecond) * 1000
  const endMs = ((scrollPosition + viewportWidth) / pixelsPerSecond) * 1000
  return { startMs, endMs }
}

export const selectIsDragging = (state: TimelineStore) => state.draggedSegmentId !== null

export const selectIsResizing = (state: TimelineStore) => state.resizingSegmentId !== null
