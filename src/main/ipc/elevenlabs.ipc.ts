/**
 * ElevenLabs IPC Handlers
 * Handles ElevenLabs STT, TTS, and voice operations
 */

import { IPC_CHANNELS } from '@shared/constants/channels'
import { BrowserWindow, ipcMain } from 'electron'
import { type TranscribeOptions, transcribeAudio } from '../services/elevenlabs/stt'
import { generateSpeech, generateSpeechBatch, type TTSOptions } from '../services/elevenlabs/tts'
import {
  clearVoiceCache,
  getVoice,
  getVoices,
  getVoicesByCategory,
  searchVoices
} from '../services/elevenlabs/voices'
import { generateSingleSegment } from '../services/workflow/generate'

export function registerElevenLabsHandlers(): void {
  const { TTS, TRANSCRIPTION } = IPC_CHANNELS

  // ===== Transcription Handlers =====

  // Start transcription
  ipcMain.handle(
    TRANSCRIPTION.START,
    async (
      event,
      data: {
        audioPath: string
        projectId: string
        options?: TranscribeOptions
      }
    ) => {
      try {
        const result = await transcribeAudio(data.audioPath, data.options)

        // Notify completion
        const window = BrowserWindow.fromWebContents(event.sender)
        if (window) {
          window.webContents.send(TRANSCRIPTION.COMPLETE, {
            projectId: data.projectId,
            result
          })
        }

        return {
          success: true,
          data: result
        }
      } catch (error) {
        console.error('[ElevenLabs:Transcription] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Transcription failed'
        }
      }
    }
  )

  // Cancel transcription (not directly supported, but we can track state)
  ipcMain.handle(TRANSCRIPTION.CANCEL, async (_event, _data: { projectId: string }) => {
    // Transcription API doesn't support cancellation
    // This would need to be implemented with AbortController if needed
    return { success: true }
  })

  // ===== TTS Handlers =====

  // Generate speech for raw text (low-level)
  ipcMain.handle(
    TTS.GENERATE,
    async (
      _event,
      data: {
        text: string
        outputPath: string
        options: TTSOptions
      }
    ) => {
      try {
        const result = await generateSpeech(data.text, data.outputPath, data.options)
        return {
          success: true,
          data: result
        }
      } catch (error) {
        console.error('[ElevenLabs:TTS] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'TTS generation failed'
        }
      }
    }
  )

  // Generate speech for a single segment (high-level, updates DB)
  ipcMain.handle(
    TTS.GENERATE_SINGLE,
    async (
      _event,
      data: {
        segmentId: string
        voiceId: string
        options?: Partial<TTSOptions>
      }
    ) => {
      try {
        const result = await generateSingleSegment(data.segmentId, data.voiceId, data.options)
        return {
          success: true,
          data: result
        }
      } catch (error) {
        console.error('[ElevenLabs:TTS:Single] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Single segment TTS generation failed'
        }
      }
    }
  )

  // Generate speech for multiple segments
  ipcMain.handle(
    TTS.GENERATE_BATCH,
    async (
      event,
      data: {
        segments: Array<{ id: string; text: string; voiceId?: string }>
        outputDir: string
        options: Omit<TTSOptions, 'voiceId'> & { defaultVoiceId: string }
      }
    ) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)

        const results = await generateSpeechBatch(
          data.segments,
          data.outputDir,
          data.options,
          (progress) => {
            // Send progress updates
            if (window) {
              window.webContents.send(TTS.GENERATE_BATCH_PROGRESS, progress)
            }
          }
        )

        return {
          success: true,
          data: results
        }
      } catch (error) {
        console.error('[ElevenLabs:TTS:Batch] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Batch TTS generation failed'
        }
      }
    }
  )

  // Get available voices
  ipcMain.handle(TTS.GET_VOICES, async (_event, data?: { refresh?: boolean }) => {
    try {
      if (data?.refresh) {
        clearVoiceCache()
      }
      const voices = await getVoices()
      return {
        success: true,
        data: voices
      }
    } catch (error) {
      console.error('[ElevenLabs:Voices] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get voices'
      }
    }
  })

  // Preview a voice (get voice details with preview URL)
  ipcMain.handle(TTS.PREVIEW_VOICE, async (_event, data: { voiceId: string; text?: string }) => {
    try {
      const voice = await getVoice(data.voiceId)
      return {
        success: true,
        data: voice
      }
    } catch (error) {
      console.error('[ElevenLabs:VoicePreview] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get voice preview'
      }
    }
  })

  console.log('[IPC] ElevenLabs handlers registered')
}

// Export additional voice utilities for direct use
export { getVoicesByCategory, searchVoices }
