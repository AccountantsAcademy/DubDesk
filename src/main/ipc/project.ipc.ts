/**
 * Project IPC Handlers
 * Handles project-related IPC communication
 */

import { existsSync, readFileSync } from 'node:fs'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type {
  ProjectCreateRequest,
  ProjectOpenRequest,
  ProjectOpenResponse
} from '@shared/types/ipc'
import type { Project } from '@shared/types/project'
import type { Segment } from '@shared/types/segment'
import { ipcMain } from 'electron'
import { parse as parseCSV } from 'papaparse'
import {
  projectRepository,
  segmentRepository,
  speakerRepository
} from '../services/database/repositories'

interface CsvRow {
  speaker?: string
  transcription?: string
  translation?: string
  start_time?: string
  end_time?: string
  // Alternative column names
  original_text?: string
  translated_text?: string
  start?: string
  end?: string
  text?: string
}

export function registerProjectHandlers(): void {
  const { PROJECT } = IPC_CHANNELS

  // Create a new project
  ipcMain.handle(PROJECT.CREATE, async (_event, data: ProjectCreateRequest) => {
    try {
      // Create the project
      const project = projectRepository.create({
        name: data.name,
        sourceVideoPath: data.videoPath,
        sourceVideoDurationMs: 0, // Will be updated after video probe
        targetLanguage: data.targetLanguage,
        sourceLanguage: data.sourceLanguage
      })

      let segments: Segment[] = []

      // Handle CSV import if specified
      if (data.importMode === 'csv' && data.csvPath) {
        try {
          segments = await importSegmentsFromCsv(project.id, data.csvPath)
          console.log(`[Project:Create] Imported ${segments.length} segments from CSV`)
        } catch (csvError) {
          console.error('[Project:Create] CSV import error:', csvError)
          // Don't fail project creation, but log the error
          // The project is created, segments just weren't imported
        }
      }

      return {
        success: true,
        project,
        segments
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

/**
 * Import segments from a CSV file
 * Supports columns: speaker, transcription/original_text/text, translation/translated_text,
 * start_time/start, end_time/end
 */
async function importSegmentsFromCsv(projectId: string, csvPath: string): Promise<Segment[]> {
  if (!existsSync(csvPath)) {
    throw new Error('CSV file not found')
  }

  const content = readFileSync(csvPath, 'utf-8')

  const result = parseCSV<CsvRow>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_')
  })

  if (result.errors.length > 0) {
    throw new Error(`CSV parsing errors: ${result.errors.map((e) => e.message).join(', ')}`)
  }

  if (result.data.length === 0) {
    return []
  }

  // Create a map for speakers
  const speakerMap = new Map<string, string>() // speaker name -> speaker id

  // Collect unique speakers
  const uniqueSpeakers = new Set<string>()
  for (const row of result.data) {
    const speakerName = row.speaker?.trim()
    if (speakerName) {
      uniqueSpeakers.add(speakerName)
    }
  }

  // Create speakers
  for (const speakerName of uniqueSpeakers) {
    const speaker = speakerRepository.create({
      projectId,
      name: speakerName
    })
    speakerMap.set(speakerName, speaker.id)
  }

  // Create segments
  const segments: Segment[] = []
  for (const row of result.data) {
    // Get original text (support multiple column names)
    const originalText = row.transcription || row.original_text || row.text || ''

    // Get translated text (support multiple column names)
    const translatedText = row.translation || row.translated_text || ''

    // Get start time in seconds and convert to ms
    const startTimeStr = row.start_time || row.start || '0'
    const startTimeMs = Math.round(parseFloat(startTimeStr) * 1000)

    // Get end time in seconds and convert to ms
    const endTimeStr = row.end_time || row.end || '0'
    const endTimeMs = Math.round(parseFloat(endTimeStr) * 1000)

    // Get speaker ID if specified
    const speakerName = row.speaker?.trim()
    const speakerId = speakerName ? speakerMap.get(speakerName) : undefined

    // Create the segment
    const segment = segmentRepository.create({
      projectId,
      originalText: originalText.trim(),
      translatedText: translatedText.trim(),
      startTimeMs,
      endTimeMs,
      speakerId
    })

    segments.push(segment)
  }

  return segments
}
