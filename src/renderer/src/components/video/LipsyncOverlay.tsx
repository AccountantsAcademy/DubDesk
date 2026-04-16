/**
 * LipsyncOverlay
 * Shows a lip-synced video clip on top of the original video
 * when the current playing segment has a lipsyncVideoPath.
 */

import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import type React from 'react'
import { useEffect, useRef } from 'react'

export function LipsyncOverlay(): React.JSX.Element | null {
  const lipsyncVideoRef = useRef<HTMLVideoElement>(null)
  const activeSegmentIdRef = useRef<string | null>(null)

  const playingDubbedSegmentId = usePlaybackStore((state) => state.playingDubbedSegmentId)
  const playbackState = usePlaybackStore((state) => state.state)
  const playbackRate = usePlaybackStore((state) => state.playbackRate)
  const segments = useSegmentStore((state) => state.segments)

  // Find the active segment and check for lip-sync video
  const activeSegment = playingDubbedSegmentId
    ? segments.find((s) => s.id === playingDubbedSegmentId)
    : null
  const lipsyncPath = activeSegment?.lipsyncVideoPath

  // Convert to file:// URL for Electron
  const lipsyncSrc = lipsyncPath
    ? lipsyncPath.startsWith('file://')
      ? lipsyncPath
      : `file://${lipsyncPath}`
    : null

  // Start/stop lip-sync video when segment changes
  useEffect(() => {
    const video = lipsyncVideoRef.current
    if (!video) return

    if (lipsyncSrc && (playingDubbedSegmentId !== activeSegmentIdRef.current || video.src !== lipsyncSrc)) {
      // New lip-sync segment or re-entering same segment — load and play from the start
      activeSegmentIdRef.current = playingDubbedSegmentId

      video.src = lipsyncSrc
      video.playbackRate = playbackRate
      video.currentTime = 0

      if (playbackState === 'playing') {
        video.play().catch(console.error)
      }
    }
  }, [lipsyncSrc, playingDubbedSegmentId, playbackState, playbackRate])

  // Sync play/pause with main video
  useEffect(() => {
    const video = lipsyncVideoRef.current
    if (!video || !lipsyncSrc) return

    if (playbackState === 'playing') {
      video.play().catch(console.error)
    } else {
      video.pause()
    }
  }, [playbackState, lipsyncSrc])

  // Sync playback rate
  useEffect(() => {
    const video = lipsyncVideoRef.current
    if (!video) return
    video.playbackRate = playbackRate
  }, [playbackRate])

  // Seek within the lip-sync clip when the main video seeks within the segment
  useEffect(() => {
    if (!activeSegment || !lipsyncSrc) return
    const video = lipsyncVideoRef.current
    if (!video) return

    const mainVideo = document.querySelector('video:not([data-lipsync])') as HTMLVideoElement
    if (!mainVideo) return

    const handleSeeked = () => {
      const currentTimeMs = mainVideo.currentTime * 1000
      if (currentTimeMs >= activeSegment.startTimeMs && currentTimeMs < activeSegment.endTimeMs) {
        const offsetMs = currentTimeMs - activeSegment.startTimeMs
        video.currentTime = offsetMs / 1000
      }
    }

    mainVideo.addEventListener('seeked', handleSeeked)
    return () => mainVideo.removeEventListener('seeked', handleSeeked)
  }, [activeSegment, lipsyncSrc])

  // Clear active reference when segment goes away
  useEffect(() => {
    if (!playingDubbedSegmentId) {
      activeSegmentIdRef.current = null
    }
  }, [playingDubbedSegmentId])

  // Don't render if no lip-sync clip to show
  if (!lipsyncSrc) return null

  return (
    <video
      ref={lipsyncVideoRef}
      data-lipsync="true"
      className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none"
      muted
      playsInline
    />
  )
}
