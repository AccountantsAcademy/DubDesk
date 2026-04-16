/**
 * ImageOverlayLayer
 * Renders image overlays on top of the video player.
 * Handles positioning relative to the actual video display rect (accounting for object-contain
 * letterboxing/pillarboxing), drag-to-move, and resize handles.
 */

import { useOverlayStore } from '@renderer/stores/overlay.store'
import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useProjectStore } from '@renderer/stores/project.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import type { ImageOverlay, ImageOverlayUpdateInput } from '@shared/types/overlay'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Compute the actual video display rect within the container (accounting for object-contain) */
function computeVideoRect(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number
): { offsetX: number; offsetY: number; displayW: number; displayH: number } {
  if (videoW <= 0 || videoH <= 0 || containerW <= 0 || containerH <= 0) {
    return { offsetX: 0, offsetY: 0, displayW: containerW, displayH: containerH }
  }
  const containerAspect = containerW / containerH
  const videoAspect = videoW / videoH

  let displayW: number
  let displayH: number

  if (videoAspect > containerAspect) {
    // Video is wider — pillarboxed (bars top/bottom)
    displayW = containerW
    displayH = containerW / videoAspect
  } else {
    // Video is taller — letterboxed (bars left/right)
    displayH = containerH
    displayW = containerH * videoAspect
  }

  const offsetX = (containerW - displayW) / 2
  const offsetY = (containerH - displayH) / 2

  return { offsetX, offsetY, displayW, displayH }
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLE_SIZE = 8
const MIN_SIZE_FRACTION = 0.03

export function ImageOverlayLayer(): React.JSX.Element | null {
  const overlays = useOverlayStore((state) => state.overlays)
  const selectedOverlayId = useOverlayStore((state) => state.selectedOverlayId)
  const selectOverlay = useOverlayStore((state) => state.selectOverlay)
  const updateOverlay = useOverlayStore((state) => state.updateOverlay)
  const currentProject = useProjectStore((state) => state.currentProject)
  const clearSegmentSelection = useSegmentStore((state) => state.clearSelection)

  // Measure our own container (the video display area), NOT videoPlayerSize
  // which is the outer container including PlaybackControls.
  const layerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = layerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Refs for direct DOM visibility toggling — bypasses React render pipeline
  // so overlays appear/disappear in sync with the video frame.
  const overlayRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const overlaysRef = useRef(overlays)
  overlaysRef.current = overlays

  useEffect(() => {
    const videoEl = document.querySelector('video:not([data-lipsync])') as HTMLVideoElement | null

    const updateVisibility = (timeMs: number) => {
      for (const overlay of overlaysRef.current) {
        const el = overlayRefs.current.get(overlay.id)
        if (!el) continue
        const visible = timeMs >= overlay.startTimeMs && timeMs < overlay.endTimeMs
        el.style.display = visible ? '' : 'none'
      }
    }

    // When paused, sync from store (seek updates go there)
    const unsubStore = usePlaybackStore.subscribe((state) => {
      if (state.state !== 'playing') {
        updateVisibility(state.currentTimeMs)
      }
    })

    // Poll at frame rate for both playing and paused states
    let rafId: number
    const tick = () => {
      const timeMs = videoEl
        ? videoEl.currentTime * 1000
        : usePlaybackStore.getState().currentTimeMs
      updateVisibility(timeMs)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      unsubStore()
      cancelAnimationFrame(rafId)
    }
  }, [])

  // Read the actual video native dimensions from the <video> element.
  // project.sourceVideoWidth/Height are typically null (never populated during project creation),
  // which would cause computeVideoRect to fall back to the container size — wrong aspect ratio.
  const [nativeVideoSize, setNativeVideoSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const videoEl = document.querySelector('video:not([data-lipsync])') as HTMLVideoElement | null
    if (!videoEl) return

    const update = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        setNativeVideoSize({ w: videoEl.videoWidth, h: videoEl.videoHeight })
      }
    }

    update()
    videoEl.addEventListener('loadedmetadata', update)
    return () => videoEl.removeEventListener('loadedmetadata', update)
  }, [currentProject?.id])

  const videoW = nativeVideoSize.w || currentProject?.sourceVideoWidth || 0
  const videoH = nativeVideoSize.h || currentProject?.sourceVideoHeight || 0

  const videoRect = useMemo(
    () => computeVideoRect(containerSize.width, containerSize.height, videoW, videoH),
    [containerSize.width, containerSize.height, videoW, videoH]
  )

  const setOverlayRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      overlayRefs.current.set(id, el)
    } else {
      overlayRefs.current.delete(id)
    }
  }, [])

  const ready = containerSize.width > 0 && containerSize.height > 0 && videoW > 0

  return (
    <div ref={layerRef} className="absolute inset-0 z-20 pointer-events-none">
      {ready &&
        overlays.map((overlay) => (
          <OverlayImage
            key={overlay.id}
            overlay={overlay}
            videoRect={videoRect}
            isSelected={selectedOverlayId === overlay.id}
            onSelect={() => {
              clearSegmentSelection()
              selectOverlay(overlay.id)
            }}
            onUpdate={updateOverlay}
            onRef={(el) => setOverlayRef(overlay.id, el)}
          />
        ))}
    </div>
  )
}

interface OverlayImageProps {
  overlay: ImageOverlay
  videoRect: { offsetX: number; offsetY: number; displayW: number; displayH: number }
  isSelected: boolean
  onSelect: () => void
  onUpdate: (id: string, updates: ImageOverlayUpdateInput) => Promise<void>
  onRef: (el: HTMLDivElement | null) => void
}

function OverlayImage({
  overlay,
  videoRect,
  isSelected,
  onSelect,
  onUpdate,
  onRef
}: OverlayImageProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<ResizeHandle | null>(null)
  const [pending, setPendingState] = useState<{
    positionX: number
    positionY: number
    widthFraction: number
    heightFraction: number
  } | null>(null)

  // Keep a ref in sync so mouseUp handlers always read the latest pending value
  const pendingRef = useRef(pending)
  const setPending = useCallback((val: typeof pending) => {
    pendingRef.current = val
    setPendingState(val)
  }, [])

  const dragStartRef = useRef<{
    mouseX: number
    mouseY: number
    startPosX: number
    startPosY: number
    startWidth: number
    startHeight: number
  } | null>(null)

  const posX = pending?.positionX ?? overlay.positionX
  const posY = pending?.positionY ?? overlay.positionY
  const width = pending?.widthFraction ?? overlay.widthFraction
  const height = pending?.heightFraction ?? overlay.heightFraction

  const { offsetX, offsetY, displayW, displayH } = videoRect

  // CSS position/size in pixels relative to the container
  const style: React.CSSProperties = {
    left: offsetX + posX * displayW,
    top: offsetY + posY * displayH,
    width: width * displayW,
    height: height * displayH,
    opacity: overlay.opacity,
    zIndex: overlay.zIndex + 30, // above video + lipsync overlay
    pointerEvents: 'auto' as const,
    cursor: isDragging ? 'grabbing' : 'grab',
    position: 'absolute' as const
  }

  const imgSrc = overlay.imagePath.startsWith('file://')
    ? overlay.imagePath
    : `file://${overlay.imagePath}`

  // --- Move ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      // Don't start drag if clicking a resize handle
      if ((e.target as HTMLElement).dataset.resizeHandle) return
      e.stopPropagation()
      e.preventDefault()
      onSelect()

      setIsDragging(true)
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startPosX: posX,
        startPosY: posY,
        startWidth: width,
        startHeight: height
      }
    },
    [onSelect, posX, posY, width, height]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY

      const dxFrac = displayW > 0 ? dx / displayW : 0
      const dyFrac = displayH > 0 ? dy / displayH : 0

      let newX = dragStartRef.current.startPosX + dxFrac
      let newY = dragStartRef.current.startPosY + dyFrac

      // Clamp within video bounds
      newX = Math.max(0, Math.min(newX, 1 - width))
      newY = Math.max(0, Math.min(newY, 1 - height))

      setPending({
        positionX: newX,
        positionY: newY,
        widthFraction: width,
        heightFraction: height
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      const p = pendingRef.current
      if (p) {
        onUpdate(overlay.id, {
          positionX: p.positionX,
          positionY: p.positionY
        })
        setPending(null)
      }
      dragStartRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, width, height, displayW, displayH, overlay.id, onUpdate, setPending])

  // --- Resize ---
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: ResizeHandle) => {
      e.stopPropagation()
      e.preventDefault()
      onSelect()

      setIsResizing(handle)
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startPosX: posX,
        startPosY: posY,
        startWidth: width,
        startHeight: height
      }
    },
    [onSelect, posX, posY, width, height]
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      const dxFrac = displayW > 0 ? dx / displayW : 0
      const dyFrac = displayH > 0 ? dy / displayH : 0

      let newX = dragStartRef.current.startPosX
      let newY = dragStartRef.current.startPosY
      let newW = dragStartRef.current.startWidth
      let newH = dragStartRef.current.startHeight

      // Adjust based on which handle is being dragged
      if (isResizing.includes('w')) {
        newX += dxFrac
        newW -= dxFrac
      }
      if (isResizing.includes('e')) {
        newW += dxFrac
      }
      if (isResizing === 'n' || isResizing === 'nw' || isResizing === 'ne') {
        newY += dyFrac
        newH -= dyFrac
      }
      if (isResizing === 's' || isResizing === 'sw' || isResizing === 'se') {
        newH += dyFrac
      }

      // Enforce minimum size
      if (newW < MIN_SIZE_FRACTION) {
        if (isResizing.includes('w')) newX -= MIN_SIZE_FRACTION - newW
        newW = MIN_SIZE_FRACTION
      }
      if (newH < MIN_SIZE_FRACTION) {
        if (isResizing === 'n' || isResizing === 'nw' || isResizing === 'ne') {
          newY -= MIN_SIZE_FRACTION - newH
        }
        newH = MIN_SIZE_FRACTION
      }

      // Clamp within video bounds
      newX = Math.max(0, Math.min(newX, 1 - MIN_SIZE_FRACTION))
      newY = Math.max(0, Math.min(newY, 1 - MIN_SIZE_FRACTION))
      if (newX + newW > 1) newW = 1 - newX
      if (newY + newH > 1) newH = 1 - newY

      setPending({
        positionX: newX,
        positionY: newY,
        widthFraction: newW,
        heightFraction: newH
      })
    }

    const handleMouseUp = () => {
      setIsResizing(null)
      const p = pendingRef.current
      if (p) {
        onUpdate(overlay.id, {
          positionX: p.positionX,
          positionY: p.positionY,
          widthFraction: p.widthFraction,
          heightFraction: p.heightFraction
        })
        setPending(null)
      }
      dragStartRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, displayW, displayH, overlay.id, onUpdate, setPending])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSelect()
    },
    [onSelect]
  )

  return (
    <div
      ref={(el) => {
        containerRef.current = el
        onRef(el)
      }}
      style={style}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={`select-none ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-transparent' : ''}`}
    >
      <img
        src={imgSrc}
        alt={overlay.originalFilename}
        className="w-full h-full object-fill"
        draggable={false}
      />

      {/* Resize handles (only shown when selected) */}
      {isSelected &&
        (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeHandle[]).map((handle) => (
          <ResizeHandleEl
            key={handle}
            handle={handle}
            onMouseDown={(e) => handleResizeStart(e, handle)}
          />
        ))}
    </div>
  )
}

function ResizeHandleEl({
  handle,
  onMouseDown
}: {
  handle: ResizeHandle
  onMouseDown: (e: React.MouseEvent) => void
}): React.JSX.Element {
  const positionStyles: Record<ResizeHandle, React.CSSProperties> = {
    nw: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nwse-resize' },
    n: { top: -HANDLE_SIZE / 2, left: '50%', marginLeft: -HANDLE_SIZE / 2, cursor: 'ns-resize' },
    ne: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nesw-resize' },
    e: { top: '50%', right: -HANDLE_SIZE / 2, marginTop: -HANDLE_SIZE / 2, cursor: 'ew-resize' },
    se: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nwse-resize' },
    s: {
      bottom: -HANDLE_SIZE / 2,
      left: '50%',
      marginLeft: -HANDLE_SIZE / 2,
      cursor: 'ns-resize'
    },
    sw: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nesw-resize' },
    w: { top: '50%', left: -HANDLE_SIZE / 2, marginTop: -HANDLE_SIZE / 2, cursor: 'ew-resize' }
  }

  return (
    <div
      data-resize-handle={handle}
      onMouseDown={onMouseDown}
      className="absolute bg-white border border-blue-400 rounded-sm"
      style={{
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        ...positionStyles[handle],
        pointerEvents: 'auto',
        zIndex: 50
      }}
    />
  )
}
