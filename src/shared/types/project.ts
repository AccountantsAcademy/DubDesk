/**
 * Project Types
 * Shared between main and renderer processes
 */

export interface Project {
  id: string
  name: string
  description?: string
  sourceVideoPath: string
  sourceVideoDurationMs: number
  sourceVideoWidth?: number
  sourceVideoHeight?: number
  sourceVideoFps?: number
  sourceAudioPath?: string
  targetLanguage: string
  sourceLanguage?: string
  createdAt: string
  updatedAt: string
  settings?: ProjectSettings
}

export interface ProjectSettings {
  defaultVoiceId?: string
  originalAudioVolume: number
  dubbedAudioVolume: number
  duckingEnabled: boolean
  duckingGainDb: number
  snapToGrid: boolean
  gridSizeMs: number
  /** Minimum gap duration (ms) before switching back to original audio. Gaps shorter than this will stay muted. Default: 5000 (5 seconds) */
  minGapForOriginalMs: number
}

export interface ProjectCreateInput {
  name: string
  videoPath: string
  targetLanguage: string
  sourceLanguage?: string
  importMode: 'automatic' | 'csv'
  csvPath?: string
}

export interface ProjectUpdateInput {
  name?: string
  description?: string
  targetLanguage?: string
  sourceLanguage?: string
  settings?: Partial<ProjectSettings>
}

export interface RecentProject {
  id: string
  name: string
  sourceVideoPath: string
  updatedAt: string
  thumbnailPath?: string
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  originalAudioVolume: 0.3,
  dubbedAudioVolume: 1.0,
  duckingEnabled: true,
  duckingGainDb: -12,
  snapToGrid: true,
  gridSizeMs: 100,
  minGapForOriginalMs: 5000
}
