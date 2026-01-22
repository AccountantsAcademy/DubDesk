/**
 * IPC Handler Registration
 * Registers all IPC handlers for communication between main and renderer
 */

import { ipcMain } from 'electron'
import { registerElevenLabsHandlers } from './elevenlabs.ipc'
import { registerFFmpegHandlers } from './ffmpeg.ipc'
import { registerFilesystemHandlers } from './filesystem.ipc'
import { registerHistoryHandlers } from './history.ipc'
import { registerProjectHandlers } from './project.ipc'
import { registerSegmentHandlers } from './segment.ipc'
import { registerSettingsHandlers } from './settings.ipc'
import { registerTranslationHandlers } from './translation.ipc'

/**
 * Register all IPC handlers
 * Called during app initialization
 */
export function registerAllHandlers(): void {
  console.log('[IPC] Registering handlers...')

  registerProjectHandlers()
  registerSegmentHandlers()
  registerSettingsHandlers()
  registerFilesystemHandlers()
  registerElevenLabsHandlers()
  registerTranslationHandlers()
  registerFFmpegHandlers()
  registerHistoryHandlers()

  console.log('[IPC] All handlers registered')
}

/**
 * Helper to create a safe IPC handler that catches errors
 */
export function createHandler<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, async (_event, ...args: TArgs) => {
    try {
      const result = await handler(...args)
      return { success: true, data: result }
    } catch (error) {
      console.error(`[IPC] Error in ${channel}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
      }
    }
  })
}

/**
 * Helper to create a simple handler that returns the result directly
 */
export function createSimpleHandler<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, async (_event, ...args: TArgs) => {
    return handler(...args)
  })
}
