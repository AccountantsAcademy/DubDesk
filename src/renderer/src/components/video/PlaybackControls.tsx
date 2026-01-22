import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import type React from 'react'
import { useCallback } from 'react'

export function PlaybackControls(): React.JSX.Element {
  const {
    state: playbackState,
    currentTimeMs,
    durationMs,
    playbackRate,
    volume,
    muted,
    loop,
    stop,
    toggle,
    seek,
    setPlaybackRate,
    setVolume,
    toggleMute,
    jumpToNextSegment,
    jumpToPreviousSegment,
    setLoop
  } = usePlaybackStore()

  const segments = useSegmentStore((state) => state.segments)

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value))
    },
    [seek]
  )

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value))
    },
    [setVolume]
  )

  const handlePreviousSegment = useCallback(() => {
    jumpToPreviousSegment(segments.map((s) => ({ startTimeMs: s.startTimeMs })))
  }, [jumpToPreviousSegment, segments])

  const handleNextSegment = useCallback(() => {
    jumpToNextSegment(segments.map((s) => ({ startTimeMs: s.startTimeMs })))
  }, [jumpToNextSegment, segments])

  const toggleLoop = useCallback(() => {
    if (loop) {
      setLoop(false)
    } else {
      setLoop(true, 0, durationMs)
    }
  }, [loop, setLoop, durationMs])

  const playbackRates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

  return (
    <div className="bg-chrome-panel border-t border-chrome-border px-4 py-2">
      {/* Progress bar */}
      <div className="mb-2">
        <input
          type="range"
          min={0}
          max={durationMs || 100}
          value={currentTimeMs}
          onChange={handleSeek}
          className="w-full h-1 bg-chrome-border rounded-lg appearance-none cursor-pointer accent-accent-primary"
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Left section: Transport controls */}
        <div className="flex items-center gap-1">
          {/* Previous segment */}
          <button
            onClick={handlePreviousSegment}
            className="p-2 rounded hover:bg-chrome-hover text-chrome-text"
            title="Previous segment"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {/* Stop */}
          <button
            onClick={stop}
            className="p-2 rounded hover:bg-chrome-hover text-chrome-text"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={toggle}
            className="p-2 rounded-full bg-accent-primary hover:bg-accent-hover text-white"
            title={playbackState === 'playing' ? 'Pause' : 'Play'}
          >
            {playbackState === 'playing' ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Next segment */}
          <button
            onClick={handleNextSegment}
            className="p-2 rounded hover:bg-chrome-hover text-chrome-text"
            title="Next segment"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {/* Loop toggle */}
          <button
            onClick={toggleLoop}
            className={`p-2 rounded hover:bg-chrome-hover ${
              loop ? 'text-accent-primary' : 'text-chrome-muted'
            }`}
            title="Toggle loop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
            </svg>
          </button>
        </div>

        {/* Center section: Time display */}
        <div className="font-mono text-sm text-chrome-text">
          {formatTime(currentTimeMs)} / {formatTime(durationMs)}
        </div>

        {/* Right section: Volume and speed */}
        <div className="flex items-center gap-3">
          {/* Playback speed */}
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            className="bg-chrome-bg border border-chrome-border rounded px-2 py-1 text-sm text-chrome-text"
          >
            {playbackRates.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>

          {/* Volume controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-1 rounded hover:bg-chrome-hover text-chrome-text"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : volume < 0.5 ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-chrome-border rounded-lg appearance-none cursor-pointer accent-accent-primary"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
