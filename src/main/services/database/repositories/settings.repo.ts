/**
 * Settings Repository
 * Database operations for application settings
 */

import { getDatabase, runTransaction } from '../index'

interface SettingRow {
  key: string
  value: string
  updated_at: string
}

// Default settings values
const DEFAULT_SETTINGS: Record<string, string> = {
  // General
  'general.autosave_interval_ms': '30000',
  'general.default_language': 'en',
  'general.theme': 'dark',

  // Timeline
  'timeline.default_zoom': '50',
  'timeline.snap_to_grid': 'true',
  'timeline.grid_size_ms': '100',
  'timeline.waveform_color': '#44cc66',
  'timeline.segment_color': '#0066ff',

  // Playback
  'playback.default_volume': '0.8',
  'playback.original_audio_volume': '0.3',

  // Export
  'export.default_format': 'mp4',
  'export.default_quality': 'high',
  'export.include_original_audio': 'true',
  'export.original_audio_duck_db': '-12',

  // TTS
  'tts.default_voice_id': '',
  'tts.default_stability': '0.5',
  'tts.default_similarity_boost': '0.75'
}

export const settingsRepository = {
  /**
   * Get a setting value
   * Returns the default value if not set
   */
  get(key: string): string | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
    const row = stmt.get(key) as { value: string } | undefined

    if (row) {
      return row.value
    }

    // Return default if available
    return DEFAULT_SETTINGS[key] ?? null
  },

  /**
   * Get a setting value with type conversion
   */
  getString(key: string, defaultValue = ''): string {
    return this.get(key) ?? defaultValue
  },

  getNumber(key: string, defaultValue = 0): number {
    const value = this.get(key)
    if (value === null) return defaultValue
    const num = parseFloat(value)
    return Number.isNaN(num) ? defaultValue : num
  },

  getBoolean(key: string, defaultValue = false): boolean {
    const value = this.get(key)
    if (value === null) return defaultValue
    return value === 'true' || value === '1'
  },

  getJSON<T>(key: string, defaultValue: T): T {
    const value = this.get(key)
    if (value === null) return defaultValue
    try {
      return JSON.parse(value) as T
    } catch {
      return defaultValue
    }
  },

  /**
   * Set a setting value
   */
  set(key: string, value: string): void {
    const db = getDatabase()
    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    stmt.run(key, value)
  },

  /**
   * Set multiple settings at once
   */
  setBulk(settings: Record<string, string>): void {
    runTransaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        this.set(key, value)
      }
    })
  },

  /**
   * Delete a setting (resets to default)
   */
  delete(key: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM settings WHERE key = ?')
    const result = stmt.run(key)
    return result.changes > 0
  },

  /**
   * Get all settings
   * Merges stored settings with defaults
   */
  getAll(): Record<string, string> {
    const db = getDatabase()
    const stmt = db.prepare('SELECT key, value FROM settings')
    const rows = stmt.all() as SettingRow[]

    // Start with defaults
    const result = { ...DEFAULT_SETTINGS }

    // Override with stored values
    for (const row of rows) {
      result[row.key] = row.value
    }

    return result
  },

  /**
   * Get all settings with a specific prefix
   */
  getByPrefix(prefix: string): Record<string, string> {
    const all = this.getAll()
    const result: Record<string, string> = {}

    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(prefix)) {
        result[key] = value
      }
    }

    return result
  },

  /**
   * Reset all settings to defaults
   */
  resetAll(): void {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM settings')
    stmt.run()
  },

  /**
   * Reset a specific setting to default
   */
  resetToDefault(key: string): string | null {
    this.delete(key)
    return DEFAULT_SETTINGS[key] ?? null
  },

  /**
   * Get default settings (without querying database)
   */
  getDefaults(): Record<string, string> {
    return { ...DEFAULT_SETTINGS }
  },

  /**
   * Check if a setting exists (either stored or has default)
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }
}
