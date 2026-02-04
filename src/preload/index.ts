import path from 'node:path'
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/constants/channels'

const api = {
  // Menu events
  onMenuUndo: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:undo', handler)
    return () => ipcRenderer.removeListener('menu:undo', handler)
  },
  onMenuRedo: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:redo', handler)
    return () => ipcRenderer.removeListener('menu:redo', handler)
  },
  onMenuSelectAll: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:selectAll', handler)
    return () => ipcRenderer.removeListener('menu:selectAll', handler)
  },

  // Project operations
  project: {
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT.CREATE, data),
    open: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT.OPEN, { id }),
    save: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT.SAVE, { id }),
    update: (id: string, updates: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT.UPDATE, { id, updates }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT.DELETE, { id }),
    listRecent: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT.LIST_RECENT)
  },

  // Segment operations
  segment: {
    getAll: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.SEGMENT.GET_ALL, { projectId }),
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SEGMENT.CREATE, data),
    update: (id: string, updates: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEGMENT.UPDATE, { id, updates }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SEGMENT.DELETE, { id }),
    batchUpdate: (updates: unknown[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEGMENT.BATCH_UPDATE, { updates }),
    split: (id: string, splitTimeMs: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEGMENT.SPLIT, { id, splitTimeMs }),
    merge: (ids: string[]) => ipcRenderer.invoke(IPC_CHANNELS.SEGMENT.MERGE, { ids }),
    reorder: (projectId: string, segmentIds: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEGMENT.REORDER, { projectId, segmentIds })
  },

  // Speaker operations
  speaker: {
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER.CREATE, data),
    update: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SPEAKER.UPDATE, { id, ...updates }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER.DELETE, { id }),
    getAll: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.SPEAKER.GET_ALL, { projectId })
  },

  // TTS operations
  tts: {
    generate: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TTS.GENERATE, data),
    generateSingle: (data: {
      segmentId: string
      voiceId: string
      options?: {
        modelId?: string
        stability?: number
        similarityBoost?: number
      }
    }) => ipcRenderer.invoke(IPC_CHANNELS.TTS.GENERATE_SINGLE, data),
    generateBatch: (data: {
      segments: Array<{ id: string; text: string; voiceId?: string }>
      outputDir: string
      options: {
        defaultVoiceId: string
        modelId?: string
        stability?: number
        similarityBoost?: number
      }
    }) => ipcRenderer.invoke(IPC_CHANNELS.TTS.GENERATE_BATCH, data),
    getVoices: (options?: { refresh?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.TTS.GET_VOICES, options),
    previewVoice: (voiceId: string, text: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TTS.PREVIEW_VOICE, { voiceId, text }),
    onBatchProgress: (callback: (progress: unknown) => void) => {
      ipcRenderer.on(IPC_CHANNELS.TTS.GENERATE_BATCH_PROGRESS, (_event, progress) =>
        callback(progress)
      )
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.TTS.GENERATE_BATCH_PROGRESS)
    }
  },

  // Transcription operations
  transcription: {
    start: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPTION.START, data),
    cancel: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPTION.CANCEL, { projectId }),
    onProgress: (callback: (progress: unknown) => void) => {
      ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION.PROGRESS, (_event, progress) => callback(progress))
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.TRANSCRIPTION.PROGRESS)
    },
    onComplete: (callback: (result: unknown) => void) => {
      ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION.COMPLETE, (_event, result) => callback(result))
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.TRANSCRIPTION.COMPLETE)
    }
  },

  // Translation operations
  translation: {
    translate: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION.TRANSLATE, data),
    translateBatch: (data: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.TRANSLATION.TRANSLATE_BATCH, data),
    onBatchProgress: (callback: (progress: unknown) => void) => {
      ipcRenderer.on(IPC_CHANNELS.TRANSLATION.TRANSLATE_BATCH_PROGRESS, (_event, progress) =>
        callback(progress)
      )
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.TRANSLATION.TRANSLATE_BATCH_PROGRESS)
    }
  },

  // FFmpeg operations
  ffmpeg: {
    probe: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FFMPEG.PROBE, { filePath }),
    extractAudio: (videoPath: string, outputPath: string, options?: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.FFMPEG.EXTRACT_AUDIO, {
        videoPath,
        outputPath,
        ...(options || {})
      }),
    mixAudio: (data: {
      originalAudioPath: string
      segments: Array<{
        audioPath: string
        startTimeMs: number
        endTimeMs: number
        audioDurationMs?: number
      }>
      outputPath: string
      options?: {
        format?: 'wav' | 'mp3' | 'aac'
        sampleRate?: number
        originalVolume?: number
        dubbedVolume?: number
        minGapForOriginalMs?: number
      }
    }) => ipcRenderer.invoke(IPC_CHANNELS.FFMPEG.MIX_AUDIO, data),
    export: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.FFMPEG.EXPORT, data),
    exportAudio: (data: {
      audioPath: string
      outputPath: string
      options?: { audioCodec?: 'aac' | 'mp3' | 'wav' | 'flac'; audioBitrate?: string }
      projectId?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.FFMPEG.EXPORT_AUDIO, data),
    cancelExport: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FFMPEG.CANCEL, { projectId }),
    onExportProgress: (callback: (progress: unknown) => void) => {
      ipcRenderer.on(IPC_CHANNELS.FFMPEG.EXPORT_PROGRESS, (_event, progress) => callback(progress))
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.FFMPEG.EXPORT_PROGRESS)
    },
    extractWaveform: (data: {
      mediaPath: string
      projectId: string
      samplesPerSecond?: number
      forceRefresh?: boolean
    }) => ipcRenderer.invoke(IPC_CHANNELS.FFMPEG.EXTRACT_WAVEFORM, data)
  },

  // File system operations
  fs: {
    openVideoDialog: (options?: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.OPEN_VIDEO_DIALOG, options),
    openAudioDialog: (options?: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.OPEN_AUDIO_DIALOG, options),
    openCsvDialog: (options?: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.OPEN_CSV_DIALOG, options),
    saveDialog: (options?: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.SAVE_DIALOG, options),
    readCSV: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.READ_CSV, { filePath }),
    getAppPath: () => ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.GET_APP_PATH),
    getTempDir: (data?: { projectId?: string; subDir?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.GET_TEMP_DIR, data),
    exists: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.EXISTS, { filePath }),
    mkdir: (dirPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.MKDIR, { dirPath }),
    deleteFile: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.DELETE_FILE, { filePath }),
    getMediaMetadata: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.GET_MEDIA_METADATA, { filePath }),
    extractAudio: (videoPath: string, outputPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.EXTRACT_AUDIO, { videoPath, outputPath }),
    generateThumbnail: (videoPath: string, outputPath: string, timeSeconds?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILESYSTEM.GENERATE_THUMBNAIL, {
        videoPath,
        outputPath,
        timeSeconds
      }),
    joinPath: (...segments: string[]) => path.join(...segments)
  },

  // Settings operations
  settings: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET, { key }),
    set: (key: string, value: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET, { key, value }),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_ALL),
    setBulk: (settings: Record<string, string>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET_BULK, { settings }),
    getApiKey: (keyType: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_API_KEY, { keyType }),
    setApiKey: (keyType: string, value: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET_API_KEY, { keyType, value }),
    deleteApiKey: (keyType: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.DELETE_API_KEY, { keyType }),
    validateApiKey: (keyType: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.VALIDATE_API_KEY, { keyType }),
    getApiKeyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_API_KEY_STATUS),
    getElevenLabsRegion: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_ELEVENLABS_REGION),
    setElevenLabsRegion: (region: 'us' | 'eu') =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET_ELEVENLABS_REGION, { region })
  },

  // History operations
  history: {
    undo: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY.UNDO, { projectId }),
    redo: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY.REDO, { projectId }),
    getStack: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HISTORY.GET_STACK, { projectId }),
    clear: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY.CLEAR, { projectId }),
    record: (projectId: string, action: { type: string; undoData: unknown; redoData: unknown }) =>
      ipcRenderer.invoke(IPC_CHANNELS.HISTORY.RECORD, { projectId, action })
  }
}

export type DubDeskAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('dubdesk', api)
  } catch (error) {
    console.error('Failed to expose API:', error)
  }
} else {
  ;(window as { dubdesk?: DubDeskAPI }).dubdesk = api
}
