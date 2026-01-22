/**
 * Default Values and Constants
 */

// ============================================
// Application
// ============================================

export const APP_NAME = 'DubDesk'
export const APP_VERSION = '1.0.0'

// ============================================
// Supported Languages
// ============================================

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turkish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' }
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

// ============================================
// Video Formats
// ============================================

export const SUPPORTED_VIDEO_FORMATS = [
  { extension: 'mp4', mimeType: 'video/mp4', name: 'MP4' },
  { extension: 'mov', mimeType: 'video/quicktime', name: 'QuickTime' },
  { extension: 'mkv', mimeType: 'video/x-matroska', name: 'Matroska' },
  { extension: 'webm', mimeType: 'video/webm', name: 'WebM' },
  { extension: 'avi', mimeType: 'video/x-msvideo', name: 'AVI' }
] as const

export const VIDEO_FILE_EXTENSIONS = SUPPORTED_VIDEO_FORMATS.map((f) => f.extension)

// ============================================
// Audio Formats
// ============================================

export const SUPPORTED_AUDIO_FORMATS = [
  { extension: 'wav', mimeType: 'audio/wav', name: 'WAV' },
  { extension: 'mp3', mimeType: 'audio/mpeg', name: 'MP3' },
  { extension: 'aac', mimeType: 'audio/aac', name: 'AAC' },
  { extension: 'ogg', mimeType: 'audio/ogg', name: 'OGG' },
  { extension: 'flac', mimeType: 'audio/flac', name: 'FLAC' }
] as const

// ============================================
// Timeline Defaults
// ============================================

export const TIMELINE_DEFAULTS = {
  MIN_ZOOM: 0.01, // Allow zooming out to see entire long videos
  MAX_ZOOM: 10,
  DEFAULT_ZOOM: 1,
  PIXELS_PER_SECOND: 100, // base pixels per second at zoom 1
  DEFAULT_GRID_SIZE_MS: 100,
  TRACK_HEIGHT: 60, // pixels
  RULER_HEIGHT: 28, // pixels
  MIN_SEGMENT_WIDTH: 20, // pixels
  SNAP_THRESHOLD_PX: 8, // pixels for snapping
  SNAP_THRESHOLD_MS: 50, // milliseconds for time snapping
  WAVEFORM_SAMPLES_PER_SECOND: 100
} as const

// ============================================
// Playback Defaults
// ============================================

export const PLAYBACK_DEFAULTS = {
  DEFAULT_VOLUME: 0.8,
  DEFAULT_ORIGINAL_VOLUME: 0.3,
  DEFAULT_DUBBED_VOLUME: 1.0,
  MIN_PLAYBACK_RATE: 0.25,
  MAX_PLAYBACK_RATE: 2.0,
  PLAYBACK_RATES: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
  SEEK_STEP_MS: 100, // for arrow key stepping
  FRAME_STEP_MS: 33 // ~30fps
} as const

// ============================================
// TTS Defaults
// ============================================

export const TTS_DEFAULTS = {
  STABILITY: 0.5,
  SIMILARITY_BOOST: 0.75,
  STYLE: 0.0,
  SPEAKER_BOOST: true,
  OUTPUT_FORMAT: 'mp3_44100_128' as const
} as const

// ============================================
// Export Settings
// ============================================

export const EXPORT_DEFAULTS = {
  FORMAT: 'mp4' as const,
  QUALITY: 'high' as const,
  INCLUDE_ORIGINAL_AUDIO: true,
  ORIGINAL_AUDIO_DUCK_DB: -12
} as const

export const EXPORT_QUALITY_PRESETS = {
  low: { videoBitrate: '2M', audioBitrate: '128k', crf: 28 },
  medium: { videoBitrate: '5M', audioBitrate: '192k', crf: 23 },
  high: { videoBitrate: '10M', audioBitrate: '256k', crf: 18 }
} as const

// ============================================
// Auto-save
// ============================================

export const AUTOSAVE_INTERVAL_MS = 30000 // 30 seconds

// ============================================
// History (Undo/Redo)
// ============================================

export const HISTORY_MAX_SIZE = 100 // Maximum undo/redo entries

// ============================================
// CSV Import
// ============================================

export const CSV_REQUIRED_COLUMNS = ['text', 'start_time', 'end_time'] as const
export const CSV_OPTIONAL_COLUMNS = ['speaker', 'original_text', 'voice_id'] as const
export const CSV_TIME_FORMATS = ['ms', 'seconds', 'timecode'] as const // timecode = HH:MM:SS.mmm

// ============================================
// Keyboard Shortcuts
// ============================================

export const KEYBOARD_SHORTCUTS = {
  // Playback
  PLAY_PAUSE: 'Space',
  REWIND: 'j',
  PAUSE: 'k',
  FORWARD: 'l',
  STEP_BACK: 'ArrowLeft',
  STEP_FORWARD: 'ArrowRight',
  GO_TO_START: 'Home',
  GO_TO_END: 'End',

  // Editing
  UNDO: 'mod+z',
  REDO: 'mod+shift+z',
  DELETE: 'Delete',
  SELECT_ALL: 'mod+a',
  DESELECT: 'Escape',
  DUPLICATE: 'mod+d',
  SPLIT: 's',
  MERGE: 'm',
  REGENERATE: 'r',

  // View
  ZOOM_IN: 'mod+=',
  ZOOM_OUT: 'mod+-',
  ZOOM_FIT: 'mod+0',

  // File
  SAVE: 'mod+s',
  EXPORT: 'mod+e',
  SETTINGS: 'mod+,'
} as const

// Helper to get platform-specific modifier key
export function getModifierKey(): 'Cmd' | 'Ctrl' {
  return typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'
}

export function formatShortcut(shortcut: string): string {
  const mod = getModifierKey()
  return shortcut.replace('mod', mod)
}
