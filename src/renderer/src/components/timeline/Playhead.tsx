import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import type React from 'react'
import { useEffect, useRef } from 'react'

export function Playhead(): React.JSX.Element {
  const elementRef = useRef<HTMLDivElement>(null)

  // Direct DOM animation - completely bypasses React
  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    let displayTimeMs = 0
    let cachedPixelsPerSecond = useTimelineStore.getState().pixelsPerSecond
    let cachedDurationMs = usePlaybackStore.getState().durationMs
    let isCurrentlyPlaying = false

    // For RAF fallback
    let rafId: number | null = null
    let anchorTimeMs = 0
    let anchorTimestamp = 0
    let playbackRate = 1

    // For requestVideoFrameCallback
    let videoElement: HTMLVideoElement | null = null
    let rvfcHandle: number | null = null

    const updatePosition = (timeMs: number, instant = false) => {
      const left = Math.round((timeMs / 1000) * cachedPixelsPerSecond + 80)
      if (instant) {
        // Disable transition for instant updates (seeks)
        element.style.transition = 'none'
        element.style.transform = `translate3d(${left}px, 0, 0)`
        // Force reflow to apply the instant change, then re-enable transition
        element.offsetHeight
        element.style.transition = 'transform 50ms linear'
      } else {
        element.style.transform = `translate3d(${left}px, 0, 0)`
      }
    }

    // requestVideoFrameCallback handler - fires at video's actual frame rate
    const onVideoFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (!isCurrentlyPlaying || !videoElement) return

      // metadata.mediaTime is the precise presentation timestamp in seconds
      const timeMs = metadata.mediaTime * 1000
      displayTimeMs = Math.min(Math.max(0, timeMs), cachedDurationMs)

      const left = Math.round((displayTimeMs / 1000) * cachedPixelsPerSecond + 80)
      element.style.transform = `translate3d(${left}px, 0, 0)`

      // Request next frame
      rvfcHandle = videoElement.requestVideoFrameCallback(onVideoFrame)
    }

    // RAF fallback for when video element isn't available or RVFC not supported
    const animateWithRAF = (timestamp: DOMHighResTimeStamp) => {
      if (isCurrentlyPlaying) {
        // Use RAF timestamp parameter (more consistent than performance.now())
        const elapsed = timestamp - anchorTimestamp
        const projectedTimeMs = anchorTimeMs + elapsed * playbackRate
        const clampedTime = Math.min(Math.max(0, projectedTimeMs), cachedDurationMs)
        displayTimeMs = clampedTime

        const left = Math.round((clampedTime / 1000) * cachedPixelsPerSecond + 80)
        element.style.transform = `translate3d(${left}px, 0, 0)`
      }
      rafId = requestAnimationFrame(animateWithRAF)
    }

    const startAnimation = () => {
      // Try to find the video element and use requestVideoFrameCallback
      const video = document.querySelector('video')

      if (video && 'requestVideoFrameCallback' in video) {
        videoElement = video
        // Cancel any running RAF
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
        rvfcHandle = videoElement.requestVideoFrameCallback(onVideoFrame)
      } else {
        videoElement = null
        // Fallback to RAF
        if (!rafId) {
          anchorTimestamp = performance.now()
          rafId = requestAnimationFrame(animateWithRAF)
        }
      }
    }

    const stopAnimation = () => {
      if (rvfcHandle !== null && videoElement) {
        videoElement.cancelVideoFrameCallback(rvfcHandle)
        rvfcHandle = null
      }
    }

    // Subscribe to playback store
    const unsubPlayback = usePlaybackStore.subscribe((state, prevState) => {
      const { currentTimeMs, state: playState, playbackRate: rate, durationMs } = state
      const stateChanged = playState !== prevState.state
      const wasPlaying = isCurrentlyPlaying

      isCurrentlyPlaying = playState === 'playing'
      playbackRate = rate
      cachedDurationMs = durationMs

      // Handle play/pause state changes
      if (stateChanged) {
        if (isCurrentlyPlaying && !wasPlaying) {
          // Starting playback
          anchorTimeMs = currentTimeMs
          anchorTimestamp = performance.now()
          startAnimation()
        } else if (!isCurrentlyPlaying && wasPlaying) {
          // Stopping playback
          stopAnimation()
        }
      }

      // Handle seeks (large time jumps)
      const timeDelta = Math.abs(currentTimeMs - displayTimeMs)
      if (timeDelta > 300) {
        // Seek detected - instant update
        displayTimeMs = currentTimeMs
        anchorTimeMs = currentTimeMs
        anchorTimestamp = performance.now()
        updatePosition(currentTimeMs, true)
      } else if (!isCurrentlyPlaying) {
        // Paused - update position
        displayTimeMs = currentTimeMs
        anchorTimeMs = currentTimeMs
        anchorTimestamp = performance.now()
        updatePosition(currentTimeMs, false)
      }
    })

    // Subscribe to timeline store for zoom changes
    const unsubTimeline = useTimelineStore.subscribe(
      (state) => state.pixelsPerSecond,
      (pps) => {
        cachedPixelsPerSecond = pps
        // Instant update on zoom change
        updatePosition(displayTimeMs, true)
      }
    )

    // Initialize
    const { currentTimeMs, state: playState, playbackRate: rate, durationMs } = usePlaybackStore.getState()
    isCurrentlyPlaying = playState === 'playing'
    playbackRate = rate
    cachedDurationMs = durationMs
    displayTimeMs = currentTimeMs
    anchorTimeMs = currentTimeMs
    anchorTimestamp = performance.now()
    updatePosition(currentTimeMs, true)

    // Start animation if already playing
    if (isCurrentlyPlaying) {
      startAnimation()
    }

    return () => {
      unsubPlayback()
      unsubTimeline()
      stopAnimation()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div
      ref={elementRef}
      className="absolute top-0 bottom-0 w-0.5 z-50 pointer-events-none"
      style={{
        left: 0,
        backgroundColor: 'var(--color-timeline-playhead)',
        willChange: 'transform',
        // Short CSS transition smooths out variable frame intervals
        transition: 'transform 50ms linear'
      }}
    >
      {/* Playhead marker triangle */}
      <div
        className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3"
        style={{
          backgroundColor: 'var(--color-timeline-playhead)',
          clipPath: 'polygon(0 0, 100% 0, 50% 100%)'
        }}
      />
    </div>
  )
}
