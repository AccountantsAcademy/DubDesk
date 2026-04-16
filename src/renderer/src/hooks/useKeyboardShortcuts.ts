/**
 * Keyboard Shortcuts Hook
 * Global keyboard shortcuts for the application
 */

import { useHistoryStore } from '@renderer/stores/history.store'
import { useOverlayStore } from '@renderer/stores/overlay.store'
import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useProjectStore } from '@renderer/stores/project.store'
import { useQuickDubStore } from '@renderer/stores/quickdub.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import { useTimelineStore } from '@renderer/stores/timeline.store'
import { useUIStore } from '@renderer/stores/ui.store'
import { useEffect } from 'react'

interface UseKeyboardShortcutsOptions {
  enabled?: boolean
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}): void {
  const { enabled = true } = options

  // Playback actions
  const toggle = usePlaybackStore((state) => state.toggle)
  const jumpToNextSegment = usePlaybackStore((state) => state.jumpToNextSegment)
  const jumpToPreviousSegment = usePlaybackStore((state) => state.jumpToPreviousSegment)

  // Segment actions
  const segments = useSegmentStore((state) => state.segments)
  const selectAll = useSegmentStore((state) => state.selectAll)
  const deleteSelectedSegments = useSegmentStore((state) => state.deleteSelectedSegments)
  const selectedSegmentIds = useSegmentStore((state) => state.selectedSegmentIds)

  // History actions
  const undo = useHistoryStore((state) => state.undo)
  const redo = useHistoryStore((state) => state.redo)

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Allow Escape even when focused on input/textarea
      const target = e.target as HTMLElement
      const isTextInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (isTextInput && e.code !== 'Escape') {
        return
      }

      const isMeta = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey

      // Space - Play/Pause
      if (e.code === 'Space' && !isMeta) {
        e.preventDefault()
        toggle()
        return
      }

      // Left/Right arrow - Seek by one frame (1/25s = 40ms)
      if (e.code === 'ArrowLeft' && !isMeta) {
        e.preventDefault()
        const { currentTimeMs } = usePlaybackStore.getState()
        usePlaybackStore.getState().seek(currentTimeMs - 40)
        return
      }
      if (e.code === 'ArrowRight' && !isMeta) {
        e.preventDefault()
        const { currentTimeMs } = usePlaybackStore.getState()
        usePlaybackStore.getState().seek(currentTimeMs + 40)
        return
      }

      // J - Previous segment
      if (e.code === 'KeyJ' && !isMeta) {
        e.preventDefault()
        jumpToPreviousSegment(segments)
        return
      }

      // K - Next segment
      if (e.code === 'KeyK' && !isMeta) {
        e.preventDefault()
        jumpToNextSegment(segments)
        return
      }

      // Cmd+Z - Undo
      if (e.code === 'KeyZ' && isMeta && !isShift) {
        e.preventDefault()
        undo()
        return
      }

      // Cmd+Shift+Z - Redo
      if (e.code === 'KeyZ' && isMeta && isShift) {
        e.preventDefault()
        redo()
        return
      }

      // Delete or Backspace - Delete selected segments or overlay
      if ((e.code === 'Delete' || e.code === 'Backspace') && !isMeta) {
        const { selectedOverlayId, deleteOverlay } = useOverlayStore.getState()
        if (selectedOverlayId) {
          e.preventDefault()
          deleteOverlay(selectedOverlayId)
          return
        }
        if (selectedSegmentIds.size > 0) {
          e.preventDefault()
          deleteSelectedSegments()
        }
        return
      }

      // Cmd+A - Select all
      if (e.code === 'KeyA' && isMeta) {
        e.preventDefault()
        selectAll()
        return
      }

      // Q - Toggle Quick Edit mode (only when source/target language are the same)
      if (e.code === 'KeyQ' && !isMeta) {
        const project = useProjectStore.getState().currentProject
        const sameLanguage =
          project?.sourceLanguage &&
          project?.targetLanguage &&
          project.sourceLanguage === project.targetLanguage
        if (sameLanguage) {
          e.preventDefault()
          const { rangeSelectionMode, setRangeSelectionMode } = useTimelineStore.getState()
          setRangeSelectionMode(!rangeSelectionMode)
        }
        return
      }

      // Escape - Deselect overlay / exit Quick Dub mode / close modal
      if (e.code === 'Escape') {
        const { rangeSelectionMode, setRangeSelectionMode, clearRange } =
          useTimelineStore.getState()
        const { modals, closeModal } = useUIStore.getState()

        if (modals.quickDub.isOpen) {
          e.preventDefault()
          useQuickDubStore.getState().cancel()
          clearRange()
          setRangeSelectionMode(false)
          closeModal('quickDub')
          return
        }

        if (rangeSelectionMode) {
          e.preventDefault()
          clearRange()
          setRangeSelectionMode(false)
          return
        }

        // Deselect overlay or segments
        const { selectedOverlayId, selectOverlay } = useOverlayStore.getState()
        if (selectedOverlayId) {
          e.preventDefault()
          selectOverlay(null)
          return
        }

        if (selectedSegmentIds.size > 0) {
          e.preventDefault()
          useSegmentStore.getState().clearSelection()
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    enabled,
    toggle,
    jumpToNextSegment,
    jumpToPreviousSegment,
    segments,
    undo,
    redo,
    selectAll,
    deleteSelectedSegments,
    selectedSegmentIds
  ])
}
