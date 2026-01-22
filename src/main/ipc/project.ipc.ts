/**
 * Project IPC Handlers
 * Handles project-related IPC communication
 */

import { IPC_CHANNELS } from '@shared/constants/channels'
import type {
  ProjectCreateRequest,
  ProjectOpenRequest,
  ProjectOpenResponse
} from '@shared/types/ipc'
import type { Project } from '@shared/types/project'
import { ipcMain } from 'electron'
import {
  projectRepository,
  segmentRepository,
  speakerRepository
} from '../services/database/repositories'

export function registerProjectHandlers(): void {
  const { PROJECT } = IPC_CHANNELS

  // Create a new project
  ipcMain.handle(PROJECT.CREATE, async (_event, data: ProjectCreateRequest) => {
    try {
      // For now, create a basic project
      // The full import workflow will be implemented later
      const project = projectRepository.create({
        name: data.name,
        sourceVideoPath: data.videoPath,
        sourceVideoDurationMs: 0, // Will be updated after video probe
        targetLanguage: data.targetLanguage,
        sourceLanguage: data.sourceLanguage
      })

      return {
        success: true,
        project,
        segments: []
      }
    } catch (error) {
      console.error('[Project:Create] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create project'
      }
    }
  })

  // Open an existing project
  ipcMain.handle(PROJECT.OPEN, async (_event, data: ProjectOpenRequest) => {
    try {
      const project = projectRepository.findById(data.id)

      if (!project) {
        return {
          success: false,
          error: 'Project not found'
        }
      }

      // Get project segments and speakers
      const segments = segmentRepository.findByProject(data.id)
      const speakers = speakerRepository.findByProject(data.id)

      // Update recent projects
      projectRepository.addToRecent(data.id)

      const response: ProjectOpenResponse = {
        project,
        segments,
        speakers
      }

      return {
        success: true,
        ...response
      }
    } catch (error) {
      console.error('[Project:Open] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open project'
      }
    }
  })

  // Save a project (trigger save timestamp update)
  ipcMain.handle(PROJECT.SAVE, async (_event, data: { id: string }) => {
    try {
      // Just update the project to trigger timestamp update
      const project = projectRepository.update(data.id, {})

      if (!project) {
        return {
          success: false,
          error: 'Project not found'
        }
      }

      return {
        success: true,
        savedAt: project.updatedAt
      }
    } catch (error) {
      console.error('[Project:Save] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save project'
      }
    }
  })

  // Close a project (no-op for now, but useful for cleanup)
  ipcMain.handle(PROJECT.CLOSE, async (_event, _data: { id: string }) => {
    try {
      // Could add cleanup logic here if needed
      return { success: true }
    } catch (error) {
      console.error('[Project:Close] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to close project'
      }
    }
  })

  // Get the current project
  ipcMain.handle(PROJECT.GET_CURRENT, async (_event, data: { id: string }) => {
    try {
      const project = projectRepository.findById(data.id)

      if (!project) {
        return {
          success: false,
          error: 'Project not found'
        }
      }

      return {
        success: true,
        project
      }
    } catch (error) {
      console.error('[Project:GetCurrent] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project'
      }
    }
  })

  // List recent projects
  ipcMain.handle(PROJECT.LIST_RECENT, async () => {
    try {
      const projects = projectRepository.getRecent(10)

      return {
        success: true,
        projects
      }
    } catch (error) {
      console.error('[Project:ListRecent] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list recent projects'
      }
    }
  })

  // Delete a project
  ipcMain.handle(PROJECT.DELETE, async (_event, data: { id: string }) => {
    try {
      const deleted = projectRepository.delete(data.id)

      if (!deleted) {
        return {
          success: false,
          error: 'Project not found'
        }
      }

      return { success: true }
    } catch (error) {
      console.error('[Project:Delete] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete project'
      }
    }
  })

  // Update a project
  ipcMain.handle(
    PROJECT.UPDATE,
    async (_event, data: { id: string; updates: Partial<Project> }) => {
      try {
        const project = projectRepository.update(data.id, data.updates)

        if (!project) {
          return {
            success: false,
            error: 'Project not found'
          }
        }

        return {
          success: true,
          project
        }
      } catch (error) {
        console.error('[Project:Update] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update project'
        }
      }
    }
  )

  console.log('[IPC] Project handlers registered')
}
