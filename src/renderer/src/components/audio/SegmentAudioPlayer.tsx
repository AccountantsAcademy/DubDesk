/**
 * Segment Audio Player
 * Mini player for previewing generated TTS audio in the Properties panel
 */

import { isSegmentStale, useSegmentStore } from '@renderer/stores/segment.store'
import type { Segment } from '@shared/types/segment'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface SegmentAudioPlayerProps {
  segment: Segment
}

export function SegmentAudioPlayer({ segment }: SegmentAudioPlayerProps): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isRegenerating, setIsRegenerating] = useState(false)

  const regenerateSegmentAudio = useSegmentStore((state) => state.regenerateSegmentAudio)
  const isStale = isSegmentStale(segment)

  // Reset state when segment changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally run only when segment ID changes
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [segment.id])

  const handlePlayPause = useCallback(() => {
    if (!segment.audioFilePath) return

    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    // Create or reuse audio element
    if (!audioRef.current) {
      // Use file:// protocol for local files
      const audioPath = segment.audioFilePath.startsWith('file://')
        ? segment.audioFilePath
        : `file://${segment.audioFilePath}`
      audioRef.current = new Audio(audioPath)

      audioRef.current.addEventListener('loadedmetadata', () => {
        if (audioRef.current) {
          setDuration(audioRef.current.duration * 1000)
        }
      })

      audioRef.current.addEventListener('timeupdate', () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime * 1000)
        }
      })

      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false)
        setCurrentTime(0)
      })

      audioRef.current.addEventListener('error', () => {
        setIsPlaying(false)
      })
    }

    audioRef.current.play()
    setIsPlaying(true)
  }, [segment.audioFilePath, isPlaying])

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true)
    try {
      await regenerateSegmentAudio(segment.id)
    } finally {
      setIsRegenerating(false)
    }
  }, [segment.id, regenerateSegmentAudio])

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // No audio generated yet
  if (!segment.audioFilePath) {
    return (
      <div className="flex items-center gap-1.5 px-1.5 py-1 bg-chrome-bg border border-chrome-border rounded">
        <div className="flex-1 text-xs text-chrome-muted">No audio</div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isRegenerating || !segment.translatedText?.trim()}
          className="px-1.5 py-0.5 text-[10px] bg-accent-primary hover:bg-accent-primary-hover text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRegenerating ? 'Generating...' : 'Generate'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Player Controls */}
      <div className="flex items-center gap-1.5 px-1.5 py-1 bg-chrome-bg border border-chrome-border rounded">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={handlePlayPause}
          className="p-1 text-chrome-text hover:bg-chrome-hover rounded"
        >
          {isPlaying ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress Bar */}
        <div className="flex-1 flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-chrome-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[10px] text-chrome-muted">
            {formatTime(currentTime)}/{formatTime(duration || segment.audioDurationMs || 0)}
          </span>
        </div>

        {/* Regenerate button inline */}
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="p-1 text-chrome-muted hover:text-chrome-text hover:bg-chrome-hover rounded disabled:opacity-50"
          title={isStale ? 'Regenerate (outdated)' : 'Regenerate audio'}
        >
          <svg
            className={`w-3.5 h-3.5 ${isStale ? 'text-yellow-500' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
