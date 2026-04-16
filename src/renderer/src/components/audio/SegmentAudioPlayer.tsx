/**
 * Segment Audio Player
 * Mini player for previewing generated TTS audio in the Properties panel
 */

import { useProjectStore } from '@renderer/stores/project.store'
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
  const redoLipsync = useSegmentStore((state) => state.redoLipsync)
  const currentProject = useProjectStore((state) => state.currentProject)
  const isStale = isSegmentStale(segment)
  const [isLipsyncing, setIsLipsyncing] = useState(false)

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

  const handleRedoLipsync = useCallback(async () => {
    if (!currentProject) return
    setIsLipsyncing(true)
    try {
      await redoLipsync(segment.id, currentProject.id, currentProject.sourceVideoPath)
    } finally {
      setIsLipsyncing(false)
    }
  }, [segment.id, currentProject, redoLipsync])

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

        {/* Redo lip-sync button — only shown for segments that have been lip-synced */}
        {segment.lipsyncVideoPath && (
          <button
            type="button"
            onClick={handleRedoLipsync}
            disabled={isLipsyncing}
            className="p-1 text-chrome-muted hover:text-chrome-text hover:bg-chrome-hover rounded disabled:opacity-50"
            title={isStale ? 'Redo lip-sync (audio changed)' : 'Redo lip-sync'}
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
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Lip-sync status */}
      {isLipsyncing && (
        <div className="flex items-center gap-1.5 px-1.5 py-1 bg-accent-primary/10 border border-accent-primary/30 rounded text-xs text-accent-primary">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Lip-syncing...
        </div>
      )}
    </div>
  )
}
