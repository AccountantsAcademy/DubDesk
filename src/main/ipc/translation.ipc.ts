/**
 * Translation IPC Handlers
 * Handles translation operations via Claude API
 */

import { IPC_CHANNELS } from '@shared/constants/channels'
import { BrowserWindow, ipcMain } from 'electron'
import {
  isTranslationConfigured,
  type TranslationOptions,
  type TranslationSegment,
  translateBatch,
  translateText
} from '../services/translation'

export function registerTranslationHandlers(): void {
  const { TRANSLATION } = IPC_CHANNELS

  // Translate a single segment
  ipcMain.handle(
    TRANSLATION.TRANSLATE,
    async (
      _event,
      data: {
        text: string
        options: TranslationOptions
      }
    ) => {
      try {
        // Check if configured
        const configured = await isTranslationConfigured()
        if (!configured) {
          return {
            success: false,
            error: 'Anthropic API key not configured. Please add your API key in Settings.'
          }
        }

        const translatedText = await translateText(data.text, data.options)
        return {
          success: true,
          data: { translatedText }
        }
      } catch (error) {
        console.error('[Translation] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Translation failed'
        }
      }
    }
  )

  // Translate multiple segments in batch
  ipcMain.handle(
    TRANSLATION.TRANSLATE_BATCH,
    async (
      event,
      data: {
        segments: TranslationSegment[]
        options: TranslationOptions
      }
    ) => {
      try {
        // Check if configured
        const configured = await isTranslationConfigured()
        if (!configured) {
          return {
            success: false,
            error: 'Anthropic API key not configured. Please add your API key in Settings.'
          }
        }

        const window = BrowserWindow.fromWebContents(event.sender)

        const results = await translateBatch(data.segments, data.options, (progress) => {
          // Send progress updates
          if (window) {
            window.webContents.send(TRANSLATION.TRANSLATE_BATCH_PROGRESS, progress)
          }
        })

        return {
          success: true,
          data: results
        }
      } catch (error) {
        console.error('[Translation:Batch] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Batch translation failed'
        }
      }
    }
  )

  console.log('[IPC] Translation handlers registered')
}
