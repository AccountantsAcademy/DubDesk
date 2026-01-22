import { PLAYBACK_DEFAULTS } from '@shared/constants/defaults'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'

type PlaybackState = 'stopped' | 'playing' | 'paused'

interface PlaybackStoreState {
  state: PlaybackState
  currentTimeMs: number
  durationMs: number
  playbackRate: number
  volume: number
  muted: boolean
  loop: boolean
  loopStartMs: number | null
  loopEndMs: number | null
  originalAudioVolume: number
  dubbedAudioVolume: number
  soloOriginal: boolean
  soloDubbed: boolean
  scrubbing: boolean
  currentSegmentId: string | null
  playingDubbedSegmentId: string | null // Track when dubbed audio is actively playing
}

interface PlaybackActions {
  play: () => void
  pause: () => void
  stop: () => void
  toggle: () => void
  seek: (timeMs: number) => void
  seekRelative: (deltaMs: number) => void
  setCurrentTime: (timeMs: number) => void
  setDuration: (durationMs: number) => void
  setPlaybackRate: (rate: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setLoop: (enabled: boolean, startMs?: number, endMs?: number) => void
  clearLoop: () => void
  setOriginalAudioVolume: (volume: number) => void
  setDubbedAudioVolume: (volume: number) => void
  toggleSoloOriginal: () => void
  toggleSoloDubbed: () => void
  startScrubbing: () => void
  stopScrubbing: () => void
  jumpToSegment: (startTimeMs: number) => void
  jumpToNextSegment: (segments: Array<{ startTimeMs: number }>) => void
  jumpToPreviousSegment: (segments: Array<{ startTimeMs: number }>) => void
  updateCurrentSegment: (
    segments: Array<{ id: string; startTimeMs: number; endTimeMs: number }>,
    currentTimeMs: number
  ) => void
  setPlayingDubbedSegmentId: (segmentId: string | null) => void
  reset: () => void
}

type PlaybackStore = PlaybackStoreState & PlaybackActions

const initialState: PlaybackStoreState = {
  state: 'stopped',
  currentTimeMs: 0,
  durationMs: 0,
  playbackRate: 1,
  volume: PLAYBACK_DEFAULTS.DEFAULT_VOLUME,
  muted: false,
  loop: false,
  loopStartMs: null,
  loopEndMs: null,
  originalAudioVolume: PLAYBACK_DEFAULTS.DEFAULT_ORIGINAL_VOLUME,
  dubbedAudioVolume: PLAYBACK_DEFAULTS.DEFAULT_DUBBED_VOLUME,
  soloOriginal: false,
  soloDubbed: false,
  scrubbing: false,
  currentSegmentId: null,
  playingDubbedSegmentId: null
}

export const usePlaybackStore = create<PlaybackStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      play: () => set({ state: 'playing' }),

      pause: () => set({ state: 'paused' }),

      stop: () => set({ state: 'stopped', currentTimeMs: 0 }),

      toggle: () => {
        const { state } = get()
        set({ state: state === 'playing' ? 'paused' : 'playing' })
      },

      seek: (timeMs) => {
        const { durationMs } = get()
        const clampedTime = Math.max(0, Math.min(durationMs, timeMs))
        set({ currentTimeMs: clampedTime })
      },

      seekRelative: (deltaMs) => {
        const { currentTimeMs, durationMs } = get()
        const newTime = Math.max(0, Math.min(durationMs, currentTimeMs + deltaMs))
        set({ currentTimeMs: newTime })
      },

      setCurrentTime: (timeMs) => {
        const { durationMs, loop, loopStartMs, loopEndMs, state } = get()
        let clampedTime = Math.max(0, Math.min(durationMs, timeMs))

        if (loop && loopStartMs !== null && loopEndMs !== null && state === 'playing') {
          if (clampedTime >= loopEndMs) {
            clampedTime = loopStartMs
          }
        }

        set({ currentTimeMs: clampedTime })
      },

      setDuration: (durationMs) => set({ durationMs }),

      setPlaybackRate: (rate) => {
        const clampedRate = Math.max(
          PLAYBACK_DEFAULTS.MIN_PLAYBACK_RATE,
          Math.min(PLAYBACK_DEFAULTS.MAX_PLAYBACK_RATE, rate)
        )
        set({ playbackRate: clampedRate })
      },

      setVolume: (volume) => {
        const clampedVolume = Math.max(0, Math.min(1, volume))
        set({ volume: clampedVolume, muted: clampedVolume === 0 })
      },

      toggleMute: () => {
        const { muted } = get()
        set({ muted: !muted })
      },

      setLoop: (enabled, startMs, endMs) => {
        set({
          loop: enabled,
          loopStartMs: startMs ?? null,
          loopEndMs: endMs ?? null
        })
      },

      clearLoop: () => {
        set({ loop: false, loopStartMs: null, loopEndMs: null })
      },

      setOriginalAudioVolume: (volume) => {
        const clampedVolume = Math.max(0, Math.min(1, volume))
        set({ originalAudioVolume: clampedVolume })
      },

      setDubbedAudioVolume: (volume) => {
        const clampedVolume = Math.max(0, Math.min(1, volume))
        set({ dubbedAudioVolume: clampedVolume })
      },

      toggleSoloOriginal: () => {
        const { soloOriginal } = get()
        set({ soloOriginal: !soloOriginal, soloDubbed: false })
      },

      toggleSoloDubbed: () => {
        const { soloDubbed } = get()
        set({ soloDubbed: !soloDubbed, soloOriginal: false })
      },

      startScrubbing: () => set({ scrubbing: true }),

      stopScrubbing: () => set({ scrubbing: false }),

      jumpToSegment: (startTimeMs) => {
        set({ currentTimeMs: startTimeMs })
      },

      jumpToNextSegment: (segments) => {
        const { currentTimeMs } = get()
        const sortedSegments = [...segments].sort((a, b) => a.startTimeMs - b.startTimeMs)
        const nextSegment = sortedSegments.find((s) => s.startTimeMs > currentTimeMs)
        if (nextSegment) {
          set({ currentTimeMs: nextSegment.startTimeMs })
        }
      },

      jumpToPreviousSegment: (segments) => {
        const { currentTimeMs } = get()
        const sortedSegments = [...segments].sort((a, b) => b.startTimeMs - a.startTimeMs)
        const prevSegment = sortedSegments.find((s) => s.startTimeMs < currentTimeMs - 100)
        if (prevSegment) {
          set({ currentTimeMs: prevSegment.startTimeMs })
        }
      },

      updateCurrentSegment: (segments, currentTimeMs) => {
        const { currentSegmentId } = get()
        const currentSegment = segments.find(
          (s) => currentTimeMs >= s.startTimeMs && currentTimeMs < s.endTimeMs
        )
        const newSegmentId = currentSegment?.id ?? null

        if (newSegmentId !== currentSegmentId) {
          set({ currentSegmentId: newSegmentId })
        }
      },

      setPlayingDubbedSegmentId: (segmentId) => {
        set({ playingDubbedSegmentId: segmentId })
      },

      reset: () => set(initialState)
    })),
    { name: 'playback-store' }
  )
)

// Selectors
export const selectIsPlaying = (state: PlaybackStore) => state.state === 'playing'

export const selectIsPaused = (state: PlaybackStore) => state.state === 'paused'

export const selectIsStopped = (state: PlaybackStore) => state.state === 'stopped'

export const selectProgress = (state: PlaybackStore) =>
  state.durationMs > 0 ? state.currentTimeMs / state.durationMs : 0

export const selectEffectiveOriginalVolume = (state: PlaybackStore) => {
  if (state.muted) return 0
  if (state.soloDubbed) return 0
  return state.originalAudioVolume * state.volume
}

export const selectEffectiveDubbedVolume = (state: PlaybackStore) => {
  if (state.muted) return 0
  if (state.soloOriginal) return 0
  return state.dubbedAudioVolume * state.volume
}

export const selectCurrentSegmentId = (state: PlaybackStore) => state.currentSegmentId

export const selectPlayingDubbedSegmentId = (state: PlaybackStore) => state.playingDubbedSegmentId

// Returns true if original audio should be muted (dubbed audio is playing)
export const selectShouldMuteOriginal = (state: PlaybackStore) =>
  state.playingDubbedSegmentId !== null && !state.soloOriginal
