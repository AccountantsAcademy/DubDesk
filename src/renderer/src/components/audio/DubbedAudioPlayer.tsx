/**
 * DubbedAudioPlayer
 * Plays generated TTS audio for segments during video playback
 * Uses Howler.js for reliable audio preloading and playback
 * Subscribes directly to video element for precise timing sync
 */

import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useProjectStore } from '@renderer/stores/project.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import type { Segment } from '@shared/types/segment'
import { Howl } from 'howler'
import { useCallback, useEffect, useRef } from 'react'

interface PreloadedSound {
  howl: Howl
  segment: Segment
  loaded: boolean
}

interface ActiveSound {
  segmentId: string
  howl: Howl
  startTimeMs: number
  endTimeMs: number
}

export function DubbedAudioPlayer(): null {
  const segments = useSegmentStore((state) => state.segments)
  const currentProject = useProjectStore((state) => state.currentProject)
  const volume = usePlaybackStore((state) => state.volume)
  const muted = usePlaybackStore((state) => state.muted)
  const dubbedAudioVolume = usePlaybackStore((state) => state.dubbedAudioVolume)
  const soloOriginal = usePlaybackStore((state) => state.soloOriginal)
  const playbackRate = usePlaybackStore((state) => state.playbackRate)
  const setPlayingDubbedSegmentId = usePlaybackStore((state) => state.setPlayingDubbedSegmentId)
  const setInSmallGap = usePlaybackStore((state) => state.setInSmallGap)

  // Get the minimum gap setting from project settings
  const minGapForOriginalMs = currentProject?.settings?.minGapForOriginalMs ?? 5000

  // Preloaded Howl instances
  const preloadedSoundsRef = useRef<Map<string, PreloadedSound>>(new Map())
  // Currently playing sound
  const activeSoundRef = useRef<ActiveSound | null>(null)
  // Track segments with audio for quick lookup (sorted by start time for efficiency)
  const sortedSegmentsRef = useRef<Segment[]>([])
  // Video element reference
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  // Animation frame for polling
  const rafIdRef = useRef<number | null>(null)
  // Last processed time to detect seeks
  const lastTimeRef = useRef<number>(0)

  // Calculate effective volume for dubbed audio
  const getEffectiveVolume = useCallback(() => {
    if (muted || soloOriginal) return 0
    return volume * dubbedAudioVolume
  }, [muted, soloOriginal, volume, dubbedAudioVolume])

  // Preload audio for all segments with audio files
  useEffect(() => {
    const currentSounds = preloadedSoundsRef.current
    const newSounds = new Map<string, PreloadedSound>()
    const segmentsWithAudio: Segment[] = []

    for (const segment of segments) {
      if (segment.audioFilePath) {
        segmentsWithAudio.push(segment)

        // Check if we can reuse existing sound
        const existing = currentSounds.get(segment.id)
        const isSameAudio =
          existing &&
          existing.segment.audioFilePath === segment.audioFilePath &&
          existing.segment.audioGeneratedAt === segment.audioGeneratedAt

        if (isSameAudio) {
          newSounds.set(segment.id, existing)
        } else {
          // Create new Howl with preloading
          const audioUrl = segment.audioFilePath.startsWith('file://')
            ? segment.audioFilePath
            : `file://${segment.audioFilePath}`
          // Add cache buster for regenerated audio
          const cacheBuster = segment.audioGeneratedAt
            ? `?t=${new Date(segment.audioGeneratedAt).getTime()}`
            : `?t=${Date.now()}`

          const howl = new Howl({
            src: [`${audioUrl}${cacheBuster}`],
            preload: true,
            html5: true,
            volume: getEffectiveVolume(),
            rate: playbackRate,
            onloaderror: (_id, err) => {
              console.warn(
                `[DubbedAudioPlayer] Failed to load audio for segment ${segment.id}:`,
                err
              )
            }
          })

          const preloaded: PreloadedSound = {
            howl,
            segment,
            loaded: false
          }

          howl.once('load', () => {
            preloaded.loaded = true
          })

          newSounds.set(segment.id, preloaded)
        }
      }
    }

    // Unload old sounds that are no longer needed
    for (const [id, sound] of currentSounds) {
      if (!newSounds.has(id)) {
        sound.howl.unload()
      }
    }

    // Sort segments by start time for efficient lookup
    segmentsWithAudio.sort((a, b) => a.startTimeMs - b.startTimeMs)
    sortedSegmentsRef.current = segmentsWithAudio
    preloadedSoundsRef.current = newSounds
  }, [segments, getEffectiveVolume, playbackRate])

  // Find segment at given time (binary search for efficiency)
  const findSegmentAtTime = useCallback((timeMs: number): Segment | null => {
    const segments = sortedSegmentsRef.current
    for (const segment of segments) {
      if (timeMs >= segment.startTimeMs && timeMs < segment.endTimeMs) {
        return segment
      }
      // Early exit if we've passed the current time
      if (segment.startTimeMs > timeMs) break
    }
    return null
  }, [])

  // Find the next segment after a given time
  const findNextSegment = useCallback((timeMs: number): Segment | null => {
    const segments = sortedSegmentsRef.current
    for (const segment of segments) {
      if (segment.startTimeMs > timeMs) {
        return segment
      }
    }
    return null
  }, [])

  // Find the previous segment that ended before the given time
  const findPreviousSegment = useCallback((timeMs: number): Segment | null => {
    const segments = sortedSegmentsRef.current
    let prevSegment: Segment | null = null
    for (const segment of segments) {
      if (segment.endTimeMs <= timeMs) {
        prevSegment = segment
      } else {
        break
      }
    }
    return prevSegment
  }, [])

  // Stop current audio
  const stopCurrentAudio = useCallback(() => {
    if (activeSoundRef.current) {
      activeSoundRef.current.howl.stop()
      activeSoundRef.current = null
      setPlayingDubbedSegmentId(null)
    }
  }, [setPlayingDubbedSegmentId])

  // Start playing a segment's audio
  const startSegmentAudio = useCallback(
    (segment: Segment, videoElement: HTMLVideoElement, offsetMs: number = 0) => {
      const preloaded = preloadedSoundsRef.current.get(segment.id)
      if (!preloaded) return

      // Stop any currently playing audio
      stopCurrentAudio()

      const { howl } = preloaded

      // Update volume and rate
      howl.volume(getEffectiveVolume())
      howl.rate(playbackRate)

      // Calculate seek position within the audio
      const segmentOffsetMs = Math.max(0, offsetMs)
      let seekPosition = 0
      if (segment.audioDurationMs && segmentOffsetMs > 0) {
        const segmentDuration = segment.endTimeMs - segment.startTimeMs
        seekPosition = (segmentOffsetMs / segmentDuration) * (segment.audioDurationMs / 1000)
      }

      activeSoundRef.current = {
        segmentId: segment.id,
        howl,
        startTimeMs: segment.startTimeMs,
        endTimeMs: segment.endTimeMs
      }

      setPlayingDubbedSegmentId(segment.id)

      // Only play if video is playing
      if (!videoElement.paused) {
        howl.seek(seekPosition)
        howl.play()
      }
    },
    [stopCurrentAudio, getEffectiveVolume, playbackRate, setPlayingDubbedSegmentId]
  )

  // Main sync loop - runs via requestAnimationFrame for precise timing
  const syncWithVideo = useCallback(
    (videoElement: HTMLVideoElement) => {
      const currentTimeMs = videoElement.currentTime * 1000
      const active = activeSoundRef.current
      const timeDelta = Math.abs(currentTimeMs - lastTimeRef.current)
      const isSeeking = timeDelta > 300

      lastTimeRef.current = currentTimeMs

      // Check if we're still within the active segment
      if (active) {
        if (currentTimeMs >= active.startTimeMs && currentTimeMs < active.endTimeMs) {
          // Still in segment - handle seeking within segment
          if (isSeeking && !videoElement.paused) {
            const segment = sortedSegmentsRef.current.find((s) => s.id === active.segmentId)
            if (segment) {
              const offsetMs = currentTimeMs - segment.startTimeMs
              startSegmentAudio(segment, videoElement, offsetMs)
            }
          }
          // Clear small gap state when we're in a segment
          setInSmallGap(false)
          return
        } else {
          // Left the segment - check if next segment is within gap threshold
          const nextSegment = findNextSegment(currentTimeMs)
          if (nextSegment) {
            const gapDurationMs = nextSegment.startTimeMs - currentTimeMs
            if (gapDurationMs > 0 && gapDurationMs < minGapForOriginalMs) {
              // Small gap - keep original audio muted
              setInSmallGap(true)
            } else {
              // Large gap - allow original audio
              setInSmallGap(false)
            }
          } else {
            // No more segments - allow original audio
            setInSmallGap(false)
          }
          stopCurrentAudio()
        }
      }

      // Check if we've entered a new segment
      const segmentAtTime = findSegmentAtTime(currentTimeMs)
      if (segmentAtTime && !videoElement.paused) {
        const offsetMs = currentTimeMs - segmentAtTime.startTimeMs
        // Clear small gap state when entering a segment
        setInSmallGap(false)
        startSegmentAudio(segmentAtTime, videoElement, offsetMs)
      } else if (!segmentAtTime) {
        // Not in a segment - check if we're in a small gap BETWEEN two segments
        // We only apply small gap logic if there's a previous segment (we're not before the first one)
        const prevSegment = findPreviousSegment(currentTimeMs)
        const nextSegment = findNextSegment(currentTimeMs)

        if (prevSegment && nextSegment) {
          // We're between two segments - check the gap size
          const gapDurationMs = nextSegment.startTimeMs - prevSegment.endTimeMs
          if (gapDurationMs > 0 && gapDurationMs < minGapForOriginalMs) {
            // Small gap - keep original audio muted
            setInSmallGap(true)
          } else {
            // Large gap - allow original audio
            setInSmallGap(false)
          }
        } else {
          // Either before first segment or after last segment - allow original audio
          setInSmallGap(false)
        }
      }
    },
    [
      findSegmentAtTime,
      findNextSegment,
      findPreviousSegment,
      startSegmentAudio,
      stopCurrentAudio,
      setInSmallGap,
      minGapForOriginalMs
    ]
  )

  // Set up video element subscription
  useEffect(() => {
    // Find the video element in the DOM
    const videoElement = document.querySelector('video') as HTMLVideoElement | null
    if (!videoElement) return

    videoElementRef.current = videoElement

    // Handle play/pause sync
    const handlePlay = () => {
      const active = activeSoundRef.current
      if (active && !active.howl.playing()) {
        active.howl.play()
      }
    }

    const handlePause = () => {
      const active = activeSoundRef.current
      if (active) {
        active.howl.pause()
      }
    }

    // Use requestAnimationFrame for smooth sync during playback
    const tick = () => {
      if (videoElement && !videoElement.paused) {
        syncWithVideo(videoElement)
      }
      rafIdRef.current = requestAnimationFrame(tick)
    }

    // Also handle timeupdate for when video is paused but time changes (seeking)
    const handleTimeUpdate = () => {
      if (videoElement.paused) {
        syncWithVideo(videoElement)
      }
    }

    // Handle seeking
    const handleSeeking = () => {
      // Stop audio during seek to prevent glitches
      stopCurrentAudio()
    }

    const handleSeeked = () => {
      // After seek completes, sync with new position
      syncWithVideo(videoElement)
    }

    videoElement.addEventListener('play', handlePlay)
    videoElement.addEventListener('pause', handlePause)
    videoElement.addEventListener('timeupdate', handleTimeUpdate)
    videoElement.addEventListener('seeking', handleSeeking)
    videoElement.addEventListener('seeked', handleSeeked)

    // Start the animation frame loop
    rafIdRef.current = requestAnimationFrame(tick)

    return () => {
      videoElement.removeEventListener('play', handlePlay)
      videoElement.removeEventListener('pause', handlePause)
      videoElement.removeEventListener('timeupdate', handleTimeUpdate)
      videoElement.removeEventListener('seeking', handleSeeking)
      videoElement.removeEventListener('seeked', handleSeeked)
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [syncWithVideo, stopCurrentAudio])

  // Handle volume changes
  useEffect(() => {
    const effectiveVolume = getEffectiveVolume()

    // Update active sound
    const active = activeSoundRef.current
    if (active) {
      active.howl.volume(effectiveVolume)
    }

    // Update all preloaded sounds for next play
    for (const sound of preloadedSoundsRef.current.values()) {
      sound.howl.volume(effectiveVolume)
    }
  }, [getEffectiveVolume])

  // Handle playback rate changes
  useEffect(() => {
    // Update active sound
    const active = activeSoundRef.current
    if (active) {
      active.howl.rate(playbackRate)
    }

    // Update all preloaded sounds for next play
    for (const sound of preloadedSoundsRef.current.values()) {
      sound.howl.rate(playbackRate)
    }
  }, [playbackRate])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
      if (activeSoundRef.current) {
        activeSoundRef.current.howl.stop()
      }
      for (const sound of preloadedSoundsRef.current.values()) {
        sound.howl.unload()
      }
      preloadedSoundsRef.current.clear()
    }
  }, [])

  return null
}

export default DubbedAudioPlayer
