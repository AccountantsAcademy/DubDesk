# Product Requirements Document

## DubDesk

_Open-source dubbing editor with timeline-based audio synchronization_

---

## 1. Executive Summary

This document outlines requirements for an open-source AI video dubbing studio that provides a professional timeline-based editor for fine-tuning automatically generated dubs. The tool bridges the gap between fully automated dubbing pipelines (which produce ~90% accurate results) and the manual refinement needed for broadcast-quality output.

The key differentiator is a visual editor that allows users to precisely adjust timing, regenerate individual audio segments, and synchronize dubbed audio with video—capabilities currently only available in expensive commercial solutions like ElevenLabs Dubbing Studio (~$2/min) or Rask.ai.

---

## 2. Problem Statement

### 2.1 Current Market Gap

- Existing open-source dubbing tools (pyvideotrans, open-dubbing, Linly-Dubbing) focus on batch processing without visual editing
- Commercial solutions with proper editors are prohibitively expensive for individual creators and small teams
- AI dubbing achieves ~90% accuracy but the remaining 10% of timing issues break the viewing experience
- No open-source solution exists that combines ElevenLabs-quality TTS with a professional editing interface

### 2.2 Target Users

- Content creators localizing videos for international audiences
- Educational content producers translating course materials
- Media companies requiring cost-effective dubbing workflows
- Developers building custom localization pipelines

---

## 3. Core Features

### 3.1 Timeline Editor

The central interface must provide a video-editor-like experience for manipulating dubbed audio segments:

| Feature                | Description                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| **Visual Timeline**    | Horizontal timeline showing video waveform, original audio, and dubbed segments as draggable blocks |
| **Drag-to-Reposition** | Click and drag any dubbed audio segment to shift its start time by seconds or milliseconds          |
| **Segment Trimming**   | Drag segment edges to trim start/end points for precise alignment                                   |
| **Zoom Controls**      | Zoom in/out on timeline for frame-accurate adjustments (10ms precision minimum)                     |
| **Playback Sync**      | Scrubber synced with video preview, original audio, and dubbed tracks simultaneously                |
| **Keyboard Shortcuts** | J/K/L for playback, arrow keys for frame stepping, spacebar for play/pause                          |

### 3.2 Audio Generation & Regeneration

| Feature                      | Description                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| **TTS API Integration**      | Primary: ElevenLabs API. Secondary: OpenAI TTS, Azure Speech, Edge TTS (free fallback) |
| **Per-Segment Regeneration** | Regenerate individual segments without re-processing entire video                      |
| **Voice Selection**          | Choose different voices per speaker; support for voice cloning via ElevenLabs          |
| **Speed/Pitch Adjustment**   | Adjust playback speed (0.5x-2x) and pitch per segment to match timing                  |
| **Text Editing**             | Edit translated text inline, then regenerate audio for that segment                    |

### 3.3 Import Pipeline

Two import modes to support different workflows:

**Mode A: Automatic Pipeline (from video only)**

- Video Upload: MP4, MOV, MKV, WebM support; extract audio automatically
- Transcription: ElevenLabs Speech-to-Text API with word-level timestamps
- Speaker Diarization: ElevenLabs speaker detection for voice assignment
- Translation: LLM-powered translation (OpenAI, Anthropic, or local models)
- Sentence Segmentation: Intelligent splitting that preserves natural speech boundaries
- Initial TTS Generation: Batch generate all segments using selected voice(s)

**Mode B: CSV Import (video + pre-edited segments)**

For users who want to manually review/edit transcription and translation before TTS generation, or import from external dubbing workflows:

| Column          | Type            | Description                                                 |
| --------------- | --------------- | ----------------------------------------------------------- |
| `speaker`       | String          | Speaker identifier (e.g., "Speaker 1") for voice assignment |
| `transcription` | String          | Original text in source language                            |
| `translation`   | String          | Translated text for TTS generation                          |
| `start_time`    | Float (seconds) | Segment start time (e.g., 6.34)                             |
| `end_time`      | Float (seconds) | Segment end time (e.g., 23.64)                              |

**CSV import benefits:**

- Pre-edit translations in Excel/Google Sheets before generating audio
- Import existing subtitle files (SRT converted to CSV)
- Quality control: review all text before incurring TTS API costs
- Batch corrections: fix systematic translation errors externally
- Compatible with ElevenLabs Dubbing Studio export format

### 3.4 Export Options

| Export Type      | Details                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| **Full Video**   | Re-encoded video with dubbed audio track, optional original audio ducking |
| **Audio Only**   | Exported dubbed audio track (WAV/MP3) for external mixing                 |
| **Subtitles**    | SRT/VTT export of translated text with corrected timings                  |
| **Project File** | JSON export of all segments, timings, and settings for re-import          |

---

## 4. Technical Architecture

### 4.1 Recommended Stack

Desktop application architecture using Electron for cross-platform distribution:

| Layer                      | Technology                    | Rationale                               |
| -------------------------- | ----------------------------- | --------------------------------------- |
| **App Shell**              | Electron                      | Cross-platform desktop (Win/Mac/Linux)  |
| **Frontend**               | React + Vite + TypeScript     | Fast HMR, modern tooling, type safety   |
| **Timeline Rendering**     | Canvas/WebGL or WaveSurfer.js | Performance for waveform display        |
| **Audio Sync**             | Tone.js                       | Precise multi-track audio scheduling    |
| **Backend (Main Process)** | Node.js (Electron main)       | File system access, FFmpeg spawning     |
| **Video/Audio Processing** | FFmpeg (bundled)              | Extraction, encoding, muxing            |
| **Transcription**          | ElevenLabs Speech-to-Text API | Unified provider, word-level timestamps |
| **TTS Primary**            | ElevenLabs API                | Best quality, voice cloning support     |
| **TTS Fallback**           | Edge TTS / Coqui XTTS         | Free/local options for cost control     |
| **Local Storage**          | SQLite + filesystem           | No server dependency, portable projects |
| **State Management**       | Zustand or Jotai              | Lightweight, fits Electron IPC patterns |

### 4.2 Electron Architecture Notes

- **Main process:** File I/O, FFmpeg operations, SQLite, system dialogs
- **Renderer process:** React UI, timeline, video playback
- **IPC communication:** Use contextBridge for secure main/renderer messaging
- **FFmpeg bundling:** Use ffmpeg-static or prompt user to install system FFmpeg
- **Auto-updates:** Electron-builder with GitHub releases for distribution

### 4.3 Key Technical Requirements

- Real-time preview: Audio playback must sync within 50ms of video
- Non-destructive editing: All operations reversible; original files preserved
- Fully offline-capable: Core editing works without internet; only TTS API calls require connectivity
- Portable projects: Project folder contains all assets, movable between machines
- Modular TTS: Pluggable TTS providers via adapter pattern

---

## 5. User Interface Specification

### 5.1 Main Editor Layout

The interface follows a standard video editor layout optimized for dubbing workflows:

- **Top Bar:** Project name, save status, export button, settings
- **Left Panel:** Segment list with text, timing, voice assignment; search/filter
- **Center:** Video preview with playback controls
- **Bottom:** Multi-track timeline (original audio, dubbed audio per speaker)
- **Right Panel (collapsible):** Voice library, TTS settings, segment properties

### 5.2 Timeline Interaction Model

| Action               | Result                                          |
| -------------------- | ----------------------------------------------- |
| Single-click segment | Select for property editing                     |
| Double-click segment | Enter text edit mode                            |
| Drag segment body    | Move start time (shift timing)                  |
| Drag segment edges   | Trim duration                                   |
| Right-click segment  | Context menu (regenerate, split, merge, delete) |
| Ctrl+drag            | Duplicate segment                               |
| Scroll wheel         | Zoom timeline horizontally                      |

### 5.3 Critical UX Considerations

- **Instant feedback:** Show loading state during regeneration; preview cached audio
- **Undo/redo:** Full history stack for all timing and text changes
- **Autosave:** Persist changes every 30 seconds to prevent data loss
- **Batch operations:** Select multiple segments for bulk voice change or timing shift

---

## 6. MVP Scope Definition

### 6.1 Phase 1: Core Editor (MVP)

- Video import (MP4 only) with audio extraction
- CSV + Video import mode (ElevenLabs-compatible format)
- ElevenLabs transcription with automatic segmentation
- Single-language translation (English target)
- ElevenLabs TTS integration with 3 default voices
- Timeline editor with drag-to-reposition
- Per-segment text editing and regeneration
- Export as MP4 with dubbed audio
- Desktop app: Electron with React/Vite, SQLite for projects

### 6.2 Phase 2: Enhanced Editing

- Multi-speaker diarization and voice assignment
- Speed/pitch adjustment per segment
- Segment splitting and merging
- Keyboard shortcuts for efficient editing
- Project save/load (JSON format)

### 6.3 Phase 3: Professional Features

- Voice cloning via ElevenLabs
- Multiple TTS provider support
- Lip-sync preview (visual indicator, not video modification)
- Batch processing multiple videos
- Auto-updates via GitHub releases
- Optional cloud sync for projects

---

## 7. Success Metrics

| Metric                      | Target                       | Measurement          |
| --------------------------- | ---------------------------- | -------------------- |
| Time to first dubbed video  | < 15 minutes for 5-min video | User testing         |
| Timing adjustment precision | 10ms granularity             | Technical validation |
| Audio-video sync latency    | < 50ms during preview        | Performance testing  |
| Segment regeneration time   | < 3 seconds per segment      | API response time    |
| Cost per minute dubbed      | < $0.20 (vs $2 commercial)   | API cost tracking    |

---

## 8. Competitive Analysis

| Tool                  | Timeline Editor | ElevenLabs   | Open Source | Price          |
| --------------------- | --------------- | ------------ | ----------- | -------------- |
| **ElevenLabs Studio** | Yes             | Native       | No          | ~$2/min        |
| **Rask.ai**           | Yes             | No           | No          | ~$2/min        |
| **pyvideotrans**      | No              | Yes (config) | Yes         | API costs only |
| **Dubbie**            | Basic           | No           | Yes         | ~$0.10/min     |
| **This Project**      | Full            | Yes          | Yes         | API costs only |

---

## 9. Appendix: Reference Implementations

### 9.1 Existing Open-Source Projects to Study

- **Dubbie** (github.com/DubbieHQ/dubbie): Best existing open-source editor, uses Tone.js for audio sync
- **subdub-editor** (github.com/Softcatala/subdub-editor): React timeline component reference
- **pyvideotrans** (github.com/jianchang512/pyvideotrans): ElevenLabs integration patterns
- **open-dubbing** (github.com/Softcatala/open-dubbing): CLI pipeline architecture

### 9.2 Key API Documentation

- **ElevenLabs API:** elevenlabs.io/docs/api-reference (TTS + Speech-to-Text)
- **Electron:** electronjs.org/docs
- **Tone.js:** tonejs.github.io (audio scheduling)
- **WaveSurfer.js:** wavesurfer.xyz (waveform visualization)

---

_— End of Document —_
