/**
 * Segment IPC Handlers
 * Handles segment-related IPC communication
 */

import { IPC_CHANNELS } from '@shared/constants/channels'
import type {
  SegmentBatchUpdate,
  SegmentCreateInput,
  SegmentUpdateInput
} from '@shared/types/segment'
import { ipcMain } from 'electron'
import { segmentRepository, speakerRepository } from '../services/database/repositories'

export function registerSegmentHandlers(): void {
  const { SEGMENT, SPEAKER } = IPC_CHANNELS

  // Get all segments for a project
  ipcMain.handle(SEGMENT.GET_ALL, async (_event, data: { projectId: string }) => {
    try {
      const segments = segmentRepository.findByProject(data.projectId)
      return {
        success: true,
        segments
      }
    } catch (error) {
      console.error('[Segment:GetAll] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get segments'
      }
    }
  })

  // Get a segment by ID
  ipcMain.handle(SEGMENT.GET_BY_ID, async (_event, data: { id: string }) => {
    try {
      const segment = segmentRepository.findById(data.id)

      if (!segment) {
        return {
          success: false,
          error: 'Segment not found'
        }
      }

      return {
        success: true,
        segment
      }
    } catch (error) {
      console.error('[Segment:GetById] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get segment'
      }
    }
  })

  // Create a new segment
  ipcMain.handle(SEGMENT.CREATE, async (_event, data: SegmentCreateInput) => {
    try {
      const segment = segmentRepository.create(data)
      return {
        success: true,
        segment
      }
    } catch (error) {
      console.error('[Segment:Create] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create segment'
      }
    }
  })

  // Update a segment
  ipcMain.handle(
    SEGMENT.UPDATE,
    async (_event, data: { id: string; updates: SegmentUpdateInput }) => {
      try {
        const segment = segmentRepository.update(data.id, data.updates)

        if (!segment) {
          return {
            success: false,
            error: 'Segment not found'
          }
        }

        return {
          success: true,
          segment
        }
      } catch (error) {
        console.error('[Segment:Update] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update segment'
        }
      }
    }
  )

  // Delete a segment
  ipcMain.handle(SEGMENT.DELETE, async (_event, data: { id: string }) => {
    try {
      const deleted = segmentRepository.delete(data.id)

      if (!deleted) {
        return {
          success: false,
          error: 'Segment not found'
        }
      }

      return { success: true }
    } catch (error) {
      console.error('[Segment:Delete] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete segment'
      }
    }
  })

  // Batch update segments
  ipcMain.handle(SEGMENT.BATCH_UPDATE, async (_event, data: { updates: SegmentBatchUpdate[] }) => {
    try {
      const segments = segmentRepository.batchUpdate(data.updates)
      return {
        success: true,
        segments
      }
    } catch (error) {
      console.error('[Segment:BatchUpdate] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to batch update segments'
      }
    }
  })

  // Split a segment
  ipcMain.handle(SEGMENT.SPLIT, async (_event, data: { id: string; splitTimeMs: number }) => {
    try {
      const result = segmentRepository.split(data.id, data.splitTimeMs)

      if (!result) {
        return {
          success: false,
          error: 'Segment not found'
        }
      }

      return {
        success: true,
        segments: result
      }
    } catch (error) {
      console.error('[Segment:Split] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to split segment'
      }
    }
  })

  // Merge segments
  ipcMain.handle(SEGMENT.MERGE, async (_event, data: { ids: string[] }) => {
    try {
      const segment = segmentRepository.merge(data.ids)

      if (!segment) {
        return {
          success: false,
          error: 'Failed to merge segments'
        }
      }

      return {
        success: true,
        segment
      }
    } catch (error) {
      console.error('[Segment:Merge] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to merge segments'
      }
    }
  })

  // Reorder segments
  ipcMain.handle(
    SEGMENT.REORDER,
    async (_event, data: { projectId: string; orderedIds: string[] }) => {
      try {
        segmentRepository.reorder(data.projectId, data.orderedIds)
        return { success: true }
      } catch (error) {
        console.error('[Segment:Reorder] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to reorder segments'
        }
      }
    }
  )

  // ==================== Speaker Handlers ====================

  // Get all speakers for a project
  ipcMain.handle(SPEAKER.GET_ALL, async (_event, data: { projectId: string }) => {
    try {
      const speakers = speakerRepository.findByProject(data.projectId)
      return {
        success: true,
        speakers
      }
    } catch (error) {
      console.error('[Speaker:GetAll] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get speakers'
      }
    }
  })

  // Create a new speaker
  ipcMain.handle(
    SPEAKER.CREATE,
    async (
      _event,
      data: { projectId: string; name: string; defaultVoiceId?: string; color?: string }
    ) => {
      try {
        const speaker = speakerRepository.create({
          projectId: data.projectId,
          name: data.name,
          defaultVoiceId: data.defaultVoiceId,
          color: data.color
        })
        return {
          success: true,
          speaker
        }
      } catch (error) {
        console.error('[Speaker:Create] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create speaker'
        }
      }
    }
  )

  // Update a speaker
  ipcMain.handle(
    SPEAKER.UPDATE,
    async (
      _event,
      data: { id: string; name?: string; defaultVoiceId?: string; color?: string }
    ) => {
      try {
        const speaker = speakerRepository.update(data.id, {
          name: data.name,
          defaultVoiceId: data.defaultVoiceId,
          color: data.color
        })

        if (!speaker) {
          return {
            success: false,
            error: 'Speaker not found'
          }
        }

        return {
          success: true,
          speaker
        }
      } catch (error) {
        console.error('[Speaker:Update] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update speaker'
        }
      }
    }
  )

  // Delete a speaker
  ipcMain.handle(SPEAKER.DELETE, async (_event, data: { id: string }) => {
    try {
      const deleted = speakerRepository.delete(data.id)

      if (!deleted) {
        return {
          success: false,
          error: 'Speaker not found'
        }
      }

      return { success: true }
    } catch (error) {
      console.error('[Speaker:Delete] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete speaker'
      }
    }
  })

  console.log('[IPC] Segment and Speaker handlers registered')
}
