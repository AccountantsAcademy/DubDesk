/**
 * FFmpeg IPC Handlers
 * Handles audio extraction, mixing, and video export operations
 */

import { IPC_CHANNELS } from '@shared/constants/channels'
import { BrowserWindow, ipcMain } from 'electron'
import { overlayRepository, projectRepository } from '../services/database/repositories'
import {
  type AudioExportOptions,
  type AudioSegment,
  cancelExport,
  type ExportOptions,
  type ExtractOptions,
  exportAudioOnly,
  exportVideo,
  exportVideoWithOverlays,
  extractAudio,
  extractWaveform,
  type LipsyncSegment,
  loadWaveformCache,
  type MixOptions,
  mixAudio,
  probeMedia,
  saveWaveformCache,
  spliceVideo
} from '../services/ffmpeg'

export function registerFFmpegHandlers(): void {
  const { FFMPEG } = IPC_CHANNELS

  // Probe media file for metadata
  ipcMain.handle(FFMPEG.PROBE, async (_event, data: { filePath: string }) => {
    try {
      const info = await probeMedia(data.filePath)
      return {
        success: true,
        data: info
      }
    } catch (error) {
      console.error('[FFmpeg:Probe] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to probe media'
      }
    }
  })

  // Extract audio from video
  ipcMain.handle(
    FFMPEG.EXTRACT_AUDIO,
    async (
      event,
      data: {
        videoPath: string
        outputPath: string
        options?: ExtractOptions
      }
    ) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)

        const result = await extractAudio(
          data.videoPath,
          data.outputPath,
          data.options,
          (percent) => {
            if (window) {
              window.webContents.send(FFMPEG.EXTRACT_AUDIO_PROGRESS, { percent })
            }
          }
        )

        return {
          success: true,
          data: result
        }
      } catch (error) {
        console.error('[FFmpeg:ExtractAudio] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Audio extraction failed'
        }
      }
    }
  )

  // Mix audio (combine original with dubbed segments)
  ipcMain.handle(
    FFMPEG.MIX_AUDIO,
    async (
      event,
      data: {
        originalAudioPath: string
        segments: AudioSegment[]
        outputPath: string
        options?: MixOptions
      }
    ) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)

        const result = await mixAudio(
          data.originalAudioPath,
          data.segments,
          data.outputPath,
          data.options,
          (percent) => {
            if (window) {
              window.webContents.send(FFMPEG.EXPORT_PROGRESS, {
                stage: 'mixing',
                percent
              })
            }
          }
        )

        return {
          success: true,
          data: result
        }
      } catch (error) {
        console.error('[FFmpeg:MixAudio] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Audio mixing failed'
        }
      }
    }
  )

  // Export final video (with optional lip-sync video splicing and image overlays)
  ipcMain.handle(
    FFMPEG.EXPORT,
    async (
      event,
      data: {
        videoPath: string
        audioPath: string
        outputPath: string
        options?: ExportOptions
        projectId?: string
        lipsyncSegments?: LipsyncSegment[]
      }
    ) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        const exportId = data.projectId || `export-${Date.now()}`

        // Load image overlays for this project
        const imageOverlays = data.projectId ? overlayRepository.findByProject(data.projectId) : []
        const hasOverlays = imageOverlays.length > 0
        const hasLipsync = data.lipsyncSegments && data.lipsyncSegments.length > 0

        // Get video dimensions for overlay positioning
        let videoWidth = 1920
        let videoHeight = 1080
        if (hasOverlays && data.projectId) {
          const project = projectRepository.findById(data.projectId)
          if (project) {
            videoWidth = project.sourceVideoWidth || 1920
            videoHeight = project.sourceVideoHeight || 1080
          }
        }

        if (hasOverlays) {
          console.log(`[FFmpeg:Export] Found ${imageOverlays.length} image overlay(s)`)
        }

        let videoInputPath = data.videoPath

        if (hasLipsync) {
          // Splice lip-synced video clips
          console.log(
            `[FFmpeg:Export] Splicing ${data.lipsyncSegments!.length} lip-synced clips into export`
          )

          if (hasOverlays) {
            // Both lipsync AND overlays: splice to intermediate, then overlay
            const path = await import('node:path')
            const { mkdir } = await import('node:fs/promises')
            const intermediateDir = path.dirname(data.outputPath)
            await mkdir(intermediateDir, { recursive: true })
            const intermediatePath = path.join(intermediateDir, `_intermediate_${Date.now()}.mp4`)

            await spliceVideo(
              data.videoPath,
              data.lipsyncSegments!,
              data.audioPath,
              intermediatePath,
              data.options,
              (progress) => {
                if (window) {
                  window.webContents.send(FFMPEG.EXPORT_PROGRESS, {
                    stage: 'encoding',
                    percent: progress.percent * 0.6 // 0-60%
                  })
                }
              }
            )

            videoInputPath = intermediatePath
          } else {
            // Only lipsync, no overlays
            const result = await spliceVideo(
              data.videoPath,
              data.lipsyncSegments!,
              data.audioPath,
              data.outputPath,
              data.options,
              (progress) => {
                if (window) {
                  window.webContents.send(FFMPEG.EXPORT_PROGRESS, {
                    stage: 'encoding',
                    ...progress
                  })
                }
              }
            )
            return { success: true, data: result }
          }
        }

        if (hasOverlays) {
          // Apply image overlays (re-encodes video)
          const result = await exportVideoWithOverlays(
            videoInputPath,
            data.audioPath,
            data.outputPath,
            imageOverlays,
            videoWidth,
            videoHeight,
            data.options,
            (progress) => {
              if (window) {
                const basePercent = hasLipsync ? 60 : 0
                const range = hasLipsync ? 40 : 100
                window.webContents.send(FFMPEG.EXPORT_PROGRESS, {
                  stage: 'encoding',
                  percent: basePercent + progress.percent * (range / 100)
                })
              }
            }
          )

          // Clean up intermediate file if we created one
          if (videoInputPath !== data.videoPath) {
            const { unlink } = await import('node:fs/promises')
            unlink(videoInputPath).catch(() => {})
          }

          return { success: true, data: result }
        }

        // Fast path: just mux video + audio (no overlays, no lipsync)
        const result = await exportVideo(
          data.videoPath,
          data.audioPath,
          data.outputPath,
          data.options,
          (progress) => {
            if (window) {
              window.webContents.send(FFMPEG.EXPORT_PROGRESS, {
                stage: 'encoding',
                ...progress
              })
            }
          },
          exportId
        )

        return { success: true, data: result }
      } catch (error) {
        console.error('[FFmpeg:Export] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Video export failed'
        }
      }
    }
  )

  // Cancel export
  ipcMain.handle(FFMPEG.CANCEL, async (_event, data: { projectId: string }) => {
    try {
      const cancelled = cancelExport(data.projectId)
      return {
        success: true,
        cancelled
      }
    } catch (error) {
      console.error('[FFmpeg:Cancel] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel export'
      }
    }
  })

  // Export audio only (no video)
  ipcMain.handle(
    FFMPEG.EXPORT_AUDIO,
    async (
      event,
      data: {
        audioPath: string
        outputPath: string
        options?: AudioExportOptions
        projectId?: string
      }
    ) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        const exportId = data.projectId || `export-audio-${Date.now()}`

        const result = await exportAudioOnly(
          data.audioPath,
          data.outputPath,
          data.options,
          (percent) => {
            if (window) {
              window.webContents.send(FFMPEG.EXPORT_PROGRESS, {
                stage: 'encoding-audio',
                percent
              })
            }
          },
          exportId
        )

        return {
          success: true,
          data: result
        }
      } catch (error) {
        console.error('[FFmpeg:ExportAudio] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Audio export failed'
        }
      }
    }
  )

  // Extract waveform peaks from audio
  ipcMain.handle(
    FFMPEG.EXTRACT_WAVEFORM,
    async (
      _event,
      data: {
        mediaPath: string
        projectId: string
        samplesPerSecond?: number
        forceRefresh?: boolean
      }
    ) => {
      try {
        // Construct project directory path
        const { app } = await import('electron')
        const path = await import('node:path')
        const fs = await import('node:fs')
        const projectDir = path.join(app.getPath('userData'), 'projects', data.projectId)

        // Try to load from cache first unless force refresh
        if (!data.forceRefresh) {
          const cached = await loadWaveformCache(projectDir)
          if (cached) {
            console.log('[FFmpeg:Waveform] Loaded from cache')
            return {
              success: true,
              data: cached,
              cached: true
            }
          }
        }

        // Check if media file exists
        if (!fs.existsSync(data.mediaPath)) {
          console.error('[FFmpeg:Waveform] Media file not found:', data.mediaPath)
          return {
            success: false,
            error: `Media file not found: ${data.mediaPath}`
          }
        }

        console.log('[FFmpeg:Waveform] Extracting waveform from:', data.mediaPath)
        const waveformData = await extractWaveform(data.mediaPath, data.samplesPerSecond || 100)

        // Save to cache
        await saveWaveformCache(projectDir, waveformData)
        console.log('[FFmpeg:Waveform] Saved to cache, peaks:', waveformData.peaks.length)

        return {
          success: true,
          data: waveformData,
          cached: false
        }
      } catch (error) {
        console.error('[FFmpeg:Waveform] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Waveform extraction failed'
        }
      }
    }
  )

  console.log('[IPC] FFmpeg handlers registered')
}
