/**
 * History Repository
 * Database operations for undo/redo history
 */

import { HISTORY_MAX_SIZE } from '@shared/constants/defaults'
import { getDatabase } from '../index'

export interface HistoryEntry {
  id: number
  projectId: string
  actionType: string
  beforeState: unknown
  afterState: unknown
  timestamp: string
}

interface HistoryRow {
  id: number
  project_id: string
  action_type: string
  before_state: string
  after_state: string
  timestamp: string
}

function rowToEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    actionType: row.action_type,
    beforeState: JSON.parse(row.before_state),
    afterState: JSON.parse(row.after_state),
    timestamp: row.timestamp
  }
}

export type HistoryActionType =
  | 'segment_create'
  | 'segment_update'
  | 'segment_delete'
  | 'segment_move'
  | 'segment_split'
  | 'segment_merge'
  | 'segment_batch_update'
  | 'speaker_create'
  | 'speaker_update'
  | 'speaker_delete'
  | 'project_update'

export const historyRepository = {
  /**
   * Record a new history entry
   */
  record(
    projectId: string,
    actionType: HistoryActionType,
    beforeState: unknown,
    afterState: unknown
  ): HistoryEntry {
    const db = getDatabase()

    const stmt = db.prepare(`
      INSERT INTO history (project_id, action_type, before_state, after_state)
      VALUES (?, ?, ?, ?)
    `)

    const result = stmt.run(
      projectId,
      actionType,
      JSON.stringify(beforeState),
      JSON.stringify(afterState)
    )

    // Trim old entries to keep within max size
    this.trimOldEntries(projectId)

    return this.findById(result.lastInsertRowid as number)!
  },

  /**
   * Get a history entry by ID
   */
  findById(id: number): HistoryEntry | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM history WHERE id = ?')
    const row = stmt.get(id) as HistoryRow | undefined

    if (!row) {
      return null
    }

    return rowToEntry(row)
  },

  /**
   * Get the most recent history entry for a project
   */
  getLatest(projectId: string): HistoryEntry | null {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT * FROM history
      WHERE project_id = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    const row = stmt.get(projectId) as HistoryRow | undefined

    if (!row) {
      return null
    }

    return rowToEntry(row)
  },

  /**
   * Get history entries for a project (most recent first)
   */
  findByProject(projectId: string, limit = HISTORY_MAX_SIZE): HistoryEntry[] {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT * FROM history
      WHERE project_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    const rows = stmt.all(projectId, limit) as HistoryRow[]

    return rows.map(rowToEntry)
  },

  /**
   * Get entries before a specific entry (for undo stack)
   */
  getEntriesBefore(projectId: string, beforeId: number, limit = 10): HistoryEntry[] {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT * FROM history
      WHERE project_id = ? AND id < ?
      ORDER BY id DESC
      LIMIT ?
    `)
    const rows = stmt.all(projectId, beforeId, limit) as HistoryRow[]

    return rows.map(rowToEntry)
  },

  /**
   * Get entries after a specific entry (for redo stack)
   */
  getEntriesAfter(projectId: string, afterId: number, limit = 10): HistoryEntry[] {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT * FROM history
      WHERE project_id = ? AND id > ?
      ORDER BY id ASC
      LIMIT ?
    `)
    const rows = stmt.all(projectId, afterId, limit) as HistoryRow[]

    return rows.map(rowToEntry)
  },

  /**
   * Delete all history entries after a specific entry
   * Used when a new action is taken after undo (clears redo stack)
   */
  deleteAfter(projectId: string, afterId: number): number {
    const db = getDatabase()
    const stmt = db.prepare(`
      DELETE FROM history
      WHERE project_id = ? AND id > ?
    `)
    const result = stmt.run(projectId, afterId)
    return result.changes
  },

  /**
   * Delete a specific history entry
   */
  delete(id: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM history WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  /**
   * Clear all history for a project
   */
  clearProject(projectId: string): number {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM history WHERE project_id = ?')
    const result = stmt.run(projectId)
    return result.changes
  },

  /**
   * Trim old entries to keep within max size
   */
  trimOldEntries(projectId: string, maxSize = HISTORY_MAX_SIZE): number {
    const db = getDatabase()

    // Count current entries
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE project_id = ?')
    const { count } = countStmt.get(projectId) as { count: number }

    if (count <= maxSize) {
      return 0
    }

    // Delete oldest entries
    const deleteCount = count - maxSize
    const deleteStmt = db.prepare(`
      DELETE FROM history
      WHERE id IN (
        SELECT id FROM history
        WHERE project_id = ?
        ORDER BY id ASC
        LIMIT ?
      )
    `)
    const result = deleteStmt.run(projectId, deleteCount)
    return result.changes
  },

  /**
   * Get history count for a project
   */
  count(projectId: string): number {
    const db = getDatabase()
    const stmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE project_id = ?')
    const row = stmt.get(projectId) as { count: number }
    return row.count
  },

  /**
   * Check if there are entries to undo
   */
  canUndo(projectId: string, currentPosition?: number): boolean {
    if (currentPosition !== undefined) {
      const entries = this.getEntriesBefore(projectId, currentPosition, 1)
      return entries.length > 0
    }

    const latest = this.getLatest(projectId)
    return latest !== null
  },

  /**
   * Check if there are entries to redo
   */
  canRedo(projectId: string, currentPosition: number): boolean {
    const entries = this.getEntriesAfter(projectId, currentPosition, 1)
    return entries.length > 0
  }
}
