/**
 * WaveformDisplay Component
 * Efficiently renders waveform data using canvas with virtualization
 */

import type { WaveformData } from '@renderer/stores/timeline.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

interface WaveformDisplayProps {
  waveformData: WaveformData
  height: number
  color?: string
}

export function WaveformDisplay({
  waveformData,
  height,
  color = 'rgba(59, 130, 246, 0.6)'
}: WaveformDisplayProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastRenderRef = useRef<{
    scrollPosition: number
    viewportWidth: number
    pixelsPerSecond: number
    dataLength: number
  } | null>(null)

  const { scrollPosition, viewportWidth, pixelsPerSecond } = useTimelineStore(
    useShallow((state) => ({
      scrollPosition: state.scrollPosition,
      viewportWidth: state.viewportWidth,
      pixelsPerSecond: state.pixelsPerSecond
    }))
  )

  // Render the waveform to canvas
  const renderWaveform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { peaks, samplesPerSecond, durationMs } = waveformData
    const dpr = window.devicePixelRatio || 1

    // Update canvas size if needed
    const displayWidth = viewportWidth
    const displayHeight = height
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr
      canvas.height = displayHeight * dpr
      canvas.style.width = `${displayWidth}px`
      canvas.style.height = `${displayHeight}px`
      ctx.scale(dpr, dpr)
    }

    // Check if we need to re-render
    const renderParams = {
      scrollPosition,
      viewportWidth,
      pixelsPerSecond,
      dataLength: peaks.length
    }

    if (
      lastRenderRef.current &&
      lastRenderRef.current.scrollPosition === renderParams.scrollPosition &&
      lastRenderRef.current.viewportWidth === renderParams.viewportWidth &&
      lastRenderRef.current.pixelsPerSecond === renderParams.pixelsPerSecond &&
      lastRenderRef.current.dataLength === renderParams.dataLength
    ) {
      return // No need to re-render
    }

    lastRenderRef.current = renderParams

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight)

    // Calculate visible time range (accounting for the 80px label offset)
    const visibleStartMs = (scrollPosition / pixelsPerSecond) * 1000
    const visibleEndMs = ((scrollPosition + viewportWidth) / pixelsPerSecond) * 1000

    // Add padding to ensure smooth scrolling
    const paddingMs = 500 // 500ms padding on each side
    const startMs = Math.max(0, visibleStartMs - paddingMs)
    const endMs = Math.min(durationMs, visibleEndMs + paddingMs)

    // Calculate which peaks to render
    const msPerSample = 1000 / samplesPerSecond
    const startSample = Math.floor(startMs / msPerSample)
    const endSample = Math.ceil(endMs / msPerSample)

    // Calculate how many peaks fit per pixel at current zoom
    const peaksPerPixel = samplesPerSecond / pixelsPerSecond

    // Draw waveform
    ctx.fillStyle = color

    const centerY = displayHeight / 2
    const maxHeight = displayHeight * 0.9 // Leave a little margin

    if (peaksPerPixel > 1) {
      // When zoomed out: group multiple peaks per pixel
      const groupSize = Math.ceil(peaksPerPixel)

      for (let i = startSample; i < endSample; i += groupSize) {
        // Get max peak in this group
        let maxPeak = 0
        for (let j = i; j < Math.min(i + groupSize, endSample, peaks.length); j++) {
          if (peaks[j] > maxPeak) maxPeak = peaks[j]
        }

        // Calculate x position relative to visible area
        const sampleTimeMs = i * msPerSample
        const sampleX = (sampleTimeMs / 1000) * pixelsPerSecond - scrollPosition

        // Draw centered bar
        const barHeight = maxPeak * maxHeight
        const barWidth = Math.max(1, (groupSize * msPerSample * pixelsPerSecond) / 1000)

        ctx.fillRect(sampleX, centerY - barHeight / 2, barWidth, barHeight)
      }
    } else {
      // When zoomed in: draw each peak as a bar
      const barWidth = Math.max(1, pixelsPerSecond / samplesPerSecond)

      for (let i = startSample; i < endSample && i < peaks.length; i++) {
        const peak = peaks[i]
        const sampleTimeMs = i * msPerSample
        const sampleX = (sampleTimeMs / 1000) * pixelsPerSecond - scrollPosition

        // Draw centered bar
        const barHeight = peak * maxHeight

        ctx.fillRect(sampleX, centerY - barHeight / 2, barWidth, barHeight)
      }
    }
  }, [waveformData, height, color, scrollPosition, viewportWidth, pixelsPerSecond])

  // Render on parameter changes using requestAnimationFrame
  useEffect(() => {
    let frameId: number

    const scheduleRender = () => {
      frameId = requestAnimationFrame(() => {
        renderWaveform()
      })
    }

    scheduleRender()

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [renderWaveform])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left: scrollPosition,
        top: 0,
        width: viewportWidth,
        height,
        display: 'block',
        pointerEvents: 'none'
      }}
    />
  )
}
