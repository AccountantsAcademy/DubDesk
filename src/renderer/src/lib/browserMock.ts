/**
 * Browser mock for window.dubdesk API
 * Used when running the app in a browser without Electron
 */

// Check if we're in Electron
export const isElectron = typeof window !== 'undefined' && window.dubdesk !== undefined

// Mock data for browser testing
const mockProjects: Array<{
  id: string
  name: string
  sourceVideoPath: string
  updatedAt: string
}> = []

const mockSegments: Array<{
  id: string
  projectId: string
  originalText: string
  translatedText: string
  startTimeMs: number
  endTimeMs: number
  status: string
}> = []

// Create mock API that mimics the preload API
export function createBrowserMock() {
  const mockApi = {
    project: {
      create: async (data: unknown) => {
        const input = data as {
          name?: string
          videoPath?: string
          sourceLanguage?: string
          targetLanguage?: string
        }
        const project = {
          id: `project-${Date.now()}`,
          name: input.name || 'New Project',
          sourceVideoPath: input.videoPath || '',
          sourceVideoDurationMs: 60000, // 1 minute mock duration
          sourceLanguage: input.sourceLanguage || 'en',
          targetLanguage: input.targetLanguage || 'es',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        mockProjects.push(project as (typeof mockProjects)[0])
        return { success: true, project }
      },
      open: async (id: string) => {
        const project = mockProjects.find((p) => p.id === id)
        return project ? { success: true, project } : { success: false, error: 'Not found' }
      },
      save: async () => ({ success: true }),
      update: async () => ({ success: true }),
      delete: async () => ({ success: true }),
      listRecent: async () => ({ success: true, projects: mockProjects })
    },
    segment: {
      getAll: async () => ({ success: true, data: mockSegments }),
      create: async () => ({ success: true, data: {} }),
      update: async () => ({ success: true }),
      delete: async () => ({ success: true }),
      batchUpdate: async () => ({ success: true }),
      split: async () => ({ success: true }),
      merge: async () => ({ success: true }),
      reorder: async () => ({ success: true })
    },
    speaker: {
      create: async () => ({ success: true, data: {} }),
      update: async () => ({ success: true }),
      delete: async () => ({ success: true }),
      getAll: async () => ({ success: true, data: [] })
    },
    tts: {
      generate: async () => ({ success: true, data: {} }),
      generateBatch: async () => ({ success: true, data: [] }),
      getVoices: async () => ({
        success: true,
        data: [
          { voice_id: 'mock-voice-1', name: 'Mock Voice 1' },
          { voice_id: 'mock-voice-2', name: 'Mock Voice 2' }
        ]
      }),
      previewVoice: async () => ({ success: true, data: {} }),
      onBatchProgress: () => () => {}
    },
    transcription: {
      start: async () => ({ success: true, data: { segments: [] } }),
      cancel: async () => ({ success: true }),
      onProgress: () => () => {},
      onComplete: () => () => {}
    },
    translation: {
      translate: async () => ({ success: true, data: {} }),
      translateBatch: async () => ({ success: true, data: [] }),
      onBatchProgress: () => () => {}
    },
    ffmpeg: {
      probe: async () => ({ success: true, data: {} }),
      extractAudio: async () => ({ success: true, data: {} }),
      mixAudio: async () => ({ success: true, data: { outputPath: '/mock/mixed_audio.wav' } }),
      export: async () => ({ success: true, data: {} }),
      cancelExport: async () => ({ success: true }),
      onExportProgress: () => () => {}
    },
    fs: {
      openVideoDialog: async () => ({
        success: true,
        canceled: false,
        filePath: '/mock/path/video.mp4'
      }),
      openAudioDialog: async () => ({ success: true, canceled: true, filePath: null }),
      openCsvDialog: async () => ({
        success: true,
        canceled: false,
        filePath: '/mock/path/transcript.csv'
      }),
      saveDialog: async () => ({ success: true, canceled: false, filePath: '/mock/output.mp4' }),
      readCSV: async () => ({ success: true, data: [] }),
      getAppPath: async () => ({ success: true, data: '/mock/app' }),
      getTempDir: async (_data?: { projectId?: string; subDir?: string }) => ({
        success: true,
        path: '/tmp/dubdesk'
      }),
      exists: async () => ({ success: true, exists: true }),
      mkdir: async () => ({ success: true }),
      deleteFile: async () => ({ success: true }),
      getMediaMetadata: async () => ({
        success: true,
        data: { duration: 60000, width: 1920, height: 1080, fps: 30 }
      }),
      extractAudio: async () => ({ success: true }),
      generateThumbnail: async () => ({ success: true })
    },
    settings: {
      get: async () => ({ success: true, value: null }),
      set: async () => ({ success: true }),
      getAll: async () => ({ success: true, data: {} }),
      setBulk: async () => ({ success: true }),
      getApiKey: async () => ({ success: true, exists: false, masked: null }),
      setApiKey: async () => ({ success: true }),
      deleteApiKey: async () => ({ success: true }),
      validateApiKey: async () => ({ success: true, valid: true }),
      getApiKeyStatus: async () => ({
        success: true,
        data: { elevenlabs: false, anthropic: false }
      })
    },
    history: {
      undo: async () => ({ success: true }),
      redo: async () => ({ success: true }),
      getStack: async () => ({ success: true, data: { undo: [], redo: [] } }),
      clear: async () => ({ success: true })
    }
  }

  return mockApi
}

// Initialize mock if not in Electron
export function initBrowserMock() {
  if (!isElectron) {
    console.log('[BrowserMock] Running in browser mode - using mock API')
    ;(window as unknown as { dubdesk: ReturnType<typeof createBrowserMock> }).dubdesk =
      createBrowserMock()
  }
}
