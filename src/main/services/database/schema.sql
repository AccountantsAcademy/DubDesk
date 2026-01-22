-- DubDesk Database Schema
-- SQLite database for storing projects, segments, speakers, and settings

-- ============================================
-- Projects Table
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
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
    settings TEXT, -- JSON blob for project-specific settings
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Speakers Table
-- ============================================
CREATE TABLE IF NOT EXISTS speakers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    default_voice_id TEXT,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================
-- Segments Table
-- ============================================
CREATE TABLE IF NOT EXISTS segments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    speaker_id TEXT,
    original_text TEXT,
    translated_text TEXT NOT NULL,
    start_time_ms INTEGER NOT NULL,
    end_time_ms INTEGER NOT NULL,
    original_start_time_ms INTEGER NOT NULL,
    original_end_time_ms INTEGER NOT NULL,
    audio_file_path TEXT,
    audio_duration_ms INTEGER,
    voice_id TEXT,
    speed_adjustment REAL NOT NULL DEFAULT 1.0,
    pitch_adjustment REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'pending',
    generation_error TEXT,
    order_index INTEGER NOT NULL,
    audio_generated_at TEXT,
    translated_text_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (speaker_id) REFERENCES speakers(id) ON DELETE SET NULL
);

-- ============================================
-- Voices Table (cached voice metadata)
-- ============================================
CREATE TABLE IF NOT EXISTS voices (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_voice_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    preview_url TEXT,
    labels TEXT, -- JSON array of labels
    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- History Table (for undo/redo)
-- ============================================
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    before_state TEXT NOT NULL, -- JSON snapshot
    after_state TEXT NOT NULL,  -- JSON snapshot
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================
-- Settings Table (app-wide settings)
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Recent Projects Table (for quick access)
-- ============================================
CREATE TABLE IF NOT EXISTS recent_projects (
    project_id TEXT PRIMARY KEY,
    last_opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    thumbnail_path TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================
-- Indexes
-- ============================================

-- Segments indexes
CREATE INDEX IF NOT EXISTS idx_segments_project ON segments(project_id);
CREATE INDEX IF NOT EXISTS idx_segments_time ON segments(project_id, start_time_ms);
CREATE INDEX IF NOT EXISTS idx_segments_status ON segments(project_id, status);
CREATE INDEX IF NOT EXISTS idx_segments_order ON segments(project_id, order_index);

-- Speakers indexes
CREATE INDEX IF NOT EXISTS idx_speakers_project ON speakers(project_id);

-- History indexes
CREATE INDEX IF NOT EXISTS idx_history_project ON history(project_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(project_id, timestamp DESC);

-- Voices indexes
CREATE INDEX IF NOT EXISTS idx_voices_provider ON voices(provider, provider_voice_id);

-- Recent projects indexes
CREATE INDEX IF NOT EXISTS idx_recent_projects_opened ON recent_projects(last_opened_at DESC);

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE TRIGGER IF NOT EXISTS update_projects_timestamp
    AFTER UPDATE ON projects
    FOR EACH ROW
BEGIN
    UPDATE projects SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_segments_timestamp
    AFTER UPDATE ON segments
    FOR EACH ROW
BEGIN
    UPDATE segments SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_speakers_timestamp
    AFTER UPDATE ON speakers
    FOR EACH ROW
BEGIN
    UPDATE speakers SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_settings_timestamp
    AFTER UPDATE ON settings
    FOR EACH ROW
BEGIN
    UPDATE settings SET updated_at = datetime('now') WHERE key = OLD.key;
END;
