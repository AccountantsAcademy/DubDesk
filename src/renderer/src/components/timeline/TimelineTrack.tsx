import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useProjectStore } from '@renderer/stores/project.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import type { Segment } from '@shared/types/segment'
import type React from 'react'
import { useEffect, useRef } from 'react'
import { SegmentItem } from './SegmentItem'
import { WaveformDisplay } from './WaveformDisplay'

interface TimelineTrackProps {
  label: string
  type: 'original' | 'dubbed'
  height: number
  segments?: Segment[]
}

export function TimelineTrack({
  label,
  type,
  height,
  segments = []
}: TimelineTrackProps): React.JSX.Element {
  const { showOriginalAudio } = useTimelineStore()
  const { soloOriginal, soloDubbed } = usePlaybackStore()

  // Determine if this track is muted
  const isMuted = (type === 'original' && soloDubbed) || (type === 'dubbed' && soloOriginal)

  // Original track visibility
  if (type === 'original' && !showOriginalAudio) {
    return null as unknown as React.JSX.Element
  }

  return (
    <div
      className={`relative border-b border-chrome-border ${isMuted ? 'opacity-50' : ''}`}
      style={{ height }}
    >
      {/* Track Label */}
      <div
        className="absolute left-0 top-0 bottom-0 w-20 bg-chrome-panel border-r border-chrome-border flex items-center px-2 z-10"
        style={{ position: 'sticky', left: 0 }}
      >
        <span className="text-xs text-chrome-muted truncate">{label}</span>
      </div>

      {/* Track Content */}
      <div className="absolute left-20 right-0 top-0 bottom-0">
        {type === 'original' ? (
          <OriginalAudioTrack height={height} />
        ) : (
          <DubbedSegmentsTrack segments={segments} height={height} />
        )}
      </div>
    </div>
  )
}

function OriginalAudioTrack({ height }: { height: number }): React.JSX.Element {
  const { durationMs } = usePlaybackStore()
  const { msToPixels, waveformData, waveformLoading, waveformError, loadWaveform, clearWaveform } =
    useTimelineStore()
  const currentProject = useProjectStore((state) => state.currentProject)
  const prevProjectIdRef = useRef<string | undefined>(undefined)

  const trackWidth = durationMs > 0 ? msToPixels(durationMs) : 0

  // Clear waveform when project changes
  useEffect(() => {
    const currentId = currentProject?.id
    if (prevProjectIdRef.current !== undefined && prevProjectIdRef.current !== currentId) {
      // Project changed, clear waveform
      clearWaveform()
    }
    prevProjectIdRef.current = currentId
  }, [currentProject?.id, clearWaveform])

  // Load waveform when project is available and waveform not loaded
  useEffect(() => {
    if (
      currentProject?.sourceVideoPath &&
      currentProject?.id &&
      !waveformData &&
      !waveformLoading &&
      !waveformError
    ) {
      loadWaveform(currentProject.sourceVideoPath, currentProject.id)
    }
  }, [
    currentProject?.sourceVideoPath,
    currentProject?.id,
    waveformData,
    waveformLoading,
    waveformError,
    loadWaveform
  ])

  return (
    <div className="h-full bg-chrome-bg/50 relative" style={{ width: trackWidth }}>
      {/* Waveform display */}
      {waveformData ? (
        <WaveformDisplay waveformData={waveformData} height={height} />
      ) : waveformLoading ? (
        <div className="absolute inset-0 flex items-center justify-center text-chrome-muted text-xs">
          <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
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
          Loading waveform...
        </div>
      ) : waveformError ? (
        <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs">
          Waveform unavailable
        </div>
      ) : (
        // Fallback placeholder gradient
        <div
          className="h-full flex items-center"
          style={{
            background: `repeating-linear-gradient(
            90deg,
            transparent 0px,
            rgba(59, 130, 246, 0.15) 1px,
            rgba(59, 130, 246, 0.1) 2px,
            transparent 3px,
            transparent 8px
          )`
          }}
        >
          <div
            className="w-full mx-1"
            style={{
              height: height - 20,
              background:
                'linear-gradient(180deg, transparent 0%, rgba(59, 130, 246, 0.2) 30%, rgba(59, 130, 246, 0.3) 50%, rgba(59, 130, 246, 0.2) 70%, transparent 100%)'
            }}
          />
        </div>
      )}
    </div>
  )
}

interface DubbedSegmentsTrackProps {
  segments: Segment[]
  height: number
}

function DubbedSegmentsTrack({ segments, height }: DubbedSegmentsTrackProps): React.JSX.Element {
  return (
    <div className="h-full relative">
      {segments.map((segment) => (
        <SegmentItem key={segment.id} segment={segment} trackHeight={height} />
      ))}

      {/* Empty state */}
      {segments.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-chrome-muted text-xs">
          No segments - transcribe audio to create segments
        </div>
      )}
    </div>
  )
}
