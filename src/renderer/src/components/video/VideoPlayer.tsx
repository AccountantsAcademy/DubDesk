import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useProjectStore } from '@renderer/stores/project.store'
import { useUIStore } from '@renderer/stores/ui.store'
import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { PlaybackControls } from './PlaybackControls'

export function VideoPlayer(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentProject = useProjectStore((state) => state.currentProject)
  const setVideoPlayerSize = useUIStore((state) => state.setVideoPlayerSize)

  const {
    state: playbackState,
    currentTimeMs,
    playbackRate,
    volume,
    muted,
    durationMs,
    loop,
    loopStartMs,
    setCurrentTime,
    setDuration,
    play,
    pause,
    seek,
    originalAudioVolume,
    soloOriginal,
    soloDubbed,
    playingDubbedSegmentId
  } = usePlaybackStore()

  // Sync video element with playback state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (playbackState === 'playing') {
      video.play().catch(console.error)
    } else {
      video.pause()
    }
  }, [playbackState])

  // Sync playback rate
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = playbackRate
  }, [playbackRate])

  const inSmallGap = usePlaybackStore((state) => state.inSmallGap)

  // Sync volume
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Calculate effective volume based on solo modes and dubbed audio state
    let effectiveVolume = volume * originalAudioVolume
    if (soloDubbed) {
      effectiveVolume = 0 // Mute original when soloing dubbed
    } else if (soloOriginal) {
      effectiveVolume = volume // Full volume when soloing original
    } else if (playingDubbedSegmentId !== null || inSmallGap) {
      effectiveVolume = 0 // Mute original when dubbed audio is playing or in small gap between segments
    }

    video.volume = muted ? 0 : effectiveVolume
  }, [
    volume,
    muted,
    originalAudioVolume,
    soloOriginal,
    soloDubbed,
    playingDubbedSegmentId,
    inSmallGap
  ])

  // Track if we're currently syncing from video to store
  const isSyncingFromVideo = useRef(false)

  // Sync current time when seeking (store → video)
  // Only sync when NOT playing to avoid feedback loop
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Don't sync back to video during normal playback - video is source of truth
    // Only sync when paused/stopped (user is seeking via timeline/controls)
    if (playbackState === 'playing') return

    // Don't sync if this update came from the video itself
    if (isSyncingFromVideo.current) return

    const videoTimeMs = video.currentTime * 1000
    // Only sync if difference is significant (> 100ms)
    if (Math.abs(videoTimeMs - currentTimeMs) > 100) {
      video.currentTime = currentTimeMs / 1000
    }
  }, [currentTimeMs, playbackState])

  // Handle video time updates
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    isSyncingFromVideo.current = true
    setCurrentTime(video.currentTime * 1000)
    // Reset flag after a microtask to allow the effect to run first
    queueMicrotask(() => {
      isSyncingFromVideo.current = false
    })
  }, [setCurrentTime])

  // Handle video loaded metadata
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setDuration(video.duration * 1000)
  }, [setDuration])

  // Handle video ended
  const handleEnded = useCallback(() => {
    const video = videoRef.current
    if (loop) {
      // Seek back to loop start (or beginning) and continue playing
      const startTime = loopStartMs ?? 0
      seek(startTime)
      // Directly update video element since the sync effect skips during playback
      if (video) {
        video.currentTime = startTime / 1000
        video.play().catch(console.error)
      }
    } else {
      pause()
    }
  }, [loop, loopStartMs, seek, pause])

  // Handle click to toggle play/pause
  const handleClick = useCallback(() => {
    if (playbackState === 'playing') {
      pause()
    } else {
      play()
    }
  }, [playbackState, play, pause])

  // Handle double-click to toggle fullscreen
  const handleDoubleClick = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }, [])

  // Update video player size on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setVideoPlayerSize({ width, height })
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [setVideoPlayerSize])

  // Electron requires file:// protocol for local video files
  const videoSrc = currentProject?.sourceVideoPath
    ? currentProject.sourceVideoPath.startsWith('file://')
      ? currentProject.sourceVideoPath
      : `file://${currentProject.sourceVideoPath}`
    : ''

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0 bg-chrome-bg">
      {/* Video Display */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-0">
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            className="max-w-full max-h-full object-contain"
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onError={(e) => {
              const video = e.currentTarget
              console.error('[VideoPlayer] Video error:', {
                error: video.error,
                errorCode: video.error?.code,
                errorMessage: video.error?.message,
                src: video.src
              })
            }}
            playsInline
          />
        ) : (
          <div className="text-chrome-muted text-center">
            <div className="text-4xl mb-2">🎬</div>
            <div className="text-sm">No video loaded</div>
            <div className="text-xs mt-1 text-chrome-muted/60">
              Import a video file to get started
            </div>
          </div>
        )}

        {/* Play/Pause overlay indicator */}
        {playbackState !== 'playing' && videoSrc && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          >
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Duration display */}
        {durationMs > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
            {formatTime(currentTimeMs)} / {formatTime(durationMs)}
          </div>
        )}
      </div>

      {/* Playback Controls */}
      <PlaybackControls />
    </div>
  )
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const milliseconds = Math.floor((ms % 1000) / 10)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
}
