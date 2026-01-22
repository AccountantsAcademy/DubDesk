/**
 * Database Service
 * SQLite database connection and initialization
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'

let db: Database.Database | null = null

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'dubdesk.db')
}

/**
 * Get the database instance
 * Creates and initializes the database if it doesn't exist
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = getDatabasePath()
  const dbDir = join(app.getPath('userData'))

  // Ensure the directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  // Create database connection
  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  })

  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')

  // Initialize schema
  initializeSchema()

  return db
}

/**
 * Initialize the database schema
 */
function initializeSchema(): void {
  if (!db) {
    throw new Error('Database not initialized')
  }

  // Read and execute the schema SQL
  const schemaPath = join(__dirname, 'schema.sql')

  // In production, the schema.sql will be bundled, so we use a different approach
  // We'll inline the schema creation here as a fallback
  const schema = existsSync(schemaPath) ? readFileSync(schemaPath, 'utf-8') : getInlineSchema()

  // Run the schema SQL statements
  db.exec(schema)

  // Run migrations for existing databases
  runMigrations()

  console.log('[Database] Schema initialized')
}

/**
 * Inline schema for production builds where SQL file might not be available
 */
function getInlineSchema(): string {
  return `
    -- Projects Table
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
        settings TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Speakers Table
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

    -- Segments Table
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
        audio_generated_voice_id TEXT,
        audio_generated_duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (speaker_id) REFERENCES speakers(id) ON DELETE SET NULL
    );

    -- Voices Table
    CREATE TABLE IF NOT EXISTS voices (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_voice_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        preview_url TEXT,
        labels TEXT,
        cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- History Table
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        before_state TEXT NOT NULL,
        after_state TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Settings Table
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Recent Projects Table
    CREATE TABLE IF NOT EXISTS recent_projects (
        project_id TEXT PRIMARY KEY,
        last_opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        thumbnail_path TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_segments_project ON segments(project_id);
    CREATE INDEX IF NOT EXISTS idx_segments_time ON segments(project_id, start_time_ms);
    CREATE INDEX IF NOT EXISTS idx_segments_status ON segments(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_segments_order ON segments(project_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_speakers_project ON speakers(project_id);
    CREATE INDEX IF NOT EXISTS idx_history_project ON history(project_id);
    CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(project_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_voices_provider ON voices(provider, provider_voice_id);
    CREATE INDEX IF NOT EXISTS idx_recent_projects_opened ON recent_projects(last_opened_at DESC);
  `
}

/**
 * Run migrations for existing databases
 * Adds new columns that may be missing from older schema versions
 */
function runMigrations(): void {
  if (!db) return

  // Check if audio_generated_at column exists in segments table
  const tableInfo = db.prepare("PRAGMA table_info('segments')").all() as Array<{ name: string }>
  const columnNames = new Set(tableInfo.map((col) => col.name))

  // Migration: Add stale audio tracking columns
  if (!columnNames.has('audio_generated_at')) {
    console.log('[Database] Running migration: Adding audio_generated_at column')
    db.exec('ALTER TABLE segments ADD COLUMN audio_generated_at TEXT')
  }

  if (!columnNames.has('translated_text_hash')) {
    console.log('[Database] Running migration: Adding translated_text_hash column')
    db.exec('ALTER TABLE segments ADD COLUMN translated_text_hash TEXT')
  }

  if (!columnNames.has('audio_generated_voice_id')) {
    console.log('[Database] Running migration: Adding audio_generated_voice_id column')
    db.exec('ALTER TABLE segments ADD COLUMN audio_generated_voice_id TEXT')
  }

  if (!columnNames.has('audio_generated_duration_ms')) {
    console.log('[Database] Running migration: Adding audio_generated_duration_ms column')
    db.exec('ALTER TABLE segments ADD COLUMN audio_generated_duration_ms INTEGER')
  }
}

/**
 * Initialize the database (alias for getDatabase for explicit initialization)
 */
export function initializeDatabase(): Database.Database {
  return getDatabase()
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[Database] Connection closed')
  }
}

/**
 * Run a database transaction
 */
export function runTransaction<T>(fn: () => T): T {
  const database = getDatabase()
  return database.transaction(fn)()
}

/**
 * Export for testing - allows setting a mock database
 */
export function setDatabase(mockDb: Database.Database | null): void {
  db = mockDb
}
