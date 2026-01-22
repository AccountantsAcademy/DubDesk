/**
 * Speaker Repository
 * Database operations for speakers
 */

import type { Speaker, SpeakerCreateInput } from '@shared/types/segment'
import { SPEAKER_COLORS } from '@shared/types/segment'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../index'

interface SpeakerRow {
  id: string
  project_id: string
  name: string
  default_voice_id: string | null
  color: string
  created_at: string
  updated_at: string
}

function rowToSpeaker(row: SpeakerRow): Speaker {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    defaultVoiceId: row.default_voice_id ?? undefined,
    color: row.color
  }
}

export const speakerRepository = {
  /**
   * Create a new speaker
   */
  create(data: SpeakerCreateInput): Speaker {
    const db = getDatabase()
    const id = uuidv4()

    // If no color provided, get the next available color
    let color = data.color
    if (!color) {
      const existingSpeakers = this.findByProject(data.projectId)
      const usedColors = new Set(existingSpeakers.map((s) => s.color))

      for (const c of SPEAKER_COLORS) {
        if (!usedColors.has(c)) {
          color = c
          break
        }
      }

      // If all colors are used, cycle back
      if (!color) {
        color = SPEAKER_COLORS[existingSpeakers.length % SPEAKER_COLORS.length]
      }
    }

    const stmt = db.prepare(`
      INSERT INTO speakers (id, project_id, name, default_voice_id, color)
      VALUES (?, ?, ?, ?, ?)
    `)

    stmt.run(id, data.projectId, data.name, data.defaultVoiceId ?? null, color)

    return this.findById(id)!
  },

  /**
   * Find a speaker by ID
   */
  findById(id: string): Speaker | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM speakers WHERE id = ?')
    const row = stmt.get(id) as SpeakerRow | undefined

    if (!row) {
      return null
    }

    return rowToSpeaker(row)
  },

  /**
   * Get all speakers for a project
   */
  findByProject(projectId: string): Speaker[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM speakers WHERE project_id = ? ORDER BY name ASC')
    const rows = stmt.all(projectId) as SpeakerRow[]

    return rows.map(rowToSpeaker)
  },

  /**
   * Find a speaker by name within a project
   */
  findByName(projectId: string, name: string): Speaker | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM speakers WHERE project_id = ? AND name = ?')
    const row = stmt.get(projectId, name) as SpeakerRow | undefined

    if (!row) {
      return null
    }

    return rowToSpeaker(row)
  },

  /**
   * Update a speaker
   */
  update(
    id: string,
    data: { name?: string; defaultVoiceId?: string; color?: string }
  ): Speaker | null {
    const db = getDatabase()
    const current = this.findById(id)

    if (!current) {
      return null
    }

    const updates: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }

    if (data.defaultVoiceId !== undefined) {
      updates.push('default_voice_id = ?')
      values.push(data.defaultVoiceId)
    }

    if (data.color !== undefined) {
      updates.push('color = ?')
      values.push(data.color)
    }

    if (updates.length === 0) {
      return current
    }

    values.push(id)
    const stmt = db.prepare(`UPDATE speakers SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.findById(id)
  },

  /**
   * Delete a speaker
   */
  delete(id: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM speakers WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  /**
   * Get or create a speaker by name
   * Used during import when we want to reuse existing speakers
   */
  getOrCreate(projectId: string, name: string): Speaker {
    const existing = this.findByName(projectId, name)
    if (existing) {
      return existing
    }

    return this.create({ projectId, name })
  }
}
