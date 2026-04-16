/**
 * Overlay IPC Handlers
 * Handles image overlay-related IPC communication
 */

import { IPC_CHANNELS } from '@shared/constants/channels'
import type { ImageOverlayCreateInput, ImageOverlayUpdateInput } from '@shared/types/overlay'
import { dialog, ipcMain } from 'electron'
import { overlayRepository } from '../services/database/repositories'

export function registerOverlayHandlers(): void {
  const { OVERLAY } = IPC_CHANNELS

  // Get all overlays for a project
  ipcMain.handle(OVERLAY.GET_ALL, async (_event, data: { projectId: string }) => {
    try {
      const overlays = overlayRepository.findByProject(data.projectId)
      return { success: true, overlays }
    } catch (error) {
      console.error('[Overlay:GetAll] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get overlays'
      }
    }
  })

  // Create a new overlay (copies image to project directory)
  ipcMain.handle(OVERLAY.CREATE, async (_event, data: ImageOverlayCreateInput) => {
    try {
      const overlay = overlayRepository.create(data)
      return { success: true, overlay }
    } catch (error) {
      console.error('[Overlay:Create] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create overlay'
      }
    }
  })

  // Update an overlay
  ipcMain.handle(
    OVERLAY.UPDATE,
    async (_event, data: { id: string; updates: ImageOverlayUpdateInput }) => {
      try {
        const overlay = overlayRepository.update(data.id, data.updates)
        if (!overlay) {
          return { success: false, error: 'Overlay not found' }
        }
        return { success: true, overlay }
      } catch (error) {
        console.error('[Overlay:Update] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update overlay'
        }
      }
    }
  )

  // Delete an overlay
  ipcMain.handle(OVERLAY.DELETE, async (_event, data: { id: string }) => {
    try {
      const deleted = overlayRepository.delete(data.id)
      return { success: deleted, error: deleted ? undefined : 'Overlay not found' }
    } catch (error) {
      console.error('[Overlay:Delete] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete overlay'
      }
    }
  })

  // Open a file dialog to select an image
  ipcMain.handle(OVERLAY.IMPORT_IMAGE, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Image Overlay',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, canceled: true }
      }

      return { success: true, canceled: false, filePath: result.filePaths[0] }
    } catch (error) {
      console.error('[Overlay:ImportImage] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open file dialog'
      }
    }
  })
}
