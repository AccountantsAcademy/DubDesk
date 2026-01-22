/**
 * Segment Toolbar
 * Floating toolbar above timeline for segment operations
 */

import { usePlaybackStore } from '@renderer/stores/playback.store'
import {
  isSegmentStale,
  selectSelectedSegments,
  useSegmentStore
} from '@renderer/stores/segment.store'
import { useUIStore } from '@renderer/stores/ui.store'
import type React from 'react'
import { useCallback, useMemo } from 'react'

export function SegmentToolbar(): React.JSX.Element {
  const selectedSegmentIds = useSegmentStore((state) => state.selectedSegmentIds)
  const selectedSegments = useSegmentStore(selectSelectedSegments)
  const splitSegment = useSegmentStore((state) => state.splitSegment)
  const mergeSegments = useSegmentStore((state) => state.mergeSegments)
  const deleteSelectedSegments = useSegmentStore((state) => state.deleteSelectedSegments)
  const regenerateSegmentAudio = useSegmentStore((state) => state.regenerateSegmentAudio)

  const currentTimeMs = usePlaybackStore((state) => state.currentTimeMs)
  const addToast = useUIStore((state) => state.addToast)

  const selectedCount = selectedSegmentIds.size

  // Check if split is possible (single segment, playhead within bounds)
  const canSplit = useMemo(() => {
    if (selectedCount !== 1) return false
    const segment = selectedSegments[0]
    if (!segment) return false
    return currentTimeMs > segment.startTimeMs && currentTimeMs < segment.endTimeMs
  }, [selectedCount, selectedSegments, currentTimeMs])

  // Check if merge is possible (2+ adjacent segments)
  const canMerge = useMemo(() => {
    if (selectedCount < 2) return false
    // Sort by start time
    const sorted = [...selectedSegments].sort((a, b) => a.startTimeMs - b.startTimeMs)
    // Check if they're adjacent (no gaps)
    for (let i = 1; i < sorted.length; i++) {
      // Allow small gaps (100ms tolerance)
      if (sorted[i].startTimeMs - sorted[i - 1].endTimeMs > 100) {
        return false
      }
    }
    return true
  }, [selectedCount, selectedSegments])

  // Check if any selected segments have stale audio
  const hasStaleSelected = useMemo(() => selectedSegments.some(isSegmentStale), [selectedSegments])

  const handleSplit = useCallback(async () => {
    if (!canSplit) return
    const segment = selectedSegments[0]
    try {
      await splitSegment(segment.id, currentTimeMs)
      addToast('success', 'Segment split successfully')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to split segment')
    }
  }, [canSplit, selectedSegments, currentTimeMs, splitSegment, addToast])

  const handleMerge = useCallback(async () => {
    if (!canMerge) return
    const ids = selectedSegments.map((s) => s.id)
    try {
      await mergeSegments(ids)
      addToast('success', 'Segments merged successfully')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to merge segments')
    }
  }, [canMerge, selectedSegments, mergeSegments, addToast])

  const handleDelete = useCallback(async () => {
    if (selectedCount === 0) return
    try {
      await deleteSelectedSegments()
      addToast('success', `Deleted ${selectedCount} segment(s)`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to delete segments')
    }
  }, [selectedCount, deleteSelectedSegments, addToast])

  const handleRegenerateSelected = useCallback(async () => {
    if (!hasStaleSelected) return
    const staleSegments = selectedSegments.filter(isSegmentStale)
    for (const segment of staleSegments) {
      try {
        await regenerateSegmentAudio(segment.id)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to regenerate audio')
      }
    }
    addToast('success', `Regenerated audio for ${staleSegments.length} segment(s)`)
  }, [hasStaleSelected, selectedSegments, regenerateSegmentAudio, addToast])

  if (selectedCount === 0) {
    return (
      <div className="flex items-center justify-center h-10 bg-chrome-surface border-b border-chrome-border">
        <span className="text-sm text-chrome-muted">Select segments to edit</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 h-10 px-4 bg-chrome-surface border-b border-chrome-border">
      <span className="text-sm text-chrome-muted mr-2">
        {selectedCount} segment{selectedCount !== 1 ? 's' : ''} selected
      </span>

      {/* Split Button */}
      <ToolbarButton
        onClick={handleSplit}
        disabled={!canSplit}
        title={
          canSplit ? 'Split at playhead' : 'Select one segment and position playhead inside it'
        }
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h8M8 12h8m-8 5h8M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2z"
            />
          </svg>
        }
      >
        Split
      </ToolbarButton>

      {/* Merge Button */}
      <ToolbarButton
        onClick={handleMerge}
        disabled={!canMerge}
        title={canMerge ? 'Merge selected segments' : 'Select 2+ adjacent segments'}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h7m-7 0h7"
            />
          </svg>
        }
      >
        Merge
      </ToolbarButton>

      {/* Regenerate Button */}
      {hasStaleSelected && (
        <ToolbarButton
          onClick={handleRegenerateSelected}
          title="Regenerate audio for selected segments"
          className="text-yellow-500"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          }
        >
          Regenerate
        </ToolbarButton>
      )}

      <div className="flex-1" />

      {/* Delete Button */}
      <ToolbarButton
        onClick={handleDelete}
        title="Delete selected segments"
        className="text-red-400 hover:text-red-300"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        }
      >
        Delete
      </ToolbarButton>
    </div>
  )
}

interface ToolbarButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  className?: string
  icon?: React.ReactNode
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  className = '',
  icon
}: ToolbarButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        flex items-center gap-1.5 px-2 py-1 text-sm rounded transition-colors
        ${
          disabled
            ? 'text-chrome-muted cursor-not-allowed opacity-50'
            : `text-chrome-text hover:bg-chrome-hover ${className}`
        }
      `}
    >
      {icon}
      {children}
    </button>
  )
}
