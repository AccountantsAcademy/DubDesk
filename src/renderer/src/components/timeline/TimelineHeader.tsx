import { useTimelineStore } from '@renderer/stores/timeline.store'
import type React from 'react'
import { useMemo } from 'react'

interface TimelineHeaderProps {
  width: number
}

export function TimelineHeader({ width }: TimelineHeaderProps): React.JSX.Element {
  const { zoom, pixelsToMs } = useTimelineStore()

  // Calculate tick marks based on zoom level
  const ticks = useMemo(() => {
    const result: { x: number; label: string; isMajor: boolean }[] = []

    // Determine tick interval based on zoom
    // At zoom 1, we want major ticks every second
    // At higher zoom, we want more detail (every 100ms, 10ms, etc.)
    let majorInterval: number // in ms
    let minorPerMajor: number

    if (zoom >= 4) {
      majorInterval = 100 // 100ms
      minorPerMajor = 10
    } else if (zoom >= 2) {
      majorInterval = 500 // 500ms
      minorPerMajor = 5
    } else if (zoom >= 1) {
      majorInterval = 1000 // 1 second
      minorPerMajor = 10
    } else if (zoom >= 0.5) {
      majorInterval = 5000 // 5 seconds
      minorPerMajor = 5
    } else if (zoom >= 0.1) {
      majorInterval = 30000 // 30 seconds
      minorPerMajor = 6
    } else if (zoom >= 0.05) {
      majorInterval = 60000 // 1 minute
      minorPerMajor = 6
    } else {
      majorInterval = 300000 // 5 minutes
      minorPerMajor = 5
    }

    const minorInterval = majorInterval / minorPerMajor
    const durationMs = pixelsToMs(width)
    const numTicks = Math.ceil(durationMs / minorInterval)

    // Limit number of ticks to prevent performance issues
    const maxTicks = 500
    const skipFactor = numTicks > maxTicks ? Math.ceil(numTicks / maxTicks) : 1

    for (let i = 0; i <= numTicks; i += skipFactor) {
      const timeMs = i * minorInterval
      const x = (timeMs / 1000) * 100 * zoom // Convert to pixels
      const isMajor = timeMs % majorInterval === 0

      if (isMajor) {
        result.push({
          x,
          label: formatTimeLabel(timeMs),
          isMajor: true
        })
      } else if (skipFactor === 1) {
        // Only show minor ticks if we're not skipping
        result.push({
          x,
          label: '',
          isMajor: false
        })
      }
    }

    return result
  }, [width, zoom, pixelsToMs])

  return (
    <div className="h-6 bg-chrome-panel border-b border-chrome-border relative flex">
      {/* Sticky label area - stays visible when scrolling */}
      <div
        className="w-20 flex-shrink-0 border-r border-chrome-border flex items-center justify-center bg-chrome-panel z-10"
        style={{ position: 'sticky', left: 0 }}
      >
        <span className="text-[10px] text-chrome-muted font-mono">Time</span>
      </div>
      <svg
        width={Math.max(width, 100)}
        height={24}
        className="flex-shrink-0"
        style={{ overflow: 'visible' }}
      >
        {ticks.map((tick, index) => (
          <g key={index}>
            <line
              x1={tick.x}
              y1={tick.isMajor ? 8 : 16}
              x2={tick.x}
              y2={24}
              className={tick.isMajor ? 'stroke-chrome-muted' : 'stroke-chrome-border'}
              strokeWidth={1}
            />
            {tick.isMajor && tick.label && (
              <text
                x={tick.x + 4}
                y={14}
                className="fill-chrome-muted text-[10px] font-mono"
                style={{ fontSize: '10px' }}
              >
                {tick.label}
              </text>
            )}
          </g>
        ))}
        {/* End marker showing total duration */}
        {width > 50 && (
          <g>
            <line
              x1={width - 1}
              y1={8}
              x2={width - 1}
              y2={24}
              className="stroke-chrome-muted"
              strokeWidth={1}
            />
            <text
              x={width - 4}
              y={14}
              textAnchor="end"
              className="fill-chrome-muted font-mono"
              style={{ fontSize: '10px' }}
            >
              {formatTimeLabel(pixelsToMs(width))}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

function formatTimeLabel(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return `${seconds}s`
}
