# DubDesk Implementation Plan

## Executive Summary

This document provides a comprehensive, gap-free implementation blueprint for DubDesk - an open-source Electron desktop application for AI-powered video dubbing with timeline-based editing.

**Key Technical Decisions:**

- **Testing:** Vitest (unit) + Playwright (e2e)
- **TTS Provider:** ElevenLabs only (MVP)
- **Translation:** Anthropic Claude API
- **FFmpeg:** Bundled via ffmpeg-static
- **Timeline:** WaveSurfer.js + Custom Canvas
- **State:** Zustand
- **Database:** SQLite via better-sqlite3
- **API Key Storage:** OS System Keychain (Keychain/Credential Manager/libsecret)
- **UI Design:** Custom minimal with Tailwind CSS

---

## 1. Project Architecture

### 1.1 Directory Structure

```
src/
├── main/                          # Electron Main Process
│   ├── index.ts                   # App entry, window management
│   ├── ipc/                       # IPC handlers
│   │   ├── index.ts               # Register all handlers
│   │   ├── project.ipc.ts         # Project CRUD operations
│   │   ├── ffmpeg.ipc.ts          # Video/audio processing
│   │   ├── tts.ipc.ts             # ElevenLabs TTS calls
│   │   ├── transcription.ipc.ts   # Speech-to-text
│   │   ├── translation.ipc.ts     # LLM translation
│   │   ├── filesystem.ipc.ts      # File dialogs, read/write
│   │   └── settings.ipc.ts        # App settings
│   ├── services/                  # Main process services
│   │   ├── database/
│   │   │   ├── index.ts           # SQLite connection
│   │   │   ├── migrations/        # Schema migrations
│   │   │   ├── repositories/      # Data access layer
│   │   │   │   ├── project.repo.ts
│   │   │   │   ├── segment.repo.ts
│   │   │   │   ├── voice.repo.ts
│   │   │   │   └── settings.repo.ts
│   │   │   └── schema.sql         # Full schema definition
│   │   ├── ffmpeg/
│   │   │   ├── index.ts           # FFmpeg service
│   │   │   ├── extract.ts         # Audio extraction
│   │   │   ├── encode.ts          # Video encoding
│   │   │   └── utils.ts           # Probe, format conversion
│   │   ├── tts/
│   │   │   ├── index.ts           # TTS service interface
│   │   │   ├── elevenlabs.ts      # ElevenLabs adapter
│   │   │   └── types.ts           # TTS types
│   │   ├── transcription/
│   │   │   ├── index.ts           # Transcription service
│   │   │   └── elevenlabs-stt.ts  # ElevenLabs STT
│   │   ├── translation/
│   │   │   ├── index.ts           # Translation service
│   │   │   └── anthropic.ts       # Claude adapter
│   │   ├── keychain/
│   │   │   └── index.ts           # Secure API key storage
│   │   └── project/
│   │       ├── index.ts           # Project management
│   │       ├── import.ts          # CSV/video import
│   │       └── export.ts          # Export handlers
│   └── utils/
│       ├── paths.ts               # App paths, temp dirs
│       ├── logger.ts              # Logging utility
│       └── errors.ts              # Error types
│
├── preload/                       # Context Bridge
│   ├── index.ts                   # Expose APIs to renderer
│   ├── index.d.ts                 # Type definitions
│   └── api/                       # API definitions
│       ├── project.api.ts
│       ├── ffmpeg.api.ts
│       ├── tts.api.ts
│       ├── transcription.api.ts
│       ├── translation.api.ts
│       ├── filesystem.api.ts
│       └── settings.api.ts
│
├── renderer/                      # React Frontend
│   └── src/
│       ├── main.tsx               # React entry
│       ├── App.tsx                # Root component, routing
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx           # Main layout wrapper
│       │   │   ├── TopBar.tsx             # Project name, save, export
│       │   │   ├── LeftPanel.tsx          # Segment list panel
│       │   │   ├── RightPanel.tsx         # Voice/TTS settings
│       │   │   └── StatusBar.tsx          # Bottom status
│       │   ├── video/
│       │   │   ├── VideoPlayer.tsx        # HTML5 video with controls
│       │   │   ├── VideoControls.tsx      # Play/pause, seek
│       │   │   └── VideoPreview.tsx       # Container with aspect ratio
│       │   ├── timeline/
│       │   │   ├── Timeline.tsx           # Main timeline container
│       │   │   ├── TimelineCanvas.tsx     # Canvas rendering layer
│       │   │   ├── TimelineRuler.tsx      # Time ruler with markers
│       │   │   ├── WaveformTrack.tsx      # WaveSurfer integration
│       │   │   ├── SegmentTrack.tsx       # Dubbed segment blocks
│       │   │   ├── Segment.tsx            # Individual segment block
│       │   │   ├── Playhead.tsx           # Current time indicator
│       │   │   ├── ZoomControls.tsx       # Zoom in/out
│       │   │   └── TimelineContext.tsx    # Timeline state context
│       │   ├── segments/
│       │   │   ├── SegmentList.tsx        # Scrollable segment list
│       │   │   ├── SegmentItem.tsx        # Individual list item
│       │   │   ├── SegmentEditor.tsx      # Text editing modal
│       │   │   ├── SegmentProperties.tsx  # Properties panel
│       │   │   └── BatchActions.tsx       # Multi-select actions
│       │   ├── voices/
│       │   │   ├── VoiceLibrary.tsx       # Available voices
│       │   │   ├── VoiceCard.tsx          # Voice preview card
│       │   │   ├── VoiceSelector.tsx      # Dropdown selector
│       │   │   └── SpeakerAssignment.tsx  # Map speakers to voices
│       │   ├── import/
│       │   │   ├── ImportWizard.tsx       # Step-by-step import
│       │   │   ├── VideoImportStep.tsx    # Video file selection
│       │   │   ├── CSVImportStep.tsx      # CSV file + validation
│       │   │   ├── TranscriptionStep.tsx  # Automatic transcription
│       │   │   ├── TranslationStep.tsx    # Translation options
│       │   │   └── GenerationStep.tsx     # Initial TTS generation
│       │   ├── export/
│       │   │   ├── ExportDialog.tsx       # Export options modal
│       │   │   ├── ExportProgress.tsx     # Progress indicator
│       │   │   └── ExportSettings.tsx     # Format, quality options
│       │   ├── settings/
│       │   │   ├── SettingsDialog.tsx     # Settings modal
│       │   │   ├── APIKeysSection.tsx     # API key management
│       │   │   ├── GeneralSection.tsx     # General preferences
│       │   │   └── KeyboardSection.tsx    # Keyboard shortcuts
│       │   ├── common/
│       │   │   ├── Button.tsx
│       │   │   ├── Input.tsx
│       │   │   ├── Select.tsx
│       │   │   ├── Slider.tsx
│       │   │   ├── Modal.tsx
│       │   │   ├── Tooltip.tsx
│       │   │   ├── ContextMenu.tsx
│       │   │   ├── LoadingSpinner.tsx
│       │   │   ├── ErrorBoundary.tsx
│       │   │   └── Toast.tsx
│       │   └── welcome/
│       │       ├── WelcomeScreen.tsx      # Initial screen
│       │       ├── RecentProjects.tsx     # Recent project list
│       │       └── NewProjectCard.tsx     # Create new project
│       ├── hooks/
│       │   ├── useProject.ts              # Project operations
│       │   ├── useSegments.ts             # Segment CRUD
│       │   ├── useTimeline.ts             # Timeline state
│       │   ├── usePlayback.ts             # Audio/video sync
│       │   ├── useKeyboardShortcuts.ts    # Keyboard handling
│       │   ├── useUndoRedo.ts             # History management
│       │   ├── useAutosave.ts             # Auto-save logic
│       │   └── useWaveSurfer.ts           # WaveSurfer instance
│       ├── stores/
│       │   ├── index.ts                   # Store exports
│       │   ├── projectStore.ts            # Project state
│       │   ├── segmentStore.ts            # Segments state
│       │   ├── timelineStore.ts           # Timeline UI state
│       │   ├── playbackStore.ts           # Playback state
│       │   ├── uiStore.ts                 # UI state (panels, modals)
│       │   └── settingsStore.ts           # App settings
│       ├── services/
│       │   ├── ipc.ts                     # IPC wrapper
│       │   └── audio/
│       │       ├── AudioEngine.ts         # Tone.js audio engine
│       │       ├── AudioScheduler.ts      # Multi-track scheduling
│       │       └── AudioCache.ts          # Audio buffer cache
│       ├── utils/
│       │   ├── time.ts                    # Time formatting
│       │   ├── validation.ts              # Input validation
│       │   ├── csv.ts                     # CSV parsing
│       │   └── constants.ts               # App constants
│       ├── types/
│       │   ├── project.ts                 # Project types
│       │   ├── segment.ts                 # Segment types
│       │   ├── voice.ts                   # Voice types
│       │   ├── timeline.ts                # Timeline types
│       │   └── api.ts                     # API response types
│       └── styles/
│           ├── globals.css                # Global styles
│           ├── variables.css              # CSS variables
│           └── components/                # Component styles
│
├── shared/                        # Shared between main/renderer
│   ├── types/
│   │   ├── ipc.ts                 # IPC message types
│   │   ├── project.ts             # Shared project types
│   │   └── segment.ts             # Shared segment types
│   └── constants/
│       ├── channels.ts            # IPC channel names
│       └── defaults.ts            # Default values
│
└── tests/
    ├── unit/                      # Vitest unit tests
    │   ├── main/
    │   │   ├── services/
    │   │   └── utils/
    │   └── renderer/
    │       ├── components/
    │       ├── hooks/
    │       ├── stores/
    │       └── utils/
    ├── e2e/                       # Playwright e2e tests
    │   ├── fixtures/              # Test data files
    │   ├── project.spec.ts
    │   ├── import.spec.ts
    │   ├── timeline.spec.ts
    │   ├── export.spec.ts
    │   └── playwright.config.ts
    └── mocks/                     # Shared mocks
        ├── ffmpeg.mock.ts
        ├── elevenlabs.mock.ts
        └── database.mock.ts
```

### 1.2 Package Dependencies to Add

```json
{
  "dependencies": {
    "zustand": "^4.5.0",
    "tone": "^14.9.0",
    "wavesurfer.js": "^7.8.0",
    "better-sqlite3": "^11.0.0",
    "fluent-ffmpeg": "^2.1.3",
    "ffmpeg-static": "^5.2.0",
    "ffprobe-static": "^3.1.0",
    "uuid": "^9.0.0",
    "zod": "^3.23.0",
    "date-fns": "^3.6.0",
    "papaparse": "^5.4.0",
    "immer": "^10.0.0",
    "lodash-es": "^4.17.21",
    "@tanstack/react-virtual": "^3.5.0",
    "keytar": "^7.9.0",
    "@anthropic-ai/sdk": "^0.24.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "@vitest/ui": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0",
    "@playwright/test": "^1.44.0",
    "electron-playwright-helpers": "^1.7.0",
    "@testing-library/react": "^15.0.0",
    "@testing-library/user-event": "^14.5.0",
    "msw": "^2.3.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/fluent-ffmpeg": "^2.1.0",
    "@types/papaparse": "^5.3.0",
    "@types/lodash-es": "^4.17.0"
  }
}
```

### 1.3 Tailwind CSS Configuration

```javascript
// tailwind.config.js

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a'
        },
        // Timeline colors
        timeline: {
          background: '#1a1a1a',
          track: '#2d2d2d',
          segment: '#3b82f6',
          segmentSelected: '#60a5fa',
          segmentError: '#ef4444',
          segmentGenerating: '#f59e0b',
          waveform: '#4ade80',
          playhead: '#ef4444',
          ruler: '#6b7280'
        },
        // App chrome colors
        chrome: {
          bg: '#0f0f0f',
          sidebar: '#1a1a1a',
          panel: '#242424',
          border: '#333333'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace']
      },
      spacing: {
        'timeline-track': '60px',
        'timeline-ruler': '24px',
        'panel-width': '280px'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'segment-loading': 'segment-loading 1.5s ease-in-out infinite'
      },
      keyframes: {
        'segment-loading': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' }
        }
      }
    }
  },
  plugins: []
}
```

```css
/* src/renderer/src/styles/globals.css */

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --playhead-color: #ef4444;
    --selection-color: rgba(59, 130, 246, 0.3);
    --snap-guide-color: #22c55e;
  }

  * {
    @apply border-chrome-border;
  }

  body {
    @apply bg-chrome-bg text-gray-100 font-sans antialiased;
    overflow: hidden; /* Prevent body scroll in Electron */
  }

  /* Custom scrollbar for dark theme */
  ::-webkit-scrollbar {
    @apply w-2 h-2;
  }

  ::-webkit-scrollbar-track {
    @apply bg-chrome-bg;
  }

  ::-webkit-scrollbar-thumb {
    @apply bg-gray-600 rounded-full hover:bg-gray-500;
  }
}

@layer components {
  /* Panel styles */
  .panel {
    @apply bg-chrome-panel border border-chrome-border rounded-lg;
  }

  /* Button variants */
  .btn-primary {
    @apply bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-md
           font-medium transition-colors focus:outline-none focus:ring-2
           focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-chrome-bg;
  }

  .btn-secondary {
    @apply bg-chrome-panel hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-md
           font-medium border border-chrome-border transition-colors;
  }

  .btn-danger {
    @apply bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md
           font-medium transition-colors;
  }

  /* Input styles */
  .input {
    @apply bg-chrome-bg border border-chrome-border rounded-md px-3 py-2
           text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2
           focus:ring-primary-500 focus:border-transparent;
  }

  /* Timeline segment styles */
  .segment {
    @apply absolute rounded cursor-pointer transition-all duration-75;
  }

  .segment:hover {
    @apply ring-2 ring-white ring-opacity-50;
  }

  .segment-selected {
    @apply ring-2 ring-primary-400;
  }

  .segment-generating {
    @apply animate-segment-loading;
  }
}

@layer utilities {
  /* Timeline utilities */
  .timeline-grid {
    background-image: repeating-linear-gradient(
      90deg,
      transparent,
      transparent calc(var(--grid-size) - 1px),
      rgba(255, 255, 255, 0.05) calc(var(--grid-size) - 1px),
      rgba(255, 255, 255, 0.05) var(--grid-size)
    );
  }

  /* Drag handle cursor */
  .cursor-ew-resize {
    cursor: ew-resize;
  }

  /* No select for draggable elements */
  .no-select {
    user-select: none;
    -webkit-user-select: none;
  }
}
```

---

## 2. Database Schema (SQLite)

### 2.1 Complete Schema Definition

```sql
-- Projects table
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    source_video_path TEXT NOT NULL,
    source_video_duration_ms INTEGER NOT NULL,
    source_video_width INTEGER,
    source_video_height INTEGER,
    source_video_fps REAL,
    source_audio_path TEXT,
    target_language TEXT NOT NULL DEFAULT 'en',
    source_language TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    settings TEXT -- JSON blob for project-specific settings
);

-- Segments table
CREATE TABLE segments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    speaker_id TEXT,
    original_text TEXT,
    translated_text TEXT NOT NULL,
    start_time_ms INTEGER NOT NULL,
    end_time_ms INTEGER NOT NULL,
    original_start_time_ms INTEGER NOT NULL,
    original_end_time_ms INTEGER NOT NULL,
    audio_file_path TEXT,
    audio_duration_ms INTEGER,
    voice_id TEXT REFERENCES voices(id),
    speed_adjustment REAL DEFAULT 1.0,
    pitch_adjustment REAL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'pending',
    -- status: pending, generating, ready, error
    generation_error TEXT,
    order_index INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Speakers table (for diarization)
CREATE TABLE speakers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    default_voice_id TEXT REFERENCES voices(id),
    color TEXT -- Hex color for timeline visualization
);

-- Voices table (cached voice metadata)
CREATE TABLE voices (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL, -- 'elevenlabs'
    provider_voice_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    preview_url TEXT,
    labels TEXT, -- JSON array of labels
    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- History table (for undo/redo)
CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    -- action_type: segment_create, segment_update, segment_delete,
    --              segment_move, segment_split, segment_merge, batch_update
    before_state TEXT NOT NULL, -- JSON snapshot
    after_state TEXT NOT NULL,  -- JSON snapshot
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Settings table (app-wide settings)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX idx_segments_project ON segments(project_id);
CREATE INDEX idx_segments_time ON segments(project_id, start_time_ms);
CREATE INDEX idx_speakers_project ON speakers(project_id);
CREATE INDEX idx_history_project ON history(project_id);
CREATE INDEX idx_history_timestamp ON history(project_id, timestamp DESC);
```

### 2.2 Default Settings

```typescript
const DEFAULT_SETTINGS = {
  // API Keys (encrypted at rest)
  'api.elevenlabs.key': '',
  'api.openai.key': '',
  'api.anthropic.key': '',

  // General
  'general.autosave_interval_ms': 30000,
  'general.default_language': 'en',
  'general.theme': 'dark',

  // Timeline
  'timeline.default_zoom': 1.0,
  'timeline.snap_to_grid': true,
  'timeline.grid_size_ms': 100,
  'timeline.waveform_color': '#4CAF50',
  'timeline.segment_color': '#2196F3',

  // Playback
  'playback.default_volume': 0.8,
  'playback.original_audio_volume': 0.3,

  // Export
  'export.default_format': 'mp4',
  'export.default_quality': 'high',
  'export.include_original_audio': true,
  'export.original_audio_duck_db': -12,

  // TTS
  'tts.default_voice_id': '',
  'tts.default_stability': 0.5,
  'tts.default_similarity_boost': 0.75
}
```

---

## 3. IPC Communication Architecture

### 3.1 Channel Definitions

```typescript
// src/shared/constants/channels.ts

export const IPC_CHANNELS = {
  // Project operations
  PROJECT: {
    CREATE: 'project:create',
    OPEN: 'project:open',
    SAVE: 'project:save',
    CLOSE: 'project:close',
    LIST_RECENT: 'project:list-recent',
    DELETE: 'project:delete',
    GET_CURRENT: 'project:get-current'
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

  // TTS operations
  TTS: {
    GENERATE: 'tts:generate',
    GENERATE_BATCH: 'tts:generate-batch',
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
    TRANSLATE_BATCH: 'translation:translate-batch'
  },

  // FFmpeg operations
  FFMPEG: {
    EXTRACT_AUDIO: 'ffmpeg:extract-audio',
    EXTRACT_WAVEFORM: 'ffmpeg:extract-waveform',
    PROBE: 'ffmpeg:probe',
    EXPORT: 'ffmpeg:export',
    EXPORT_PROGRESS: 'ffmpeg:export-progress',
    CANCEL: 'ffmpeg:cancel'
  },

  // File system operations
  FILESYSTEM: {
    OPEN_VIDEO_DIALOG: 'fs:open-video-dialog',
    OPEN_CSV_DIALOG: 'fs:open-csv-dialog',
    SAVE_DIALOG: 'fs:save-dialog',
    READ_CSV: 'fs:read-csv',
    WRITE_FILE: 'fs:write-file',
    GET_APP_PATH: 'fs:get-app-path'
  },

  // Settings operations
  SETTINGS: {
    GET: 'settings:get',
    GET_ALL: 'settings:get-all',
    SET: 'settings:set',
    SET_BULK: 'settings:set-bulk'
  },

  // History operations
  HISTORY: {
    UNDO: 'history:undo',
    REDO: 'history:redo',
    GET_STACK: 'history:get-stack',
    CLEAR: 'history:clear'
  },

  // App events (main -> renderer)
  APP: {
    READY: 'app:ready',
    ERROR: 'app:error',
    UPDATE_AVAILABLE: 'app:update-available'
  }
} as const
```

### 3.2 IPC Type Definitions

```typescript
// src/shared/types/ipc.ts

import { Project, Segment, Voice, Speaker } from './project'

// Request/Response types for each channel

export interface ProjectCreateRequest {
  name: string
  videoPath: string
  importMode: 'automatic' | 'csv'
  csvPath?: string
  targetLanguage: string
  sourceLanguage?: string
}

export interface ProjectCreateResponse {
  project: Project
}

export interface SegmentUpdateRequest {
  id: string
  updates: Partial<Omit<Segment, 'id' | 'projectId'>>
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

export interface TranscriptionStartRequest {
  projectId: string
  audioPath: string
}

export interface TranscriptionProgressEvent {
  projectId: string
  progress: number // 0-100
  currentSegment?: number
  totalSegments?: number
}

export interface TranscriptionCompleteEvent {
  projectId: string
  segments: Array<{
    speaker: string
    text: string
    startTimeMs: number
    endTimeMs: number
  }>
}

export interface ExportRequest {
  projectId: string
  outputPath: string
  options: {
    format: 'mp4' | 'mov' | 'mkv'
    quality: 'low' | 'medium' | 'high'
    includeOriginalAudio: boolean
    originalAudioDuckDb: number
  }
}

export interface ExportProgressEvent {
  projectId: string
  stage: 'preparing' | 'mixing' | 'encoding' | 'finalizing'
  progress: number // 0-100
}
```

---

## 4. State Management (Zustand)

### 4.1 Project Store

```typescript
// src/renderer/src/stores/projectStore.ts

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { Project } from '@/types/project'

interface ProjectState {
  // State
  currentProject: Project | null
  recentProjects: Project[]
  isLoading: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  lastSavedAt: Date | null

  // Actions
  setCurrentProject: (project: Project | null) => void
  updateProject: (updates: Partial<Project>) => void
  setRecentProjects: (projects: Project[]) => void
  setLoading: (loading: boolean) => void
  setSaving: (saving: boolean) => void
  markUnsavedChanges: () => void
  markSaved: () => void
  reset: () => void
}

export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    // Initial state
    currentProject: null,
    recentProjects: [],
    isLoading: false,
    isSaving: false,
    hasUnsavedChanges: false,
    lastSavedAt: null,

    // Actions
    setCurrentProject: (project) =>
      set((state) => {
        state.currentProject = project
        state.hasUnsavedChanges = false
      }),

    updateProject: (updates) =>
      set((state) => {
        if (state.currentProject) {
          Object.assign(state.currentProject, updates)
          state.hasUnsavedChanges = true
        }
      }),

    setRecentProjects: (projects) =>
      set((state) => {
        state.recentProjects = projects
      }),

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading
      }),

    setSaving: (saving) =>
      set((state) => {
        state.isSaving = saving
      }),

    markUnsavedChanges: () =>
      set((state) => {
        state.hasUnsavedChanges = true
      }),

    markSaved: () =>
      set((state) => {
        state.hasUnsavedChanges = false
        state.lastSavedAt = new Date()
      }),

    reset: () =>
      set((state) => {
        state.currentProject = null
        state.hasUnsavedChanges = false
        state.lastSavedAt = null
      })
  }))
)
```

### 4.2 Segment Store

```typescript
// src/renderer/src/stores/segmentStore.ts

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { Segment } from '@/types/segment'

interface SegmentState {
  // State
  segments: Segment[]
  selectedSegmentIds: Set<string>
  editingSegmentId: string | null
  isGenerating: Map<string, boolean>

  // Computed (via selectors)
  // Actions
  setSegments: (segments: Segment[]) => void
  addSegment: (segment: Segment) => void
  updateSegment: (id: string, updates: Partial<Segment>) => void
  removeSegment: (id: string) => void

  selectSegment: (id: string, multi?: boolean) => void
  deselectSegment: (id: string) => void
  clearSelection: () => void
  selectRange: (startId: string, endId: string) => void

  setEditingSegment: (id: string | null) => void
  setGenerating: (id: string, generating: boolean) => void

  moveSegment: (id: string, newStartTimeMs: number) => void
  trimSegment: (id: string, newStartMs: number, newEndMs: number) => void
  splitSegment: (id: string, splitTimeMs: number) => Segment[]
  mergeSegments: (ids: string[]) => Segment

  reset: () => void
}

export const useSegmentStore = create<SegmentState>()(
  immer((set, get) => ({
    segments: [],
    selectedSegmentIds: new Set(),
    editingSegmentId: null,
    isGenerating: new Map(),

    setSegments: (segments) =>
      set((state) => {
        state.segments = segments.sort((a, b) => a.startTimeMs - b.startTimeMs)
      }),

    addSegment: (segment) =>
      set((state) => {
        state.segments.push(segment)
        state.segments.sort((a, b) => a.startTimeMs - b.startTimeMs)
      }),

    updateSegment: (id, updates) =>
      set((state) => {
        const index = state.segments.findIndex((s) => s.id === id)
        if (index !== -1) {
          Object.assign(state.segments[index], updates)
        }
      }),

    removeSegment: (id) =>
      set((state) => {
        state.segments = state.segments.filter((s) => s.id !== id)
        state.selectedSegmentIds.delete(id)
      }),

    selectSegment: (id, multi = false) =>
      set((state) => {
        if (!multi) {
          state.selectedSegmentIds.clear()
        }
        state.selectedSegmentIds.add(id)
      }),

    deselectSegment: (id) =>
      set((state) => {
        state.selectedSegmentIds.delete(id)
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedSegmentIds.clear()
      }),

    selectRange: (startId, endId) =>
      set((state) => {
        const startIndex = state.segments.findIndex((s) => s.id === startId)
        const endIndex = state.segments.findIndex((s) => s.id === endId)
        if (startIndex !== -1 && endIndex !== -1) {
          const [minIndex, maxIndex] = [
            Math.min(startIndex, endIndex),
            Math.max(startIndex, endIndex)
          ]
          for (let i = minIndex; i <= maxIndex; i++) {
            state.selectedSegmentIds.add(state.segments[i].id)
          }
        }
      }),

    setEditingSegment: (id) =>
      set((state) => {
        state.editingSegmentId = id
      }),

    setGenerating: (id, generating) =>
      set((state) => {
        if (generating) {
          state.isGenerating.set(id, true)
        } else {
          state.isGenerating.delete(id)
        }
      }),

    moveSegment: (id, newStartTimeMs) =>
      set((state) => {
        const segment = state.segments.find((s) => s.id === id)
        if (segment) {
          const duration = segment.endTimeMs - segment.startTimeMs
          segment.startTimeMs = newStartTimeMs
          segment.endTimeMs = newStartTimeMs + duration
        }
      }),

    trimSegment: (id, newStartMs, newEndMs) =>
      set((state) => {
        const segment = state.segments.find((s) => s.id === id)
        if (segment) {
          segment.startTimeMs = newStartMs
          segment.endTimeMs = newEndMs
        }
      }),

    splitSegment: (id, splitTimeMs) => {
      const state = get()
      const segment = state.segments.find((s) => s.id === id)
      if (!segment) return []

      // Implementation returns two new segments
      // Actual split logic handled by IPC call
      return []
    },

    mergeSegments: (ids) => {
      // Implementation merges segments
      // Actual merge logic handled by IPC call
      return {} as Segment
    },

    reset: () =>
      set((state) => {
        state.segments = []
        state.selectedSegmentIds.clear()
        state.editingSegmentId = null
        state.isGenerating.clear()
      })
  }))
)

// Selectors
export const useSelectedSegments = () =>
  useSegmentStore((state) => state.segments.filter((s) => state.selectedSegmentIds.has(s.id)))

export const useSegmentById = (id: string) =>
  useSegmentStore((state) => state.segments.find((s) => s.id === id))

export const useSegmentsInRange = (startMs: number, endMs: number) =>
  useSegmentStore((state) =>
    state.segments.filter((s) => s.endTimeMs > startMs && s.startTimeMs < endMs)
  )
```

### 4.3 Timeline Store

```typescript
// src/renderer/src/stores/timelineStore.ts

import { create } from 'zustand'

interface TimelineState {
  // Viewport state
  zoom: number // pixels per second
  scrollPosition: number // pixels from left
  viewportWidth: number // pixels

  // Playback state
  currentTimeMs: number
  isPlaying: boolean
  playbackRate: number

  // Interaction state
  isDragging: boolean
  dragTarget: { type: 'segment' | 'edge'; id: string; edge?: 'start' | 'end' } | null
  isSelecting: boolean
  selectionBox: { startX: number; endX: number } | null

  // Grid & snapping
  snapToGrid: boolean
  gridSizeMs: number

  // Actions
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomToFit: (durationMs: number) => void

  setScrollPosition: (position: number) => void
  scrollToTime: (timeMs: number) => void

  setCurrentTime: (timeMs: number) => void
  setPlaying: (playing: boolean) => void
  setPlaybackRate: (rate: number) => void

  startDrag: (target: TimelineState['dragTarget']) => void
  endDrag: () => void

  startSelection: (x: number) => void
  updateSelection: (x: number) => void
  endSelection: () => void

  setSnapToGrid: (snap: boolean) => void
  setGridSize: (sizeMs: number) => void

  // Utilities
  pixelsToMs: (pixels: number) => number
  msToPixels: (ms: number) => number
  snapToGridValue: (ms: number) => number
}

const MIN_ZOOM = 10 // 10 pixels per second
const MAX_ZOOM = 500 // 500 pixels per second
const DEFAULT_ZOOM = 50 // 50 pixels per second

export const useTimelineStore = create<TimelineState>((set, get) => ({
  zoom: DEFAULT_ZOOM,
  scrollPosition: 0,
  viewportWidth: 0,

  currentTimeMs: 0,
  isPlaying: false,
  playbackRate: 1.0,

  isDragging: false,
  dragTarget: null,
  isSelecting: false,
  selectionBox: null,

  snapToGrid: true,
  gridSizeMs: 100,

  setZoom: (zoom) => set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),

  zoomIn: () => set((state) => ({ zoom: Math.min(MAX_ZOOM, state.zoom * 1.25) })),

  zoomOut: () => set((state) => ({ zoom: Math.max(MIN_ZOOM, state.zoom / 1.25) })),

  zoomToFit: (durationMs) =>
    set((state) => ({
      zoom: Math.max(MIN_ZOOM, (state.viewportWidth - 100) / (durationMs / 1000))
    })),

  setScrollPosition: (position) => set({ scrollPosition: Math.max(0, position) }),

  scrollToTime: (timeMs) =>
    set((state) => ({
      scrollPosition: Math.max(0, state.msToPixels(timeMs) - state.viewportWidth / 2)
    })),

  setCurrentTime: (timeMs) => set({ currentTimeMs: Math.max(0, timeMs) }),

  setPlaying: (playing) => set({ isPlaying: playing }),

  setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.25, Math.min(2.0, rate)) }),

  startDrag: (target) => set({ isDragging: true, dragTarget: target }),

  endDrag: () => set({ isDragging: false, dragTarget: null }),

  startSelection: (x) => set({ isSelecting: true, selectionBox: { startX: x, endX: x } }),

  updateSelection: (x) =>
    set((state) =>
      state.selectionBox ? { selectionBox: { ...state.selectionBox, endX: x } } : {}
    ),

  endSelection: () => set({ isSelecting: false, selectionBox: null }),

  setSnapToGrid: (snap) => set({ snapToGrid: snap }),

  setGridSize: (sizeMs) => set({ gridSizeMs: sizeMs }),

  pixelsToMs: (pixels) => {
    const { zoom } = get()
    return (pixels / zoom) * 1000
  },

  msToPixels: (ms) => {
    const { zoom } = get()
    return (ms / 1000) * zoom
  },

  snapToGridValue: (ms) => {
    const { snapToGrid, gridSizeMs } = get()
    if (!snapToGrid) return ms
    return Math.round(ms / gridSizeMs) * gridSizeMs
  }
}))
```

---

## 5. UI Component Specifications

### 5.1 Timeline Component (Core)

```typescript
// src/renderer/src/components/timeline/Timeline.tsx

/**
 * TIMELINE COMPONENT SPECIFICATION
 *
 * The Timeline is the central editing interface displaying:
 * 1. Time ruler at top with markers every second (zoomed) or minute (zoomed out)
 * 2. Original audio waveform track (WaveSurfer.js)
 * 3. Dubbed segment tracks (one per speaker, or combined)
 * 4. Playhead indicator synced with video
 *
 * INTERACTIONS:
 * - Mouse wheel: horizontal zoom
 * - Shift + wheel: vertical scroll (if multiple tracks)
 * - Click segment: select
 * - Ctrl/Cmd + click: multi-select
 * - Drag segment body: move in time
 * - Drag segment edges: trim
 * - Right-click: context menu
 * - Double-click: edit text
 * - Ctrl/Cmd + drag: duplicate
 * - Click empty area: seek playhead
 *
 * KEYBOARD SHORTCUTS (when timeline focused):
 * - Space: play/pause
 * - J: rewind
 * - K: pause
 * - L: forward
 * - Left/Right arrows: step frame (or 100ms)
 * - Home: go to start
 * - End: go to end
 * - Delete/Backspace: delete selected segments
 * - Ctrl/Cmd + Z: undo
 * - Ctrl/Cmd + Shift + Z: redo
 * - Ctrl/Cmd + A: select all
 * - Ctrl/Cmd + D: duplicate selected
 * - S: split at playhead
 * - M: merge selected
 */

interface TimelineProps {
  projectId: string
  videoDurationMs: number
  originalAudioPath: string
}

interface SegmentRenderData {
  id: string
  x: number // left position in pixels
  width: number // width in pixels
  y: number // top position (track offset)
  height: number // track height
  color: string // segment color
  label: string // text preview
  isSelected: boolean
  isGenerating: boolean
  hasError: boolean
}
```

### 5.2 Video Player Component

```typescript
// src/renderer/src/components/video/VideoPlayer.tsx

/**
 * VIDEO PLAYER SPECIFICATION
 *
 * HTML5 Video element with custom controls, synced with timeline.
 *
 * FEATURES:
 * - Play/Pause button
 * - Time display (current / total)
 * - Volume control with mute
 * - Playback rate selector (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
 * - Fullscreen toggle
 * - Frame step buttons (<< >>)
 *
 * SYNC BEHAVIOR:
 * - Video currentTime updates timeline playhead
 * - Timeline seek updates video currentTime
 * - Segment playback overlays dubbed audio on video
 * - Original audio can be ducked or muted during preview
 *
 * PERFORMANCE:
 * - Use requestAnimationFrame for smooth playhead updates
 * - Debounce seek events to avoid thrashing
 * - Preload audio segments for gapless playback
 */

interface VideoPlayerProps {
  videoPath: string
  onTimeUpdate: (timeMs: number) => void
  onPlay: () => void
  onPause: () => void
  onSeeked: (timeMs: number) => void
  currentTimeMs: number
  isPlaying: boolean
  playbackRate: number
  volume: number
  muted: boolean
}
```

### 5.3 Segment List Component

```typescript
// src/renderer/src/components/segments/SegmentList.tsx

/**
 * SEGMENT LIST SPECIFICATION
 *
 * Virtualized scrollable list of all segments with:
 * - Speaker indicator (colored badge)
 * - Original text (truncated)
 * - Translated text (truncated)
 * - Timing (start - end)
 * - Status indicator (pending, generating, ready, error)
 * - Voice assignment
 *
 * FEATURES:
 * - Search/filter by text
 * - Filter by speaker
 * - Filter by status
 * - Click to select and scroll timeline
 * - Double-click to edit
 * - Drag to reorder (optional)
 * - Bulk selection with checkboxes
 *
 * SYNC:
 * - Current playing segment highlighted
 * - Auto-scroll to follow playback (toggleable)
 */

interface SegmentListProps {
  segments: Segment[]
  selectedIds: Set<string>
  currentPlayingId: string | null
  onSelect: (id: string, multi: boolean) => void
  onEdit: (id: string) => void
  onScrollToSegment: (id: string) => void
  autoFollow: boolean
}
```

### 5.4 Import Wizard Component

```typescript
// src/renderer/src/components/import/ImportWizard.tsx

/**
 * IMPORT WIZARD SPECIFICATION
 *
 * Multi-step wizard for creating a new project:
 *
 * STEP 1: Video Selection
 * - File picker for video (MP4, MOV, MKV, WebM)
 * - Show video preview
 * - Display video metadata (duration, resolution, fps)
 * - Extract and show audio waveform preview
 *
 * STEP 2: Import Mode Selection
 * - Option A: Automatic (transcribe + translate + generate)
 * - Option B: CSV Import (use existing segments)
 *
 * STEP 3A (Automatic): Transcription Settings
 * - Source language selection
 * - Target language selection
 * - Speaker diarization toggle
 * - Start transcription button
 * - Progress indicator
 *
 * STEP 3B (CSV): CSV Import
 * - File picker for CSV
 * - Column mapping (if headers don't match)
 * - Validation of required fields
 * - Preview of parsed segments
 *
 * STEP 4: Voice Assignment
 * - List detected speakers
 * - Assign voice to each speaker
 * - Preview voice samples
 *
 * STEP 5: Generation
 * - Review all settings
 * - Start batch TTS generation
 * - Progress indicator per segment
 * - Option to skip generation (do later)
 *
 * STEP 6: Complete
 * - Summary of created project
 * - Open in editor button
 */

interface ImportWizardProps {
  onComplete: (projectId: string) => void
  onCancel: () => void
}

type ImportStep =
  | 'video-select'
  | 'mode-select'
  | 'transcription'
  | 'csv-import'
  | 'voice-assignment'
  | 'generation'
  | 'complete'
```

---

## 6. Audio Engine Architecture

### 6.1 Tone.js Audio Engine

```typescript
// src/renderer/src/services/audio/AudioEngine.ts

/**
 * AUDIO ENGINE SPECIFICATION
 *
 * Uses Tone.js for precise multi-track audio scheduling.
 *
 * ARCHITECTURE:
 * - Master output -> user speakers
 * - Original audio track (ducked during dubbed playback)
 * - Dubbed audio track (scheduled segments)
 *
 * FEATURES:
 * - Sub-millisecond scheduling accuracy
 * - Gapless segment playback
 * - Real-time speed/pitch adjustment
 * - Audio ducking (lower original when dubbed plays)
 * - Solo/mute per track
 *
 * BUFFER MANAGEMENT:
 * - Preload segments within ±30 seconds of playhead
 * - Unload segments outside ±60 seconds
 * - Cache decoded audio buffers
 * - Handle segment regeneration (swap buffers)
 */

interface AudioEngineConfig {
  originalAudioPath: string
  duckingEnabled: boolean
  duckingGainDb: number // e.g., -12
  masterVolume: number // 0-1
}

interface ScheduledSegment {
  segmentId: string
  startTimeMs: number
  buffer: AudioBuffer
  playbackRate: number
  gainDb: number
}

class AudioEngine {
  private context: Tone.Context
  private originalPlayer: Tone.Player
  private segmentPlayers: Map<string, Tone.Player>
  private masterGain: Tone.Gain
  private originalGain: Tone.Gain
  private dubbedGain: Tone.Gain

  constructor(config: AudioEngineConfig)

  // Lifecycle
  async initialize(): Promise<void>
  dispose(): void

  // Playback control
  play(fromTimeMs?: number): void
  pause(): void
  seek(timeMs: number): void

  // Segment scheduling
  scheduleSegment(segment: ScheduledSegment): void
  unscheduleSegment(segmentId: string): void
  updateSegmentBuffer(segmentId: string, buffer: AudioBuffer): void

  // Track control
  setOriginalVolume(volume: number): void
  setDubbedVolume(volume: number): void
  muteOriginal(muted: boolean): void
  muteDubbed(muted: boolean): void

  // Ducking
  setDuckingEnabled(enabled: boolean): void
  setDuckingGain(gainDb: number): void

  // Playback rate
  setPlaybackRate(rate: number): void

  // State
  getCurrentTime(): number
  isPlaying(): boolean
}
```

---

## 7. Service Layer (Main Process)

### 7.1 ElevenLabs TTS Service

```typescript
// src/main/services/tts/elevenlabs.ts

/**
 * ELEVENLABS TTS SERVICE
 *
 * Handles all ElevenLabs API interactions for TTS.
 *
 * ENDPOINTS USED:
 * - GET /v1/voices - List available voices
 * - POST /v1/text-to-speech/{voice_id} - Generate speech
 * - POST /v1/text-to-speech/{voice_id}/stream - Stream speech
 *
 * FEATURES:
 * - API key management (secure storage)
 * - Voice caching (refresh periodically)
 * - Request queuing and rate limiting
 * - Error handling with retries
 * - Progress reporting for batch operations
 * - Cancellation support
 */

interface ElevenLabsConfig {
  apiKey: string
  defaultVoiceId?: string
  defaultStability?: number
  defaultSimilarityBoost?: number
}

interface GenerateOptions {
  voiceId: string
  text: string
  stability?: number // 0-1, default 0.5
  similarityBoost?: number // 0-1, default 0.75
  style?: number // 0-1
  speakerBoost?: boolean
  outputFormat?: 'mp3_44100_128' | 'pcm_16000' | 'pcm_24000'
}

interface Voice {
  id: string
  name: string
  category: string
  description?: string
  previewUrl?: string
  labels: Record<string, string>
}

class ElevenLabsService {
  constructor(config: ElevenLabsConfig)

  // Voice management
  async getVoices(): Promise<Voice[]>
  async getVoiceById(voiceId: string): Promise<Voice>

  // TTS generation
  async generate(options: GenerateOptions): Promise<Buffer>
  async generateToFile(options: GenerateOptions, outputPath: string): Promise<void>

  // Batch operations
  async generateBatch(
    items: Array<{ id: string; options: GenerateOptions }>,
    onProgress: (id: string, status: 'pending' | 'generating' | 'complete' | 'error') => void,
    signal?: AbortSignal
  ): Promise<Map<string, string>> // id -> file path

  // Utilities
  validateApiKey(): Promise<boolean>
  getUsage(): Promise<{ characterCount: number; characterLimit: number }>
}
```

### 7.2 FFmpeg Service

```typescript
// src/main/services/ffmpeg/index.ts

/**
 * FFMPEG SERVICE
 *
 * Handles all video/audio processing via FFmpeg.
 *
 * OPERATIONS:
 * - Extract audio from video
 * - Generate waveform data
 * - Probe media files
 * - Export final video with dubbed audio
 * - Audio format conversion
 *
 * FEATURES:
 * - Progress reporting
 * - Cancellation support
 * - Error handling with meaningful messages
 * - Cross-platform path handling
 */

interface ProbeResult {
  format: string
  duration: number // seconds
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

interface ExportOptions {
  inputVideoPath: string
  dubbedAudioPath: string // Mixed dubbed audio
  outputPath: string
  format: 'mp4' | 'mov' | 'mkv'
  quality: 'low' | 'medium' | 'high'
  includeOriginalAudio: boolean
  originalAudioGainDb: number
  dubbedAudioGainDb: number
}

interface WaveformData {
  peaks: Float32Array
  duration: number
  sampleRate: number
}

class FFmpegService {
  constructor()

  // Probing
  async probe(filePath: string): Promise<ProbeResult>

  // Audio extraction
  async extractAudio(
    videoPath: string,
    outputPath: string,
    options?: { format?: 'wav' | 'mp3'; sampleRate?: number },
    onProgress?: (percent: number) => void
  ): Promise<void>

  // Waveform generation
  async generateWaveform(audioPath: string, samplesPerSecond?: number): Promise<WaveformData>

  // Audio mixing
  async mixAudioTracks(
    tracks: Array<{ path: string; gainDb: number; startTimeMs: number }>,
    outputPath: string,
    durationMs: number,
    onProgress?: (percent: number) => void
  ): Promise<void>

  // Export
  async exportVideo(
    options: ExportOptions,
    onProgress?: (stage: string, percent: number) => void,
    signal?: AbortSignal
  ): Promise<void>

  // Utilities
  async convertAudioFormat(
    inputPath: string,
    outputPath: string,
    format: 'wav' | 'mp3' | 'aac'
  ): Promise<void>
}
```

### 7.3 Keychain Service (API Key Storage)

```typescript
// src/main/services/keychain/index.ts

/**
 * KEYCHAIN SERVICE
 *
 * Securely stores API keys using OS-native credential storage:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: libsecret (GNOME Keyring / KWallet)
 *
 * Uses the 'keytar' package for cross-platform support.
 */

import keytar from 'keytar'

const SERVICE_NAME = 'DubDesk'

interface KeychainService {
  // Store a secret
  setSecret(key: string, value: string): Promise<void>

  // Retrieve a secret
  getSecret(key: string): Promise<string | null>

  // Delete a secret
  deleteSecret(key: string): Promise<boolean>

  // Check if a secret exists
  hasSecret(key: string): Promise<boolean>

  // List all stored keys (names only, not values)
  listKeys(): Promise<string[]>
}

class KeychainServiceImpl implements KeychainService {
  async setSecret(key: string, value: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, key, value)
  }

  async getSecret(key: string): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, key)
  }

  async deleteSecret(key: string): Promise<boolean> {
    return keytar.deletePassword(SERVICE_NAME, key)
  }

  async hasSecret(key: string): Promise<boolean> {
    const value = await this.getSecret(key)
    return value !== null
  }

  async listKeys(): Promise<string[]> {
    const credentials = await keytar.findCredentials(SERVICE_NAME)
    return credentials.map((c) => c.account)
  }
}

// Singleton export
export const keychainService = new KeychainServiceImpl()

// Key constants
export const API_KEYS = {
  ELEVENLABS: 'elevenlabs_api_key',
  ANTHROPIC: 'anthropic_api_key',
  OPENAI: 'openai_api_key'
} as const
```

### 7.4 Translation Service (Anthropic Claude)

```typescript
// src/main/services/translation/anthropic.ts

/**
 * ANTHROPIC CLAUDE TRANSLATION SERVICE
 *
 * Uses Claude for high-quality translation with context preservation.
 *
 * FEATURES:
 * - Context-aware translation (maintains consistency across segments)
 * - Preserves tone and style
 * - Handles idioms and cultural references
 * - Supports batch translation with context window
 * - Character count optimization for TTS
 */

import Anthropic from '@anthropic-ai/sdk'

interface TranslationOptions {
  sourceLanguage: string
  targetLanguage: string
  context?: string // Optional context about the video content
  speakerInfo?: string // Info about the speaker for tone matching
  maxCharacters?: number // Target max chars for TTS timing
}

interface TranslationResult {
  originalText: string
  translatedText: string
  confidence: number // 0-1 estimated quality
  notes?: string // Translation notes if any
}

interface BatchTranslationRequest {
  segments: Array<{
    id: string
    text: string
    speaker?: string
    previousText?: string // Previous segment for context
  }>
  options: TranslationOptions
}

class AnthropicTranslationService {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async translateSingle(text: string, options: TranslationOptions): Promise<TranslationResult> {
    const systemPrompt = this.buildSystemPrompt(options)
    const userPrompt = this.buildUserPrompt(text, options)

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    return this.parseResponse(text, content.text)
  }

  async translateBatch(
    request: BatchTranslationRequest,
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, TranslationResult>> {
    const results = new Map<string, TranslationResult>()
    const { segments, options } = request

    // Process in batches of 10 for context efficiency
    const batchSize = 10
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize)
      const batchResults = await this.translateSegmentBatch(batch, options)

      for (const [id, result] of batchResults) {
        results.set(id, result)
      }

      onProgress?.(Math.min(i + batchSize, segments.length), segments.length)
    }

    return results
  }

  private async translateSegmentBatch(
    segments: BatchTranslationRequest['segments'],
    options: TranslationOptions
  ): Promise<Map<string, TranslationResult>> {
    const systemPrompt = this.buildBatchSystemPrompt(options)
    const userPrompt = this.buildBatchUserPrompt(segments, options)

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    return this.parseBatchResponse(segments, content.text)
  }

  private buildSystemPrompt(options: TranslationOptions): string {
    return `You are a professional video dubbing translator. Translate from ${options.sourceLanguage} to ${options.targetLanguage}.

Guidelines:
- Maintain the original tone and emotion
- Keep translations natural for spoken delivery
- Preserve proper nouns and technical terms when appropriate
- Optimize length for voice-over timing (similar duration to original)
${options.maxCharacters ? `- Target approximately ${options.maxCharacters} characters` : ''}
${options.context ? `\nVideo context: ${options.context}` : ''}

Respond with ONLY the translation, no explanations.`
  }

  private buildUserPrompt(text: string, options: TranslationOptions): string {
    let prompt = `Translate this spoken text:\n\n"${text}"`
    if (options.speakerInfo) {
      prompt += `\n\nSpeaker: ${options.speakerInfo}`
    }
    return prompt
  }

  private buildBatchSystemPrompt(options: TranslationOptions): string {
    return `You are a professional video dubbing translator. Translate from ${options.sourceLanguage} to ${options.targetLanguage}.

Guidelines:
- Maintain the original tone and emotion
- Keep translations natural for spoken delivery
- Preserve proper nouns and technical terms
- Optimize length for voice-over timing
- Maintain consistency across all segments
${options.context ? `\nVideo context: ${options.context}` : ''}

Respond in JSON format: [{"id": "...", "translation": "..."}]`
  }

  private buildBatchUserPrompt(
    segments: BatchTranslationRequest['segments'],
    _options: TranslationOptions
  ): string {
    const items = segments.map((s) => ({
      id: s.id,
      text: s.text,
      speaker: s.speaker
    }))
    return `Translate these spoken segments:\n\n${JSON.stringify(items, null, 2)}`
  }

  private parseResponse(original: string, response: string): TranslationResult {
    return {
      originalText: original,
      translatedText: response.trim(),
      confidence: 0.9 // Could be enhanced with validation
    }
  }

  private parseBatchResponse(
    segments: BatchTranslationRequest['segments'],
    response: string
  ): Map<string, TranslationResult> {
    const results = new Map<string, TranslationResult>()

    try {
      const parsed = JSON.parse(response) as Array<{
        id: string
        translation: string
      }>

      for (const item of parsed) {
        const segment = segments.find((s) => s.id === item.id)
        if (segment) {
          results.set(item.id, {
            originalText: segment.text,
            translatedText: item.translation,
            confidence: 0.9
          })
        }
      }
    } catch {
      // Fallback: parse line by line if JSON fails
      const lines = response.split('\n').filter((l) => l.trim())
      for (let i = 0; i < Math.min(lines.length, segments.length); i++) {
        results.set(segments[i].id, {
          originalText: segments[i].text,
          translatedText: lines[i].trim(),
          confidence: 0.7
        })
      }
    }

    return results
  }
}

export { AnthropicTranslationService, TranslationOptions, TranslationResult }
```

---

## 8. Testing Strategy

### 8.1 Unit Tests (Vitest)

```typescript
// vitest.config.ts

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['tests/**', '**/*.d.ts', '**/types/**']
    },
    alias: {
      '@': resolve(__dirname, './src/renderer/src'),
      '@main': resolve(__dirname, './src/main'),
      '@shared': resolve(__dirname, './src/shared')
    }
  }
})
```

### 8.2 Unit Test Cases

```typescript
/**
 * UNIT TEST COVERAGE REQUIREMENTS
 *
 * Each module should have >80% coverage.
 * Critical paths require 100% coverage.
 */

// ============ STORES ============

// projectStore.test.ts
describe('projectStore', () => {
  it('should initialize with null project')
  it('should set current project')
  it('should update project properties')
  it('should mark unsaved changes on update')
  it('should clear unsaved flag on markSaved')
  it('should reset to initial state')
})

// segmentStore.test.ts
describe('segmentStore', () => {
  it('should initialize with empty segments')
  it('should add segment and maintain sort order')
  it('should update segment by id')
  it('should remove segment and clear from selection')
  it('should handle single selection')
  it('should handle multi-selection with ctrl-click')
  it('should handle range selection')
  it('should move segment to new time')
  it('should trim segment start and end')
  it('should track generating state per segment')
})

// timelineStore.test.ts
describe('timelineStore', () => {
  it('should initialize with default zoom')
  it('should clamp zoom to min/max bounds')
  it('should zoom in by 25%')
  it('should zoom out by 25%')
  it('should calculate zoom to fit duration')
  it('should convert pixels to milliseconds')
  it('should convert milliseconds to pixels')
  it('should snap value to grid when enabled')
  it('should not snap when disabled')
})

// ============ UTILS ============

// time.test.ts
describe('time utilities', () => {
  it('should format milliseconds to mm:ss.ms')
  it('should format milliseconds to hh:mm:ss')
  it('should parse time string to milliseconds')
  it('should handle edge cases (0, negative, very large)')
})

// csv.test.ts
describe('csv utilities', () => {
  it('should parse valid CSV with headers')
  it('should validate required columns exist')
  it('should convert CSV rows to segments')
  it('should handle missing optional columns')
  it('should reject invalid time values')
  it('should handle UTF-8 with BOM')
})

// ============ HOOKS ============

// useUndoRedo.test.ts
describe('useUndoRedo', () => {
  it('should track state changes')
  it('should undo to previous state')
  it('should redo after undo')
  it('should clear redo stack on new change')
  it('should limit history to max size')
  it('should report canUndo/canRedo correctly')
})

// usePlayback.test.ts
describe('usePlayback', () => {
  it('should sync video and audio playback')
  it('should update current time on animation frame')
  it('should handle play/pause state')
  it('should seek to specific time')
  it('should respect playback rate')
})

// ============ SERVICES (MAIN) ============

// database.test.ts
describe('database', () => {
  it('should create tables on initialization')
  it('should run migrations in order')
  it('should CRUD projects')
  it('should CRUD segments')
  it('should cascade delete segments on project delete')
  it('should record history entries')
  it('should get/set settings')
})

// elevenlabs.test.ts (with mocks)
describe('ElevenLabsService', () => {
  it('should fetch and cache voices')
  it('should generate audio and return buffer')
  it('should save audio to file')
  it('should handle API errors gracefully')
  it('should respect rate limits')
  it('should support cancellation')
})

// ffmpeg.test.ts (with mocks)
describe('FFmpegService', () => {
  it('should probe video metadata')
  it('should extract audio to wav')
  it('should generate waveform data')
  it('should mix multiple audio tracks')
  it('should export video with dubbed audio')
  it('should report progress')
  it('should handle cancellation')
})

// keychain.test.ts
describe('KeychainService', () => {
  it('should store API key securely')
  it('should retrieve stored API key')
  it('should return null for non-existent key')
  it('should delete API key')
  it('should list all stored keys')
  it('should handle special characters in values')
})

// anthropic-translation.test.ts (with mocks)
describe('AnthropicTranslationService', () => {
  it('should translate single segment')
  it('should preserve tone in translation')
  it('should translate batch of segments')
  it('should report batch progress')
  it('should handle API errors gracefully')
  it('should respect max characters constraint')
  it('should maintain context across batch segments')
  it('should parse JSON response correctly')
  it('should fallback to line parsing on JSON failure')
})
```

### 8.3 E2E Tests (Playwright)

```typescript
// playwright.config.ts

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 1,
  workers: 1, // Electron tests must be serial
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry'
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts'
    }
  ]
})
```

### 8.4 E2E Test Cases

```typescript
/**
 * E2E TEST SCENARIOS
 *
 * Each scenario tests a complete user workflow.
 */

// project.spec.ts
describe('Project Management', () => {
  test('should show welcome screen on first launch')
  test('should create new project from video')
  test('should create new project from CSV + video')
  test('should open existing project')
  test('should list recent projects')
  test('should save project')
  test('should auto-save after changes')
  test('should prompt to save on close with changes')
})

// import.spec.ts
describe('Import Workflow', () => {
  test('should import video and extract metadata')
  test('should transcribe video with ElevenLabs')
  test('should translate transcription')
  test('should import CSV and validate format')
  test('should map CSV columns correctly')
  test('should assign voices to speakers')
  test('should generate initial TTS batch')
  test('should handle transcription errors')
  test('should handle invalid CSV gracefully')
})

// timeline.spec.ts
describe('Timeline Editing', () => {
  test('should display segments on timeline')
  test('should select segment by clicking')
  test('should multi-select with ctrl+click')
  test('should drag segment to move in time')
  test('should drag segment edge to trim')
  test('should zoom timeline with scroll wheel')
  test('should seek playhead by clicking ruler')
  test('should play/pause with spacebar')
  test('should delete selected segments')
  test('should undo/redo changes')
})

// segment.spec.ts
describe('Segment Operations', () => {
  test('should edit segment text')
  test('should regenerate segment audio')
  test('should change segment voice')
  test('should split segment at playhead')
  test('should merge selected segments')
  test('should adjust segment speed')
  test('should show generation progress')
  test('should handle generation errors')
})

// export.spec.ts
describe('Export Workflow', () => {
  test('should open export dialog')
  test('should select export format and quality')
  test('should export video with dubbed audio')
  test('should show export progress')
  test('should handle export cancellation')
  test('should export audio-only')
  test('should export subtitles')
})

// playback.spec.ts
describe('Playback Sync', () => {
  test('should sync video with dubbed audio')
  test('should duck original audio during dubbed segments')
  test('should respect playback rate changes')
  test('should maintain sync after seeking')
  test('should handle segment changes during playback')
})
```

### 8.5 Manual Testing Checklist

```markdown
# Manual Testing Checklist

## Chrome DevTools Testing (Renderer)

### Timeline Interactions

- [ ] Hover segments shows tooltip with timing
- [ ] Click segment highlights in list
- [ ] Drag segment shows ghost while dragging
- [ ] Drag edge shows resize cursor
- [ ] Context menu appears on right-click
- [ ] Zoom is smooth without jank
- [ ] Playhead moves smoothly during playback
- [ ] Waveform renders correctly at all zoom levels

### Video Player

- [ ] Video loads and displays
- [ ] Play/pause works
- [ ] Seeking is responsive
- [ ] Time display is accurate
- [ ] Volume control works
- [ ] Playback rate changes work
- [ ] Fullscreen works

### Audio Sync

- [ ] Dubbed audio plays at correct time
- [ ] Original audio ducks during dubbed segments
- [ ] No audible gaps between segments
- [ ] Sync maintained after seeking
- [ ] Speed adjustment sounds natural

### Keyboard Shortcuts

- [ ] Spacebar plays/pauses
- [ ] J/K/L shuttle control works
- [ ] Arrow keys step time
- [ ] Delete removes selected
- [ ] Ctrl+Z undoes
- [ ] Ctrl+Shift+Z redoes

### Performance

- [ ] Smooth scrolling with 100+ segments
- [ ] No memory leaks during long sessions
- [ ] Responsive with 1-hour video

## Cross-Platform Testing

### macOS

- [ ] App launches correctly
- [ ] File dialogs work
- [ ] Menu bar integration
- [ ] Cmd shortcuts work

### Windows

- [ ] App launches correctly
- [ ] File dialogs work
- [ ] Taskbar integration
- [ ] Ctrl shortcuts work

### Linux

- [ ] App launches correctly
- [ ] File dialogs work
- [ ] Desktop integration
```

---

## 9. Development Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Establish core infrastructure

**Tasks:**

1. Set up project structure as defined
2. Install and configure all dependencies
3. Set up Vitest and Playwright
4. Implement SQLite database with migrations
5. Implement all IPC channels (stubs first)
6. Create Zustand stores
7. Create basic UI shell (AppShell, panels)

**Tests:**

- All store unit tests
- Database CRUD tests
- IPC channel tests (mocked)

**Milestone:** Can create/save/load empty projects

---

### Phase 2: Import & Transcription (Week 3-4)

**Goal:** Implement project creation workflows

**Tasks:**

1. Video import and metadata extraction (FFmpeg)
2. Audio extraction from video
3. ElevenLabs transcription integration
4. CSV import and parsing
5. Import wizard UI (all steps)
6. Speaker detection and assignment

**Tests:**

- FFmpeg service tests
- CSV parsing tests
- Import wizard E2E tests

**Milestone:** Can create project from video with transcription or CSV

---

### Phase 3: Timeline Editor (Week 5-7)

**Goal:** Build the core editing interface

**Tasks:**

1. Timeline component with Canvas rendering
2. WaveSurfer.js integration for waveforms
3. Segment rendering and interaction
4. Drag-to-move and drag-to-trim
5. Selection (single, multi, range)
6. Playhead and time ruler
7. Zoom controls
8. Keyboard shortcuts

**Tests:**

- Timeline store tests
- Timeline component tests
- Timeline E2E tests

**Milestone:** Can visually edit segment timing

---

### Phase 4: TTS Integration (Week 8-9)

**Goal:** Implement audio generation

**Tasks:**

1. ElevenLabs TTS service
2. Voice library UI
3. Per-segment text editing
4. Single segment regeneration
5. Batch generation with progress
6. Audio caching

**Tests:**

- TTS service tests (mocked API)
- Voice selection tests
- Regeneration E2E tests

**Milestone:** Can generate and regenerate dubbed audio

---

### Phase 5: Audio Engine (Week 10-11)

**Goal:** Implement synchronized playback

**Tasks:**

1. Tone.js AudioEngine implementation
2. Multi-track scheduling
3. Video-audio sync
4. Original audio ducking
5. Playback rate control
6. Gapless segment playback

**Tests:**

- AudioEngine unit tests
- Playback sync E2E tests

**Milestone:** Can preview dubbed video with sync audio

---

### Phase 6: Export & Polish (Week 12-13)

**Goal:** Complete the workflow

**Tasks:**

1. Export dialog UI
2. FFmpeg video export
3. Progress reporting
4. Audio-only export
5. Subtitle export
6. Undo/redo implementation
7. Autosave
8. Settings UI

**Tests:**

- Export E2E tests
- Undo/redo tests
- Settings tests

**Milestone:** Complete MVP workflow

---

### Phase 7: Testing & Refinement (Week 14-15)

**Goal:** Quality assurance

**Tasks:**

1. Full E2E test suite execution
2. Cross-platform testing
3. Performance profiling
4. Bug fixes
5. UX refinements
6. Documentation

**Milestone:** Production-ready MVP

---

## 10. Development Workflow

### 10.1 Test-Driven Development Process

```bash
# 1. Write failing test first
npm run test:unit -- --watch tests/unit/stores/segmentStore.test.ts

# 2. Implement minimal code to pass
# 3. Refactor while tests pass
# 4. Commit with passing tests

# Run full test suite before commits
npm run test:unit
npm run test:e2e
```

### 10.2 Manual Testing in Chrome

```bash
# Start dev server
npm run dev

# Open DevTools in Electron window
# - View > Toggle Developer Tools
# - Or Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows)

# Use React DevTools extension
# Use Performance tab for profiling
# Use Network tab for API calls (mock)
```

### 10.3 Iteration Cycle

```
1. Pick task from phase
2. Write E2E test describing expected behavior
3. Write unit tests for components/services
4. Implement feature
5. Run unit tests continuously (watch mode)
6. Run E2E tests
7. Manual testing in app
8. Commit when all tests pass
9. Move to next task
```

### 10.4 Git Workflow

```bash
# Feature branches
git checkout -b feature/timeline-editor

# Commit conventions
git commit -m "feat(timeline): implement segment drag-to-move"
git commit -m "test(timeline): add segment movement tests"
git commit -m "fix(timeline): correct snap-to-grid calculation"

# PR with passing CI
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

---

## 11. NPM Scripts

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "npm run typecheck && electron-vite build",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "npm run build && electron-builder --mac",
    "build:linux": "npm run build && electron-builder --linux",

    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",

    "lint": "eslint . --cache",
    "lint:fix": "eslint . --cache --fix",
    "format": "prettier --write .",

    "test": "npm run test:unit && npm run test:e2e",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:unit:ui": "vitest --ui",
    "test:unit:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",

    "prepare": "husky install",
    "db:migrate": "node scripts/migrate.js"
  }
}
```

---

## 12. Success Criteria

### MVP Completion Checklist

- [ ] Create project from video (automatic transcription)
- [ ] Create project from CSV + video
- [ ] Visual timeline with waveform
- [ ] Drag segments to reposition
- [ ] Trim segment edges
- [ ] Edit segment text
- [ ] Regenerate single segment audio
- [ ] Play video with synced dubbed audio
- [ ] Export video with dubbed audio track
- [ ] Undo/redo all operations
- [ ] Autosave projects
- [ ] Cross-platform builds (Win/Mac/Linux)

### Performance Targets

- [ ] Timeline renders 60fps with 500 segments
- [ ] Audio-video sync within 50ms
- [ ] Segment regeneration < 3 seconds
- [ ] App startup < 3 seconds
- [ ] Memory usage < 500MB for 1-hour project

### Test Coverage

- [ ] Unit test coverage > 80%
- [ ] All E2E scenarios passing
- [ ] Manual testing checklist complete

---

_End of Implementation Plan_
