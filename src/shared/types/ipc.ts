/**
 * IPC Types
 * Request and response types for all IPC communication
 */

import type { Project, ProjectCreateInput, RecentProject } from './project'
import type {
  Segment,
  SegmentBatchUpdate,
  SegmentCreateInput,
  SegmentUpdateInput,
  Speaker,
  SpeakerCreateInput
} from './segment'

// ============================================
// Project IPC Types
// ============================================

export interface ProjectCreateRequest extends ProjectCreateInput {}

export interface ProjectCreateResponse {
  project: Project
  segments: Segment[]
}

export interface ProjectOpenRequest {
  id: string
}

export interface ProjectOpenResponse {
  project: Project
  segments: Segment[]
  speakers: Speaker[]
}

export interface ProjectSaveRequest {
  id: string
}

export interface ProjectSaveResponse {
  success: boolean
  savedAt: string
}

export interface ProjectListRecentResponse {
  projects: RecentProject[]
}

export interface ProjectDeleteRequest {
  id: string
}

// ============================================
// Segment IPC Types
// ============================================

export interface SegmentGetAllRequest {
  projectId: string
}

export interface SegmentGetAllResponse {
  segments: Segment[]
}

export interface SegmentCreateRequest extends SegmentCreateInput {}

export interface SegmentCreateResponse {
  segment: Segment
}

export interface SegmentUpdateRequest {
  id: string
  updates: SegmentUpdateInput
}

export interface SegmentUpdateResponse {
  segment: Segment
}

export interface SegmentDeleteRequest {
  id: string
}

export interface SegmentBatchUpdateRequest {
  updates: SegmentBatchUpdate[]
}

export interface SegmentBatchUpdateResponse {
  segments: Segment[]
}

export interface SegmentSplitRequest {
  id: string
  splitTimeMs: number
}

export interface SegmentSplitResponse {
  segments: [Segment, Segment]
}

export interface SegmentMergeRequest {
  ids: string[]
}

export interface SegmentMergeResponse {
  segment: Segment
}

// ============================================
// Speaker IPC Types
// ============================================

export interface SpeakerCreateRequest extends SpeakerCreateInput {}

export interface SpeakerCreateResponse {
  speaker: Speaker
}

export interface SpeakerUpdateRequest {
  id: string
  name?: string
  defaultVoiceId?: string
  color?: string
}

export interface SpeakerUpdateResponse {
  speaker: Speaker
}

// ============================================
// TTS IPC Types
// ============================================

export interface TTSVoice {
  id: string
  provider: 'elevenlabs'
  providerId: string
  name: string
  description?: string
  previewUrl?: string
  labels: Record<string, string>
}

export interface TTSGenerateRequest {
  segmentId: string
  text: string
  voiceId: string
  options?: {
    stability?: number
    similarityBoost?: number
    speed?: number
  }
}

export interface TTSGenerateResponse {
  segmentId: string
  audioPath: string
  durationMs: number
}

export interface TTSGenerateBatchRequest {
  items: Array<{
    segmentId: string
    text: string
    voiceId: string
  }>
}

export interface TTSGenerateBatchProgress {
  completed: number
  total: number
  currentSegmentId: string
  status: 'generating' | 'complete' | 'error'
  error?: string
}

export interface TTSGetVoicesResponse {
  voices: TTSVoice[]
}

// ============================================
// Transcription IPC Types
// ============================================

export interface TranscriptionStartRequest {
  projectId: string
  audioPath: string
  language?: string
}

export interface TranscriptionProgress {
  projectId: string
  progress: number
  stage: 'uploading' | 'processing' | 'complete'
}

export interface TranscriptionResult {
  projectId: string
  segments: Array<{
    speaker: string
    text: string
    startTimeMs: number
    endTimeMs: number
  }>
}

// ============================================
// Translation IPC Types
// ============================================

export interface TranslationRequest {
  text: string
  sourceLanguage: string
  targetLanguage: string
  context?: string
  speakerInfo?: string
  maxCharacters?: number
}

export interface TranslationResponse {
  originalText: string
  translatedText: string
}

export interface TranslationBatchRequest {
  segments: Array<{
    id: string
    text: string
    speaker?: string
  }>
  sourceLanguage: string
  targetLanguage: string
  context?: string
}

export interface TranslationBatchProgress {
  completed: number
  total: number
}

export interface TranslationBatchResponse {
  translations: Map<string, string>
}

// ============================================
// FFmpeg IPC Types
// ============================================

export interface FFmpegProbeRequest {
  filePath: string
}

export interface FFmpegProbeResponse {
  format: string
  duration: number
  bitrate: number
  size: number
  video?: {
    codec: string
    width: number
    height: number
    fps: number
    bitrate: number
  }
  audio?: {
    codec: string
    sampleRate: number
    channels: number
    bitrate: number
  }
}

export interface FFmpegExtractAudioRequest {
  videoPath: string
  outputPath: string
  format?: 'wav' | 'mp3'
  sampleRate?: number
}

export interface FFmpegExtractAudioProgress {
  percent: number
}

export interface FFmpegExportRequest {
  projectId: string
  outputPath: string
  options: {
    format: 'mp4' | 'mov' | 'mkv'
    quality: 'low' | 'medium' | 'high'
    includeOriginalAudio: boolean
    originalAudioDuckDb: number
  }
}

export interface FFmpegExportProgress {
  projectId: string
  stage: 'preparing' | 'mixing' | 'encoding' | 'finalizing'
  progress: number
}

// ============================================
// File System IPC Types
// ============================================

export interface FileDialogOptions {
  title?: string
  defaultPath?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
}

export interface OpenFileDialogResponse {
  canceled: boolean
  filePath?: string
  filePaths?: string[]
}

export interface SaveFileDialogResponse {
  canceled: boolean
  filePath?: string
}

export interface ReadCSVResponse {
  data: Array<Record<string, string>>
  headers: string[]
  rowCount: number
}

// ============================================
// Settings IPC Types
// ============================================

export interface SettingsGetRequest {
  key: string
}

export interface SettingsGetResponse {
  value: string | null
}

export interface SettingsSetRequest {
  key: string
  value: string
}

export interface SettingsGetAllResponse {
  settings: Record<string, string>
}

export interface SettingsSetBulkRequest {
  settings: Record<string, string>
}

// ============================================
// History IPC Types
// ============================================

export interface HistoryEntry {
  id: number
  projectId: string
  actionType: string
  timestamp: string
}

export interface HistoryUndoResponse {
  success: boolean
  restoredState?: unknown
}

export interface HistoryRedoResponse {
  success: boolean
  restoredState?: unknown
}

export interface HistoryGetStackResponse {
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
}

// ============================================
// Generic Response Types
// ============================================

export interface IPCSuccessResponse {
  success: true
}

export interface IPCErrorResponse {
  success: false
  error: string
  code?: string
}

export type IPCResponse<T> = (T & { success: true }) | IPCErrorResponse
