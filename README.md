# DubDesk

AI-powered video dubbing desktop application. Transform videos into any language with automatic transcription, translation, and voice synthesis.

## Features

- **Automatic Transcription** - Extract speech from video with speaker diarization using AI
- **AI Translation** - Translate transcripts to any target language using Claude
- **Voice Synthesis** - Generate natural speech using ElevenLabs text-to-speech
- **Timeline Editor** - Visual segment editing with drag, resize, split, and merge
- **Speaker Management** - Assign speakers with custom colors and default voices
- **Audio Mixing** - Control original and dubbed audio volumes with ducking
- **Smart Regeneration** - Detect stale audio when text or timing changes
- **Export** - Export dubbed video (MP4, MKV, MOV) or audio only (M4A, MP3, WAV, FLAC)

## Workflow

1. **Import** - Load a video file and set source/target languages
2. **Transcribe** - Auto-detect speech segments with speaker identification
3. **Translate** - Batch translate all segments to target language
4. **Edit** - Refine translations, adjust timing, assign speakers and voices
5. **Generate** - Create TTS audio for all segments
6. **Export** - Mix dubbed audio with original and export

## Requirements

- macOS, Windows, or Linux
- [ElevenLabs API key](https://elevenlabs.io/) for voice synthesis
- [Anthropic API key](https://console.anthropic.com/) for translation
- [AssemblyAI API key](https://www.assemblyai.com/) for transcription

## Installation

```bash
# Clone the repository
git clone https://github.com/dubdesk/dubdesk.git
cd dubdesk

# Install dependencies
pnpm install
```

## Development

```bash
# Start development server
pnpm dev
```

## Build

```bash
# macOS
pnpm build:mac

# Windows
pnpm build:win

# Linux
pnpm build:linux
```

## Keyboard Shortcuts

| Shortcut           | Action                   |
| ------------------ | ------------------------ |
| `Space`            | Play/Pause video         |
| `J`                | Jump to previous segment |
| `K`                | Jump to next segment     |
| `Cmd/Ctrl+Z`       | Undo                     |
| `Cmd/Ctrl+Shift+Z` | Redo                     |
| `Cmd/Ctrl+A`       | Select all segments      |
| `Delete`           | Delete selected segments |

## Tech Stack

- **Framework**: Electron + React 19 + TypeScript
- **Build**: electron-vite + Vite
- **UI**: Tailwind CSS
- **State**: Zustand + Immer
- **Database**: better-sqlite3
- **Audio**: Howler.js + FFmpeg
- **Waveform**: WaveSurfer.js

## Scripts

| Command            | Description              |
| ------------------ | ------------------------ |
| `pnpm dev`         | Start development server |
| `pnpm build`       | Build for production     |
| `pnpm build:mac`   | Build macOS app          |
| `pnpm build:win`   | Build Windows app        |
| `pnpm build:linux` | Build Linux app          |
| `pnpm typecheck`   | Run TypeScript checks    |
| `pnpm check`       | Run Biome linting        |
| `pnpm test`        | Run all tests            |
| `pnpm test:unit`   | Run unit tests           |
| `pnpm test:e2e`    | Run E2E tests            |

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── ipc/        # IPC handlers
│   └── services/   # Backend services (database, ffmpeg, etc.)
├── preload/        # Electron preload scripts
├── renderer/       # React frontend
│   ├── components/ # UI components
│   ├── stores/     # Zustand stores
│   └── hooks/      # Custom React hooks
└── shared/         # Shared types and utilities
```

## Configuration

API keys are stored securely using the system keychain. Configure them in Settings within the app.

## License

This project is proprietary and not open-source. For licensing inquiries, please contact us at [info@accountantsacademy.be](mailto:info@accountantsacademy.be).
