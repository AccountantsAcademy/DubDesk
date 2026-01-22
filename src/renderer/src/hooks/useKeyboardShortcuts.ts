/**
 * Keyboard Shortcuts Hook
 * Global keyboard shortcuts for the application
 */

import { useHistoryStore } from '@renderer/stores/history.store'
import { usePlaybackStore } from '@renderer/stores/playback.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
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
      // Skip if typing in an input or textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
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

      // Delete or Backspace - Delete selected segments
      if ((e.code === 'Delete' || e.code === 'Backspace') && !isMeta) {
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
