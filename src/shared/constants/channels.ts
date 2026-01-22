/**
 * IPC Channel Constants
 * Defines all IPC channel names used for communication between main and renderer
 */

export const IPC_CHANNELS = {
  // Project operations
  PROJECT: {
    CREATE: 'project:create',
    OPEN: 'project:open',
    SAVE: 'project:save',
    CLOSE: 'project:close',
    LIST_RECENT: 'project:list-recent',
    DELETE: 'project:delete',
    GET_CURRENT: 'project:get-current',
    UPDATE: 'project:update'
  },

  // Segment operations
  SEGMENT: {
    GET_ALL: 'segment:get-all',
    GET_BY_ID: 'segment:get-by-id',
    CREATE: 'segment:create',
    UPDATE: 'segment:update',
    DELETE: 'segment:delete',
    BATCH_UPDATE: 'segment:batch-update',
    SPLIT: 'segment:split',
    MERGE: 'segment:merge',
    REORDER: 'segment:reorder'
  },

  // Speaker operations
  SPEAKER: {
    GET_ALL: 'speaker:get-all',
    CREATE: 'speaker:create',
    UPDATE: 'speaker:update',
    DELETE: 'speaker:delete'
  },

  // TTS operations
  TTS: {
    GENERATE: 'tts:generate',
    GENERATE_SINGLE: 'tts:generate-single',
    GENERATE_BATCH: 'tts:generate-batch',
    GENERATE_BATCH_PROGRESS: 'tts:generate-batch-progress',
    GET_VOICES: 'tts:get-voices',
    PREVIEW_VOICE: 'tts:preview-voice',
    CANCEL: 'tts:cancel'
  },

  // Transcription operations
  TRANSCRIPTION: {
    START: 'transcription:start',
    PROGRESS: 'transcription:progress',
    COMPLETE: 'transcription:complete',
    CANCEL: 'transcription:cancel'
  },

  // Translation operations
  TRANSLATION: {
    TRANSLATE: 'translation:translate',
    TRANSLATE_BATCH: 'translation:translate-batch',
    TRANSLATE_BATCH_PROGRESS: 'translation:translate-batch-progress'
  },

  // FFmpeg operations
  FFMPEG: {
    PROBE: 'ffmpeg:probe',
    EXTRACT_AUDIO: 'ffmpeg:extract-audio',
    EXTRACT_AUDIO_PROGRESS: 'ffmpeg:extract-audio-progress',
    EXTRACT_WAVEFORM: 'ffmpeg:extract-waveform',
    EXPORT: 'ffmpeg:export',
    EXPORT_AUDIO: 'ffmpeg:export-audio',
    EXPORT_PROGRESS: 'ffmpeg:export-progress',
    CANCEL: 'ffmpeg:cancel',
    MIX_AUDIO: 'ffmpeg:mix-audio'
  },

  // File system operations
  FILESYSTEM: {
    OPEN_VIDEO_DIALOG: 'fs:open-video-dialog',
    OPEN_AUDIO_DIALOG: 'fs:open-audio-dialog',
    OPEN_CSV_DIALOG: 'fs:open-csv-dialog',
    SAVE_DIALOG: 'fs:save-dialog',
    READ_CSV: 'fs:read-csv',
    WRITE_FILE: 'fs:write-file',
    GET_APP_PATH: 'fs:get-app-path',
    GET_TEMP_DIR: 'fs:get-temp-dir',
    EXISTS: 'fs:exists',
    MKDIR: 'fs:mkdir',
    DELETE_FILE: 'fs:delete-file',
    GET_MEDIA_METADATA: 'fs:get-media-metadata',
    EXTRACT_AUDIO: 'fs:extract-audio',
    GENERATE_THUMBNAIL: 'fs:generate-thumbnail'
  },

  // Settings operations
  SETTINGS: {
    GET: 'settings:get',
    GET_ALL: 'settings:get-all',
    SET: 'settings:set',
    SET_BULK: 'settings:set-bulk',
    GET_API_KEY: 'settings:get-api-key',
    SET_API_KEY: 'settings:set-api-key',
    DELETE_API_KEY: 'settings:delete-api-key',
    VALIDATE_API_KEY: 'settings:validate-api-key',
    GET_API_KEY_STATUS: 'settings:get-api-key-status',
    GET_ELEVENLABS_REGION: 'settings:get-elevenlabs-region',
    SET_ELEVENLABS_REGION: 'settings:set-elevenlabs-region'
  },

  // History operations (undo/redo)
  HISTORY: {
    UNDO: 'history:undo',
    REDO: 'history:redo',
    GET_STACK: 'history:get-stack',
    CLEAR: 'history:clear',
    RECORD: 'history:record'
  },

  // App events (main -> renderer)
  APP: {
    READY: 'app:ready',
    ERROR: 'app:error',
    UPDATE_AVAILABLE: 'app:update-available',
    WINDOW_FOCUS: 'app:window-focus',
    WINDOW_BLUR: 'app:window-blur',
    BEFORE_QUIT: 'app:before-quit'
  }
} as const

// Type helper for channel names
export type IPCChannel = typeof IPC_CHANNELS
export type ProjectChannel = (typeof IPC_CHANNELS.PROJECT)[keyof typeof IPC_CHANNELS.PROJECT]
export type SegmentChannel = (typeof IPC_CHANNELS.SEGMENT)[keyof typeof IPC_CHANNELS.SEGMENT]
export type TTSChannel = (typeof IPC_CHANNELS.TTS)[keyof typeof IPC_CHANNELS.TTS]
export type FFmpegChannel = (typeof IPC_CHANNELS.FFMPEG)[keyof typeof IPC_CHANNELS.FFMPEG]
