import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import React, { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

interface WaveformProps {
  audioUrl: string
  color?: string
  height?: number
  className?: string
  onClick?: (timeMs: number) => void
}

export function Waveform({
  audioUrl,
  color = '#3b82f6',
  height = 64,
  className = '',
  onClick
}: WaveformProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const isReadyRef = useRef(false)

  const {
    state: playbackState,
    currentTimeMs,
    playbackRate,
    volume,
    muted,
    setCurrentTime,
    setDuration
  } = usePlaybackStore()

  const zoom = useTimelineStore((state) => state.zoom)

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: color,
      progressColor: `${color}88`,
      cursorColor: '#ff6b35',
      cursorWidth: 2,
      height,
      normalize: true,
      interact: true,
      hideScrollbar: true,
      fillParent: true,
      minPxPerSec: 100 * zoom,
      autoScroll: true,
      autoCenter: true
    })

    wavesurfer.load(audioUrl)

    wavesurfer.on('ready', () => {
      isReadyRef.current = true
      setDuration(wavesurfer.getDuration() * 1000)
    })

    wavesurfer.on('click', (relativeX) => {
      const duration = wavesurfer.getDuration()
      const clickTimeMs = relativeX * duration * 1000
      if (onClick) {
        onClick(clickTimeMs)
      }
      setCurrentTime(clickTimeMs)
    })

    wavesurferRef.current = wavesurfer

    return () => {
      wavesurfer.destroy()
      wavesurferRef.current = null
      isReadyRef.current = false
    }
  }, [audioUrl, color, height, onClick, setCurrentTime, setDuration, zoom])

  // Sync playback state
  useEffect(() => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer || !isReadyRef.current) return

    if (playbackState === 'playing') {
      wavesurfer.play()
    } else {
      wavesurfer.pause()
    }
  }, [playbackState])

  // Sync playback rate
  useEffect(() => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer || !isReadyRef.current) return
    wavesurfer.setPlaybackRate(playbackRate)
  }, [playbackRate])

  // Sync volume
  useEffect(() => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer || !isReadyRef.current) return
    wavesurfer.setVolume(muted ? 0 : volume)
  }, [volume, muted])

  // Sync seek position
  useEffect(() => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer || !isReadyRef.current) return

    const duration = wavesurfer.getDuration()
    if (duration > 0) {
      const progress = currentTimeMs / 1000 / duration
      // Only seek if significantly different to avoid feedback loops
      const currentProgress = wavesurfer.getCurrentTime() / duration
      if (Math.abs(progress - currentProgress) > 0.01) {
        wavesurfer.seekTo(Math.min(Math.max(progress, 0), 1))
      }
    }
  }, [currentTimeMs])

  // Update zoom
  useEffect(() => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer || !isReadyRef.current) return
    wavesurfer.zoom(100 * zoom)
  }, [zoom])

  return <div ref={containerRef} className={`waveform-container ${className}`} style={{ height }} />
}

// Smaller inline waveform for segments
interface SegmentWaveformProps {
  audioUrl: string
  startTimeMs: number
  endTimeMs: number
  color?: string
  height?: number
  className?: string
}

export function SegmentWaveform({
  audioUrl,
  startTimeMs,
  endTimeMs,
  color = '#3b82f6',
  height = 40,
  className = ''
}: SegmentWaveformProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [waveformData, setWaveformData] = React.useState<number[]>([])

  // Load and extract waveform data for the segment
  useEffect(() => {
    if (!audioUrl) return

    const audioContext = new AudioContext()

    fetch(audioUrl)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        const channelData = audioBuffer.getChannelData(0)
        const sampleRate = audioBuffer.sampleRate

        const startSample = Math.floor((startTimeMs / 1000) * sampleRate)
        const endSample = Math.floor((endTimeMs / 1000) * sampleRate)
        const segmentLength = endSample - startSample

        // Downsample to reasonable number of points
        const numPoints = 100
        const samplesPerPoint = Math.max(1, Math.floor(segmentLength / numPoints))
        const peaks: number[] = []

        for (let i = 0; i < numPoints && startSample + i * samplesPerPoint < endSample; i++) {
          let sum = 0
          for (let j = 0; j < samplesPerPoint; j++) {
            const sampleIndex = startSample + i * samplesPerPoint + j
            if (sampleIndex < channelData.length) {
              sum += Math.abs(channelData[sampleIndex])
            }
          }
          peaks.push(sum / samplesPerPoint)
        }

        // Normalize
        const maxPeak = Math.max(...peaks, 0.01)
        setWaveformData(peaks.map((p) => p / maxPeak))

        audioContext.close()
      })
      .catch(console.error)
  }, [audioUrl, startTimeMs, endTimeMs])

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || waveformData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width } = container.getBoundingClientRect()
    canvas.width = width * window.devicePixelRatio
    canvas.height = height * window.devicePixelRatio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    ctx.clearRect(0, 0, width, height)

    const barWidth = width / waveformData.length
    const centerY = height / 2

    ctx.fillStyle = color

    waveformData.forEach((value, index) => {
      const barHeight = value * (height - 4)
      const x = index * barWidth
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(barWidth - 1, 1), barHeight)
    })
  }, [waveformData, color, height])

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
