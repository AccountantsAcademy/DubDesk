/**
 * Voice Repository
 * Database operations for cached voice metadata
 */

import type { TTSVoice } from '@shared/types/ipc'
import { getDatabase, runTransaction } from '../index'

interface VoiceRow {
  id: string
  provider: string
  provider_voice_id: string
  name: string
  description: string | null
  preview_url: string | null
  labels: string | null
  cached_at: string
}

function rowToVoice(row: VoiceRow): TTSVoice {
  return {
    id: row.id,
    provider: row.provider as 'elevenlabs',
    providerId: row.provider_voice_id,
    name: row.name,
    description: row.description ?? undefined,
    previewUrl: row.preview_url ?? undefined,
    labels: row.labels ? JSON.parse(row.labels) : {}
  }
}

export const voiceRepository = {
  /**
   * Get a voice by ID
   */
  findById(id: string): TTSVoice | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM voices WHERE id = ?')
    const row = stmt.get(id) as VoiceRow | undefined

    if (!row) {
      return null
    }

    return rowToVoice(row)
  },

  /**
   * Get a voice by provider and provider voice ID
   */
  findByProvider(provider: string, providerVoiceId: string): TTSVoice | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM voices WHERE provider = ? AND provider_voice_id = ?')
    const row = stmt.get(provider, providerVoiceId) as VoiceRow | undefined

    if (!row) {
      return null
    }

    return rowToVoice(row)
  },

  /**
   * Get all cached voices
   */
  findAll(): TTSVoice[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM voices ORDER BY name ASC')
    const rows = stmt.all() as VoiceRow[]

    return rows.map(rowToVoice)
  },

  /**
   * Get all voices for a specific provider
   */
  findByProviderName(provider: string): TTSVoice[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM voices WHERE provider = ? ORDER BY name ASC')
    const rows = stmt.all(provider) as VoiceRow[]

    return rows.map(rowToVoice)
  },

  /**
   * Save or update a voice
   */
  upsert(voice: TTSVoice): void {
    const db = getDatabase()
    const stmt = db.prepare(`
      INSERT INTO voices (id, provider, provider_voice_id, name, description, preview_url, labels)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        preview_url = excluded.preview_url,
        labels = excluded.labels,
        cached_at = datetime('now')
    `)

    stmt.run(
      voice.id,
      voice.provider,
      voice.providerId,
      voice.name,
      voice.description ?? null,
      voice.previewUrl ?? null,
      voice.labels ? JSON.stringify(voice.labels) : null
    )
  },

  /**
   * Save multiple voices at once
   * Replaces all existing voices for the provider
   */
  replaceAll(provider: string, voices: TTSVoice[]): void {
    runTransaction(() => {
      const db = getDatabase()

      // Delete existing voices for this provider
      const deleteStmt = db.prepare('DELETE FROM voices WHERE provider = ?')
      deleteStmt.run(provider)

      // Insert new voices
      for (const voice of voices) {
        this.upsert(voice)
      }
    })
  },

  /**
   * Delete a voice
   */
  delete(id: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM voices WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  /**
   * Clear all cached voices
   */
  clearAll(): void {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM voices')
    stmt.run()
  },

  /**
   * Clear cached voices for a specific provider
   */
  clearByProvider(provider: string): void {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM voices WHERE provider = ?')
    stmt.run(provider)
  },

  /**
   * Check if cache is stale (older than specified hours)
   */
  isCacheStale(provider: string, maxAgeHours: number = 24): boolean {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT cached_at FROM voices
      WHERE provider = ?
      ORDER BY cached_at DESC
      LIMIT 1
    `)
    const row = stmt.get(provider) as { cached_at: string } | undefined

    if (!row) {
      return true // No cache exists
    }

    const cachedAt = new Date(row.cached_at)
    const maxAge = maxAgeHours * 60 * 60 * 1000 // Convert to ms
    return Date.now() - cachedAt.getTime() > maxAge
  },

  /**
   * Get voice count
   */
  count(provider?: string): number {
    const db = getDatabase()

    if (provider) {
      const stmt = db.prepare('SELECT COUNT(*) as count FROM voices WHERE provider = ?')
      const row = stmt.get(provider) as { count: number }
      return row.count
    }

    const stmt = db.prepare('SELECT COUNT(*) as count FROM voices')
    const row = stmt.get() as { count: number }
    return row.count
  }
}
