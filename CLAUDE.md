# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DubDesk is an AI-powered video dubbing desktop application built with Electron, React, and TypeScript. It enables timeline-based editing of dubbed audio segments synchronized with video playback.

**Tech Stack:**
- Electron (desktop framework)
- React 19 with TypeScript
- Zustand (state management)
- Tailwind CSS v4 (styling)
- SQLite via better-sqlite3 (database)
- FFmpeg (video/audio processing)
- Tone.js (audio playback/scheduling)
- WaveSurfer.js (waveform visualization)

**External APIs:**
- ElevenLabs (TTS generation and speech-to-text)
- Anthropic Claude (translation)

## Development Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev                    # Start Electron app in dev mode

# Building
pnpm build                  # Typecheck + build
pnpm build:mac             # Build for macOS
pnpm build:win             # Build for Windows
pnpm build:linux           # Build for Linux

# Testing
pnpm test                   # Run all tests (unit + e2e)
pnpm test:unit              # Run unit tests (Vitest)
pnpm test:unit:watch        # Run unit tests in watch mode
pnpm test:unit:ui           # Run unit tests with UI
pnpm test:unit:coverage     # Run unit tests with coverage
pnpm test:e2e               # Run e2e tests (Playwright)
pnpm test:e2e:ui            # Run e2e tests with UI

# Code Quality
pnpm lint                   # Run Biome linter
pnpm lint:fix               # Fix linting issues
pnpm check                  # Run Biome check (lint + format)
pnpm check:fix              # Fix all Biome issues
pnpm format                 # Format with Biome
pnpm typecheck              # Run TypeScript checks
```

## Architecture

### Process Structure (Electron)

```
src/
├── main/           # Electron Main Process
│   ├── index.ts    # App entry, window management
│   ├── ipc/        # IPC handlers (one file per domain)
│   └── services/   # Business logic
│       ├── database/       # SQLite + repositories
│       ├── ffmpeg/         # Video/audio processing
│       ├── elevenlabs/     # TTS/STT
│       ├── translation/    # Claude translation
│       ├── keychain/       # Secure API key storage
│       └── workflow/       # Multi-step operations
├── preload/        # Context Bridge (exposes APIs to renderer)
│   └── index.ts    # window.dubdesk API definition
├── renderer/       # React Frontend
│   └── src/
│       ├── components/     # UI components by domain
│       ├── stores/         # Zustand stores
│       └── hooks/          # Custom React hooks
└── shared/         # Shared between main/renderer
    ├── types/      # TypeScript interfaces
    └── constants/  # IPC channels, defaults
```

### Key Patterns

**IPC Communication:** All main-renderer communication goes through typed IPC channels defined in `src/shared/constants/channels.ts`. The preload script (`src/preload/index.ts`) exposes `window.dubdesk` API to renderer.

**State Management:** Zustand stores in `src/renderer/src/stores/`:
- `project.store.ts` - Current project, loading states
- `segment.store.ts` - Segments, selection, editing state
- `timeline.store.ts` - Zoom, scroll, playhead position
- `playback.store.ts` - Play/pause, current time, audio sync
- `history.store.ts` - Undo/redo stacks
- `ui.store.ts` - Modals, panels, toasts

**Database:** SQLite with repository pattern in `src/main/services/database/repositories/`. Tables: projects, segments, speakers, voices, history, settings.

### Path Aliases

Configured in `electron.vite.config.ts` and `vitest.config.ts`:
- `@renderer` → `src/renderer/src`
- `@main` → `src/main`
- `@shared` → `src/shared`
- `@preload` → `src/preload`

## Testing

**Unit Tests (Vitest):**
- Location: `tests/unit/`
- Setup file: `tests/setup.ts`
- Pattern: `tests/unit/**/*.test.{ts,tsx}`

**E2E Tests (Playwright):**
- Location: `tests/e2e/`
- Config: `playwright.config.ts`

Run a single test file:
```bash
pnpm test:unit -- tests/unit/stores/segment.store.test.ts
```

## Code Style (Biome)

- 2-space indentation
- Single quotes
- No trailing commas
- No semicolons (ASI)
- Line width: 100 characters

Key rules:
- `noUnusedImports`: error
- `useImportType`: error (use `import type` for type-only imports)
- `noNonNullAssertion`: off
- `noExplicitAny`: warn

## Domain Concepts

**Project:** A video dubbing project containing segments, speakers, and settings. Stored in SQLite with associated media files.

**Segment:** A timed audio segment in the timeline. Has original timing, current timing (can be adjusted), text, voice assignment, and generated audio file.

**Speaker:** A character/person in the video. Segments can be assigned to speakers, and speakers have default voice assignments.

**Voice:** An ElevenLabs voice for TTS generation. Cached locally with preview URLs.

**Timeline:** Visual representation of video with waveform track and segment track. Supports zoom, scroll, and segment manipulation (move, trim, split, merge).

## IPC API Reference

The renderer accesses main process through `window.dubdesk`:

```typescript
// Example usage in renderer
const project = await window.dubdesk.project.create({ name, videoPath, targetLanguage })
const segments = await window.dubdesk.segment.getAll(projectId)
const voices = await window.dubdesk.tts.getVoices()
await window.dubdesk.tts.generateSingle({ segmentId, voiceId })
```

Key APIs:
- `project.*` - CRUD operations for projects
- `segment.*` - CRUD + split/merge for segments
- `speaker.*` - Speaker management
- `tts.*` - ElevenLabs TTS generation
- `transcription.*` - Speech-to-text
- `translation.*` - Claude translation
- `ffmpeg.*` - Video/audio processing
- `fs.*` - File system dialogs
- `settings.*` - App settings and API keys
- `history.*` - Undo/redo operations
