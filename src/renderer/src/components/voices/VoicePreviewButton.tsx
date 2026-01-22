/**
 * Voice Preview Button
 * Play button that uses the voice's preview URL
 */

import type React from 'react'
import { useCallback, useRef, useState } from 'react'

interface VoicePreviewButtonProps {
  previewUrl?: string
  voiceName: string
  size?: 'sm' | 'md'
}

export function VoicePreviewButton({
  previewUrl,
  voiceName,
  size = 'sm'
}: VoicePreviewButtonProps): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentUrlRef = useRef<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      if (!previewUrl) return

      // If playing the same audio, toggle pause
      if (isPlaying && audioRef.current && currentUrlRef.current === previewUrl) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        setIsPlaying(false)
        return
      }

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      // Create new audio element for this URL
      currentUrlRef.current = previewUrl
      audioRef.current = new Audio(previewUrl)
      audioRef.current.addEventListener('ended', () => setIsPlaying(false))
      audioRef.current.addEventListener('error', (err) => {
        console.error('Audio preview error:', err)
        setIsPlaying(false)
      })

      audioRef.current.play().catch((err) => {
        console.error('Failed to play preview:', err)
        setIsPlaying(false)
      })
      setIsPlaying(true)
    },
    [previewUrl, isPlaying]
  )

  if (!previewUrl) {
    return (
      <button
        type="button"
        disabled
        className={`${size === 'sm' ? 'p-1' : 'p-1.5'} text-chrome-muted opacity-50 cursor-not-allowed`}
        title="No preview available"
      >
        <PlayIcon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${size === 'sm' ? 'p-1' : 'p-1.5'} text-chrome-muted hover:text-chrome-text rounded hover:bg-chrome-hover transition-colors`}
      title={`Preview ${voiceName}`}
    >
      {isPlaying ? (
        <StopIcon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      ) : (
        <PlayIcon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      )}
    </button>
  )
}

function PlayIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function StopIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  )
}
