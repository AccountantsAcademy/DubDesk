/**
 * History IPC Handlers
 * Handles undo/redo operations with actual state restoration
 */

import { IPC_CHANNELS } from '@shared/constants/channels'
import type { Segment } from '@shared/types/segment'
import { ipcMain } from 'electron'
import { segmentRepository } from '../services/database/repositories'

// Action types for history
type HistoryActionType =
  | 'segment:create'
  | 'segment:update'
  | 'segment:delete'
  | 'segment:batch'
  | 'segment:merge'

interface HistoryAction {
  type: HistoryActionType
  // Data needed to undo this action
  undoData: unknown
  // Data needed to redo this action
  redoData: unknown
}

interface HistoryStack {
  undoStack: HistoryAction[]
  redoStack: HistoryAction[]
}

// In-memory history stacks per project
const historyStacks = new Map<string, HistoryStack>()

const MAX_HISTORY_SIZE = 50

function getOrCreateStack(projectId: string): HistoryStack {
  if (!historyStacks.has(projectId)) {
    historyStacks.set(projectId, { undoStack: [], redoStack: [] })
  }
  return historyStacks.get(projectId)!
}

// Apply an undo action - returns the segment data to restore in the UI
function applyUndo(action: HistoryAction): Segment[] | null {
  switch (action.type) {
    case 'segment:create': {
      // Undo a create = delete the segment
      const { segmentId } = action.undoData as { segmentId: string }
      segmentRepository.delete(segmentId)
      return null
    }
    case 'segment:update': {
      // Undo an update = restore previous state
      const { segment: previousState } = action.undoData as { segment: Segment }
      const restored = segmentRepository.update(previousState.id, {
        originalText: previousState.originalText,
        translatedText: previousState.translatedText,
        startTimeMs: previousState.startTimeMs,
        endTimeMs: previousState.endTimeMs,
        speakerId: previousState.speakerId,
        voiceId: previousState.voiceId,
        speedAdjustment: previousState.speedAdjustment,
        pitchAdjustment: previousState.pitchAdjustment,
        audioFilePath: previousState.audioFilePath,
        audioDurationMs: previousState.audioDurationMs
      })
      return restored ? [restored] : null
    }
    case 'segment:delete': {
      // Undo a delete = recreate the segment
      const { segment: deletedSegment } = action.undoData as { segment: Segment }
      const recreated = segmentRepository.create({
        id: deletedSegment.id,
        projectId: deletedSegment.projectId,
        originalText: deletedSegment.originalText,
        translatedText: deletedSegment.translatedText,
        startTimeMs: deletedSegment.startTimeMs,
        endTimeMs: deletedSegment.endTimeMs,
        speakerId: deletedSegment.speakerId,
        voiceId: deletedSegment.voiceId,
        speedAdjustment: deletedSegment.speedAdjustment,
        pitchAdjustment: deletedSegment.pitchAdjustment,
        audioFilePath: deletedSegment.audioFilePath,
        audioDurationMs: deletedSegment.audioDurationMs
      })
      return recreated ? [recreated] : null
    }
    case 'segment:batch': {
      // Undo batch operations
      const { segments: previousStates } = action.undoData as { segments: Segment[] }
      const restored: Segment[] = []
      for (const seg of previousStates) {
        const result = segmentRepository.update(seg.id, {
          originalText: seg.originalText,
          translatedText: seg.translatedText,
          startTimeMs: seg.startTimeMs,
          endTimeMs: seg.endTimeMs,
          speakerId: seg.speakerId,
          voiceId: seg.voiceId,
          speedAdjustment: seg.speedAdjustment,
          pitchAdjustment: seg.pitchAdjustment
        })
        if (result) restored.push(result)
      }
      return restored
    }
    case 'segment:merge': {
      // Undo a merge = delete merged segment, recreate original segments
      const { originalSegments, mergedSegmentId } = action.undoData as {
        originalSegments: Segment[]
        mergedSegmentId: string
      }
      // Delete the merged segment
      segmentRepository.delete(mergedSegmentId)
      // Recreate all original segments
      const restored: Segment[] = []
      for (const seg of originalSegments) {
        const recreated = segmentRepository.create({
          id: seg.id,
          projectId: seg.projectId,
          originalText: seg.originalText,
          translatedText: seg.translatedText,
          startTimeMs: seg.startTimeMs,
          endTimeMs: seg.endTimeMs,
          speakerId: seg.speakerId,
          voiceId: seg.voiceId,
          speedAdjustment: seg.speedAdjustment,
          pitchAdjustment: seg.pitchAdjustment,
          audioFilePath: seg.audioFilePath,
          audioDurationMs: seg.audioDurationMs
        })
        if (recreated) restored.push(recreated)
      }
      return restored
    }
    default:
      return null
  }
}

// Apply a redo action
function applyRedo(action: HistoryAction): Segment[] | null {
  switch (action.type) {
    case 'segment:create': {
      // Redo a create = recreate the segment
      const { segment } = action.redoData as { segment: Segment }
      const recreated = segmentRepository.create({
        id: segment.id,
        projectId: segment.projectId,
        originalText: segment.originalText,
        translatedText: segment.translatedText,
        startTimeMs: segment.startTimeMs,
        endTimeMs: segment.endTimeMs,
        speakerId: segment.speakerId,
        voiceId: segment.voiceId
      })
      return recreated ? [recreated] : null
    }
    case 'segment:update': {
      // Redo an update = apply the new state
      const { segment: newState } = action.redoData as { segment: Segment }
      const updated = segmentRepository.update(newState.id, {
        originalText: newState.originalText,
        translatedText: newState.translatedText,
        startTimeMs: newState.startTimeMs,
        endTimeMs: newState.endTimeMs,
        speakerId: newState.speakerId,
        voiceId: newState.voiceId,
        speedAdjustment: newState.speedAdjustment,
        pitchAdjustment: newState.pitchAdjustment
      })
      return updated ? [updated] : null
    }
    case 'segment:delete': {
      // Redo a delete = delete the segment again
      const { segmentId } = action.redoData as { segmentId: string }
      segmentRepository.delete(segmentId)
      return null
    }
    case 'segment:batch': {
      // Redo batch operations
      const { segments: newStates } = action.redoData as { segments: Segment[] }
      const updated: Segment[] = []
      for (const seg of newStates) {
        const result = segmentRepository.update(seg.id, {
          originalText: seg.originalText,
          translatedText: seg.translatedText,
          startTimeMs: seg.startTimeMs,
          endTimeMs: seg.endTimeMs,
          speakerId: seg.speakerId,
          voiceId: seg.voiceId,
          speedAdjustment: seg.speedAdjustment,
          pitchAdjustment: seg.pitchAdjustment
        })
        if (result) updated.push(result)
      }
      return updated
    }
    case 'segment:merge': {
      // Redo a merge = delete the recreated segments and recreate the merged one
      const { originalSegmentIds, mergedSegment } = action.redoData as {
        originalSegmentIds: string[]
        mergedSegment: Segment
      }
      // Delete all original segments
      for (const id of originalSegmentIds) {
        segmentRepository.delete(id)
      }
      // Recreate the merged segment
      const recreated = segmentRepository.create({
        id: mergedSegment.id,
        projectId: mergedSegment.projectId,
        originalText: mergedSegment.originalText,
        translatedText: mergedSegment.translatedText,
        startTimeMs: mergedSegment.startTimeMs,
        endTimeMs: mergedSegment.endTimeMs,
        speakerId: mergedSegment.speakerId,
        voiceId: mergedSegment.voiceId,
        speedAdjustment: mergedSegment.speedAdjustment,
        pitchAdjustment: mergedSegment.pitchAdjustment
      })
      return recreated ? [recreated] : null
    }
    default:
      return null
  }
}

export function registerHistoryHandlers(): void {
  const { HISTORY } = IPC_CHANNELS

  // Get history stack state
  ipcMain.handle(HISTORY.GET_STACK, async (_event, data: { projectId: string }) => {
    try {
      const stack = getOrCreateStack(data.projectId)
      return {
        success: true,
        canUndo: stack.undoStack.length > 0,
        canRedo: stack.redoStack.length > 0
      }
    } catch (error) {
      console.error('[History:GetStack] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get history stack'
      }
    }
  })

  // Undo last action
  ipcMain.handle(HISTORY.UNDO, async (_event, data: { projectId: string }) => {
    try {
      const stack = getOrCreateStack(data.projectId)

      if (stack.undoStack.length === 0) {
        return {
          success: false,
          error: 'Nothing to undo',
          canUndo: false,
          canRedo: stack.redoStack.length > 0
        }
      }

      // Pop from undo stack
      const action = stack.undoStack.pop()!

      // Apply the undo action
      const restoredSegments = applyUndo(action)

      // Push to redo stack
      stack.redoStack.push(action)

      return {
        success: true,
        canUndo: stack.undoStack.length > 0,
        canRedo: stack.redoStack.length > 0,
        restoredSegments,
        actionType: action.type
      }
    } catch (error) {
      console.error('[History:Undo] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to undo'
      }
    }
  })

  // Redo last undone action
  ipcMain.handle(HISTORY.REDO, async (_event, data: { projectId: string }) => {
    try {
      const stack = getOrCreateStack(data.projectId)

      if (stack.redoStack.length === 0) {
        return {
          success: false,
          error: 'Nothing to redo',
          canUndo: stack.undoStack.length > 0,
          canRedo: false
        }
      }

      // Pop from redo stack
      const action = stack.redoStack.pop()!

      // Apply the redo action
      const restoredSegments = applyRedo(action)

      // Push back to undo stack
      stack.undoStack.push(action)

      return {
        success: true,
        canUndo: stack.undoStack.length > 0,
        canRedo: stack.redoStack.length > 0,
        restoredSegments,
        actionType: action.type
      }
    } catch (error) {
      console.error('[History:Redo] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to redo'
      }
    }
  })

  // Clear history for a project
  ipcMain.handle(HISTORY.CLEAR, async (_event, data: { projectId: string }) => {
    try {
      historyStacks.delete(data.projectId)
      return { success: true }
    } catch (error) {
      console.error('[History:Clear] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear history'
      }
    }
  })

  // Record an action
  ipcMain.handle(
    HISTORY.RECORD,
    async (
      _event,
      data: {
        projectId: string
        action: {
          type: HistoryActionType
          undoData: unknown
          redoData: unknown
        }
      }
    ) => {
      try {
        const stack = getOrCreateStack(data.projectId)

        // Add to undo stack
        stack.undoStack.push(data.action)

        // Limit stack size
        if (stack.undoStack.length > MAX_HISTORY_SIZE) {
          stack.undoStack.shift()
        }

        // Clear redo stack when a new action is recorded
        stack.redoStack = []

        return {
          success: true,
          canUndo: true,
          canRedo: false
        }
      } catch (error) {
        console.error('[History:Record] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to record action'
        }
      }
    }
  )

  console.log('[IPC] History handlers registered')
}
