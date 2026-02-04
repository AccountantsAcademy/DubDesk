/**
 * Filesystem IPC Handlers
 * Handles file dialog and file operations
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { VIDEO_FILE_EXTENSIONS } from '@shared/constants/defaults'
import { app, dialog, ipcMain } from 'electron'
import { parse as parseCSV } from 'papaparse'
import { extractAudio, generateThumbnail, getMediaMetadata } from '../services/fileImport'

export function registerFilesystemHandlers(): void {
  const { FILESYSTEM } = IPC_CHANNELS

  // Open video file dialog
  ipcMain.handle(FILESYSTEM.OPEN_VIDEO_DIALOG, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Video File',
        properties: ['openFile'],
        filters: [
          {
            name: 'Video Files',
            extensions: VIDEO_FILE_EXTENSIONS as unknown as string[]
          },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      return {
        success: true,
        canceled: result.canceled,
        filePath: result.filePaths[0]
      }
    } catch (error) {
      console.error('[FS:OpenVideoDialog] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open dialog'
      }
    }
  })

  // Open audio file dialog
  ipcMain.handle(FILESYSTEM.OPEN_AUDIO_DIALOG, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Audio File',
        properties: ['openFile'],
        filters: [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'aac', 'ogg', 'flac'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      return {
        success: true,
        canceled: result.canceled,
        filePath: result.filePaths[0]
      }
    } catch (error) {
      console.error('[FS:OpenAudioDialog] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open dialog'
      }
    }
  })

  // Open CSV file dialog
  ipcMain.handle(FILESYSTEM.OPEN_CSV_DIALOG, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select CSV File',
        properties: ['openFile'],
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      return {
        success: true,
        canceled: result.canceled,
        filePath: result.filePaths[0]
      }
    } catch (error) {
      console.error('[FS:OpenCSVDialog] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open dialog'
      }
    }
  })

  // Save file dialog
  ipcMain.handle(
    FILESYSTEM.SAVE_DIALOG,
    async (
      _event,
      data: {
        title?: string
        defaultPath?: string
        filters?: Array<{ name: string; extensions: string[] }>
      }
    ) => {
      try {
        const result = await dialog.showSaveDialog({
          title: data.title || 'Save File',
          defaultPath: data.defaultPath,
          filters: data.filters || [{ name: 'All Files', extensions: ['*'] }]
        })

        return {
          success: true,
          canceled: result.canceled,
          filePath: result.filePath
        }
      } catch (error) {
        console.error('[FS:SaveDialog] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open dialog'
        }
      }
    }
  )

  // Read and parse CSV file
  ipcMain.handle(FILESYSTEM.READ_CSV, async (_event, data: { filePath: string }) => {
    try {
      if (!existsSync(data.filePath)) {
        return {
          success: false,
          error: 'File not found'
        }
      }

      const content = readFileSync(data.filePath, 'utf-8')

      // Parse CSV
      const result = parseCSV(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase()
      })

      if (result.errors.length > 0) {
        return {
          success: false,
          error: `CSV parsing errors: ${result.errors.map((e) => e.message).join(', ')}`
        }
      }

      return {
        success: true,
        data: result.data as Array<Record<string, string>>,
        headers: result.meta.fields || [],
        rowCount: result.data.length
      }
    } catch (error) {
      console.error('[FS:ReadCSV] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read CSV file'
      }
    }
  })

  // Write file
  ipcMain.handle(
    FILESYSTEM.WRITE_FILE,
    async (_event, data: { filePath: string; content: string | Buffer }) => {
      try {
        writeFileSync(data.filePath, data.content)
        return { success: true }
      } catch (error) {
        console.error('[FS:WriteFile] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to write file'
        }
      }
    }
  )

  // Get app path
  ipcMain.handle(
    FILESYSTEM.GET_APP_PATH,
    async (
      _event,
      data: {
        name?: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents' | 'downloads'
      }
    ) => {
      try {
        const pathName = data.name || 'userData'
        const path = app.getPath(pathName)
        return {
          success: true,
          path
        }
      } catch (error) {
        console.error('[FS:GetAppPath] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get app path'
        }
      }
    }
  )

  // Get temp directory (for project files)
  ipcMain.handle(
    FILESYSTEM.GET_TEMP_DIR,
    async (_event, data?: { projectId?: string; subDir?: string }) => {
      try {
        const tempBase = app.getPath('temp')
        const appTempDir = join(tempBase, 'dubdesk')

        // Create the app temp directory if it doesn't exist
        if (!existsSync(appTempDir)) {
          mkdirSync(appTempDir, { recursive: true })
        }

        // If a project ID is provided, create a project-specific temp directory
        if (data?.projectId) {
          let projectTempDir = join(appTempDir, data.projectId)
          if (data.subDir) {
            projectTempDir = join(projectTempDir, data.subDir)
          }
          if (!existsSync(projectTempDir)) {
            mkdirSync(projectTempDir, { recursive: true })
          }
          return {
            success: true,
            path: projectTempDir
          }
        }

        return {
          success: true,
          path: appTempDir
        }
      } catch (error) {
        console.error('[FS:GetTempDir] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get temp directory'
        }
      }
    }
  )

  // Check if file exists
  ipcMain.handle(FILESYSTEM.EXISTS, async (_event, data: { path: string }) => {
    try {
      return {
        success: true,
        exists: existsSync(data.path)
      }
    } catch (error) {
      console.error('[FS:Exists] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check file existence'
      }
    }
  })

  // Create directory
  ipcMain.handle(FILESYSTEM.MKDIR, async (_event, data: { path: string; recursive?: boolean }) => {
    try {
      if (!existsSync(data.path)) {
        mkdirSync(data.path, { recursive: data.recursive ?? true })
      }
      return { success: true }
    } catch (error) {
      console.error('[FS:Mkdir] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create directory'
      }
    }
  })

  // Delete file
  ipcMain.handle(FILESYSTEM.DELETE_FILE, async (_event, data: { path: string }) => {
    try {
      if (existsSync(data.path)) {
        unlinkSync(data.path)
      }
      return { success: true }
    } catch (error) {
      console.error('[FS:DeleteFile] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete file'
      }
    }
  })

  // Get media metadata (video duration, resolution, etc.)
  ipcMain.handle(FILESYSTEM.GET_MEDIA_METADATA, async (_event, data: { filePath: string }) => {
    try {
      if (!existsSync(data.filePath)) {
        return {
          success: false,
          error: 'File not found'
        }
      }

      const metadata = await getMediaMetadata(data.filePath)
      return {
        success: true,
        metadata
      }
    } catch (error) {
      console.error('[FS:GetMediaMetadata] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get media metadata'
      }
    }
  })

  // Extract audio from video
  ipcMain.handle(
    FILESYSTEM.EXTRACT_AUDIO,
    async (_event, data: { videoPath: string; outputPath: string }) => {
      try {
        if (!existsSync(data.videoPath)) {
          return {
            success: false,
            error: 'Video file not found'
          }
        }

        await extractAudio(data.videoPath, data.outputPath)
        return {
          success: true,
          audioPath: data.outputPath
        }
      } catch (error) {
        console.error('[FS:ExtractAudio] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to extract audio'
        }
      }
    }
  )

  // Generate video thumbnail
  ipcMain.handle(
    FILESYSTEM.GENERATE_THUMBNAIL,
    async (_event, data: { videoPath: string; outputPath: string; timeSeconds?: number }) => {
      try {
        if (!existsSync(data.videoPath)) {
          return {
            success: false,
            error: 'Video file not found'
          }
        }

        await generateThumbnail(data.videoPath, data.outputPath, data.timeSeconds)
        return {
          success: true,
          thumbnailPath: data.outputPath
        }
      } catch (error) {
        console.error('[FS:GenerateThumbnail] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate thumbnail'
        }
      }
    }
  )

  console.log('[IPC] Filesystem handlers registered')
}
