import {
  selectEffectiveDubbedVolume,
  selectEffectiveOriginalVolume,
  selectIsPaused,
  selectIsPlaying,
  selectIsStopped,
  selectProgress,
  usePlaybackStore
} from '@renderer/stores/playback.store'
import { beforeEach, describe, expect, it } from 'vitest'

describe('PlaybackStore', () => {
  beforeEach(() => {
    usePlaybackStore.getState().reset()
  })

  describe('play/pause/stop', () => {
    it('should start in stopped state', () => {
      const state = usePlaybackStore.getState()
      expect(state.state).toBe('stopped')
    })

    it('should transition to playing state when play is called', () => {
      const { play } = usePlaybackStore.getState()
      play()
      expect(usePlaybackStore.getState().state).toBe('playing')
    })

    it('should transition to paused state when pause is called', () => {
      const { play, pause } = usePlaybackStore.getState()
      play()
      pause()
      expect(usePlaybackStore.getState().state).toBe('paused')
    })

    it('should transition to stopped state and reset time when stop is called', () => {
      const { play, setCurrentTime, stop } = usePlaybackStore.getState()
      play()
      setCurrentTime(5000)
      stop()
      const state = usePlaybackStore.getState()
      expect(state.state).toBe('stopped')
      expect(state.currentTimeMs).toBe(0)
    })

    it('should toggle between playing and paused', () => {
      const { toggle } = usePlaybackStore.getState()

      toggle()
      expect(usePlaybackStore.getState().state).toBe('playing')

      toggle()
      expect(usePlaybackStore.getState().state).toBe('paused')

      toggle()
      expect(usePlaybackStore.getState().state).toBe('playing')
    })
  })

  describe('seek', () => {
    it('should set current time', () => {
      const { setDuration, seek } = usePlaybackStore.getState()
      setDuration(10000)
      seek(5000)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(5000)
    })

    it('should clamp time to 0 when seeking before start', () => {
      const { setDuration, seek } = usePlaybackStore.getState()
      setDuration(10000)
      seek(-1000)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(0)
    })

    it('should clamp time to duration when seeking past end', () => {
      const { setDuration, seek } = usePlaybackStore.getState()
      setDuration(10000)
      seek(15000)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(10000)
    })

    it('should seek relative to current position', () => {
      const { setDuration, seek, seekRelative } = usePlaybackStore.getState()
      setDuration(10000)
      seek(5000)
      seekRelative(1000)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(6000)

      seekRelative(-2000)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(4000)
    })
  })

  describe('playback rate', () => {
    it('should set playback rate', () => {
      const { setPlaybackRate } = usePlaybackStore.getState()
      setPlaybackRate(1.5)
      expect(usePlaybackStore.getState().playbackRate).toBe(1.5)
    })

    it('should clamp playback rate to min value', () => {
      const { setPlaybackRate } = usePlaybackStore.getState()
      setPlaybackRate(0.1)
      expect(usePlaybackStore.getState().playbackRate).toBe(0.25)
    })

    it('should clamp playback rate to max value', () => {
      const { setPlaybackRate } = usePlaybackStore.getState()
      setPlaybackRate(5)
      expect(usePlaybackStore.getState().playbackRate).toBe(2)
    })
  })

  describe('volume', () => {
    it('should set volume', () => {
      const { setVolume } = usePlaybackStore.getState()
      setVolume(0.5)
      expect(usePlaybackStore.getState().volume).toBe(0.5)
    })

    it('should clamp volume to 0-1 range', () => {
      const { setVolume } = usePlaybackStore.getState()
      setVolume(-0.5)
      expect(usePlaybackStore.getState().volume).toBe(0)

      setVolume(1.5)
      expect(usePlaybackStore.getState().volume).toBe(1)
    })

    it('should toggle mute', () => {
      const { toggleMute } = usePlaybackStore.getState()

      toggleMute()
      expect(usePlaybackStore.getState().muted).toBe(true)

      toggleMute()
      expect(usePlaybackStore.getState().muted).toBe(false)
    })

    it('should auto-mute when volume is set to 0', () => {
      const { setVolume } = usePlaybackStore.getState()
      setVolume(0)
      expect(usePlaybackStore.getState().muted).toBe(true)
    })
  })

  describe('loop', () => {
    it('should set loop region', () => {
      const { setLoop } = usePlaybackStore.getState()
      setLoop(true, 1000, 5000)
      const state = usePlaybackStore.getState()
      expect(state.loop).toBe(true)
      expect(state.loopStartMs).toBe(1000)
      expect(state.loopEndMs).toBe(5000)
    })

    it('should clear loop', () => {
      const { setLoop, clearLoop } = usePlaybackStore.getState()
      setLoop(true, 1000, 5000)
      clearLoop()
      const state = usePlaybackStore.getState()
      expect(state.loop).toBe(false)
      expect(state.loopStartMs).toBeNull()
      expect(state.loopEndMs).toBeNull()
    })
  })

  describe('audio volumes', () => {
    it('should set original audio volume', () => {
      const { setOriginalAudioVolume } = usePlaybackStore.getState()
      setOriginalAudioVolume(0.7)
      expect(usePlaybackStore.getState().originalAudioVolume).toBe(0.7)
    })

    it('should set dubbed audio volume', () => {
      const { setDubbedAudioVolume } = usePlaybackStore.getState()
      setDubbedAudioVolume(0.9)
      expect(usePlaybackStore.getState().dubbedAudioVolume).toBe(0.9)
    })

    it('should toggle solo original', () => {
      const { toggleSoloOriginal } = usePlaybackStore.getState()
      toggleSoloOriginal()
      expect(usePlaybackStore.getState().soloOriginal).toBe(true)
      expect(usePlaybackStore.getState().soloDubbed).toBe(false)
    })

    it('should toggle solo dubbed and clear solo original', () => {
      const { toggleSoloOriginal, toggleSoloDubbed } = usePlaybackStore.getState()
      toggleSoloOriginal()
      toggleSoloDubbed()
      expect(usePlaybackStore.getState().soloOriginal).toBe(false)
      expect(usePlaybackStore.getState().soloDubbed).toBe(true)
    })
  })

  describe('segment navigation', () => {
    it('should jump to segment', () => {
      const { setDuration, jumpToSegment } = usePlaybackStore.getState()
      setDuration(10000)
      jumpToSegment(3000)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(3000)
    })

    it('should jump to next segment', () => {
      const { setDuration, seek, jumpToNextSegment } = usePlaybackStore.getState()
      setDuration(10000)
      seek(2500)

      const segments = [{ startTimeMs: 1000 }, { startTimeMs: 3000 }, { startTimeMs: 5000 }]

      jumpToNextSegment(segments)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(3000)
    })

    it('should jump to previous segment', () => {
      const { setDuration, seek, jumpToPreviousSegment } = usePlaybackStore.getState()
      setDuration(10000)
      seek(4000)

      const segments = [{ startTimeMs: 1000 }, { startTimeMs: 3000 }, { startTimeMs: 5000 }]

      jumpToPreviousSegment(segments)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(3000)
    })

    it('should not jump when no previous segment exists', () => {
      const { setDuration, seek, jumpToPreviousSegment } = usePlaybackStore.getState()
      setDuration(10000)
      seek(500) // Before first segment

      const segments = [{ startTimeMs: 1000 }, { startTimeMs: 3000 }]

      jumpToPreviousSegment(segments)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(500) // Unchanged
    })

    it('should not jump when no next segment exists', () => {
      const { setDuration, seek, jumpToNextSegment } = usePlaybackStore.getState()
      setDuration(10000)
      seek(6000) // After last segment

      const segments = [{ startTimeMs: 1000 }, { startTimeMs: 3000 }, { startTimeMs: 5000 }]

      jumpToNextSegment(segments)
      expect(usePlaybackStore.getState().currentTimeMs).toBe(6000) // Unchanged
    })
  })

  describe('scrubbing', () => {
    it('should start scrubbing', () => {
      const { startScrubbing } = usePlaybackStore.getState()
      startScrubbing()
      expect(usePlaybackStore.getState().scrubbing).toBe(true)
    })

    it('should stop scrubbing', () => {
      const { startScrubbing, stopScrubbing } = usePlaybackStore.getState()
      startScrubbing()
      stopScrubbing()
      expect(usePlaybackStore.getState().scrubbing).toBe(false)
    })
  })

  describe('setCurrentTime with loop', () => {
    it('should loop back to start when reaching loop end while playing', () => {
      const { setDuration, setLoop, play, setCurrentTime } = usePlaybackStore.getState()
      setDuration(10000)
      setLoop(true, 2000, 5000)
      play()

      // Set time past loop end
      setCurrentTime(5500)

      expect(usePlaybackStore.getState().currentTimeMs).toBe(2000) // Looped back
    })

    it('should not loop when paused', () => {
      const { setDuration, setLoop, setCurrentTime } = usePlaybackStore.getState()
      setDuration(10000)
      setLoop(true, 2000, 5000)

      // Set time past loop end while stopped
      setCurrentTime(5500)

      expect(usePlaybackStore.getState().currentTimeMs).toBe(5500) // Not looped
    })

    it('should not loop when time is within loop region', () => {
      const { setDuration, setLoop, play, setCurrentTime } = usePlaybackStore.getState()
      setDuration(10000)
      setLoop(true, 2000, 5000)
      play()

      setCurrentTime(3000)

      expect(usePlaybackStore.getState().currentTimeMs).toBe(3000) // Within loop, no change
    })
  })

  describe('selectors', () => {
    it('selectIsPlaying should return true when playing', () => {
      const { play } = usePlaybackStore.getState()
      play()
      expect(selectIsPlaying(usePlaybackStore.getState())).toBe(true)
      expect(selectIsPaused(usePlaybackStore.getState())).toBe(false)
      expect(selectIsStopped(usePlaybackStore.getState())).toBe(false)
    })

    it('selectIsPaused should return true when paused', () => {
      const { play, pause } = usePlaybackStore.getState()
      play()
      pause()
      expect(selectIsPlaying(usePlaybackStore.getState())).toBe(false)
      expect(selectIsPaused(usePlaybackStore.getState())).toBe(true)
      expect(selectIsStopped(usePlaybackStore.getState())).toBe(false)
    })

    it('selectIsStopped should return true when stopped', () => {
      expect(selectIsPlaying(usePlaybackStore.getState())).toBe(false)
      expect(selectIsPaused(usePlaybackStore.getState())).toBe(false)
      expect(selectIsStopped(usePlaybackStore.getState())).toBe(true)
    })

    it('selectProgress should return correct progress', () => {
      const { setDuration, seek } = usePlaybackStore.getState()
      setDuration(10000)
      seek(2500)
      expect(selectProgress(usePlaybackStore.getState())).toBe(0.25)
    })

    it('selectProgress should return 0 when duration is 0', () => {
      expect(selectProgress(usePlaybackStore.getState())).toBe(0)
    })

    it('selectEffectiveOriginalVolume should return 0 when muted', () => {
      const { toggleMute, setOriginalAudioVolume } = usePlaybackStore.getState()
      setOriginalAudioVolume(0.8)
      toggleMute()
      expect(selectEffectiveOriginalVolume(usePlaybackStore.getState())).toBe(0)
    })

    it('selectEffectiveOriginalVolume should return 0 when dubbed is solo', () => {
      const { toggleSoloDubbed, setOriginalAudioVolume } = usePlaybackStore.getState()
      setOriginalAudioVolume(0.8)
      toggleSoloDubbed()
      expect(selectEffectiveOriginalVolume(usePlaybackStore.getState())).toBe(0)
    })

    it('selectEffectiveOriginalVolume should return calculated volume', () => {
      const { setVolume, setOriginalAudioVolume } = usePlaybackStore.getState()
      setVolume(0.5)
      setOriginalAudioVolume(0.8)
      expect(selectEffectiveOriginalVolume(usePlaybackStore.getState())).toBe(0.4) // 0.5 * 0.8
    })

    it('selectEffectiveDubbedVolume should return 0 when muted', () => {
      const { toggleMute, setDubbedAudioVolume } = usePlaybackStore.getState()
      setDubbedAudioVolume(0.8)
      toggleMute()
      expect(selectEffectiveDubbedVolume(usePlaybackStore.getState())).toBe(0)
    })

    it('selectEffectiveDubbedVolume should return 0 when original is solo', () => {
      const { toggleSoloOriginal, setDubbedAudioVolume } = usePlaybackStore.getState()
      setDubbedAudioVolume(0.8)
      toggleSoloOriginal()
      expect(selectEffectiveDubbedVolume(usePlaybackStore.getState())).toBe(0)
    })

    it('selectEffectiveDubbedVolume should return calculated volume', () => {
      const { setVolume, setDubbedAudioVolume } = usePlaybackStore.getState()
      setVolume(0.5)
      setDubbedAudioVolume(0.8)
      expect(selectEffectiveDubbedVolume(usePlaybackStore.getState())).toBe(0.4) // 0.5 * 0.8
    })
  })

  describe('updateCurrentSegment', () => {
    const mockSegments = [
      { id: 'seg-1', startTimeMs: 0, endTimeMs: 5000 },
      { id: 'seg-2', startTimeMs: 5000, endTimeMs: 10000 },
      { id: 'seg-3', startTimeMs: 10000, endTimeMs: 15000 }
    ]

    it('should set currentSegmentId when time falls within a segment', () => {
      const { updateCurrentSegment } = usePlaybackStore.getState()

      // Time at 2500ms should be in seg-1
      updateCurrentSegment(mockSegments as never, 2500)
      expect(usePlaybackStore.getState().currentSegmentId).toBe('seg-1')

      // Time at 7500ms should be in seg-2
      updateCurrentSegment(mockSegments as never, 7500)
      expect(usePlaybackStore.getState().currentSegmentId).toBe('seg-2')
    })

    it('should set currentSegmentId to null when time is not in any segment', () => {
      const { updateCurrentSegment } = usePlaybackStore.getState()

      // Time beyond all segments
      updateCurrentSegment(mockSegments as never, 20000)
      expect(usePlaybackStore.getState().currentSegmentId).toBe(null)
    })

    it('should not update state if segment has not changed', () => {
      const { updateCurrentSegment } = usePlaybackStore.getState()

      // Set initial segment
      updateCurrentSegment(mockSegments as never, 2500)
      expect(usePlaybackStore.getState().currentSegmentId).toBe('seg-1')

      // Call again with same segment - should not trigger state change
      const stateBefore = usePlaybackStore.getState()
      updateCurrentSegment(mockSegments as never, 3000)
      expect(usePlaybackStore.getState().currentSegmentId).toBe('seg-1')
      expect(usePlaybackStore.getState()).toBe(stateBefore) // Same reference
    })

    it('should handle empty segments array', () => {
      const { updateCurrentSegment } = usePlaybackStore.getState()
      updateCurrentSegment([], 5000)
      expect(usePlaybackStore.getState().currentSegmentId).toBe(null)
    })
  })
})
