/**
 * Project Repository
 * Database operations for projects
 */

import type { Project, ProjectSettings, RecentProject } from '@shared/types/project'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../index'

interface ProjectRow {
  id: string
  name: string
  description: string | null
  source_video_path: string
  source_video_duration_ms: number
  source_video_width: number | null
  source_video_height: number | null
  source_video_fps: number | null
  source_audio_path: string | null
  target_language: string
  source_language: string | null
  settings: string | null
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sourceVideoPath: row.source_video_path,
    sourceVideoDurationMs: row.source_video_duration_ms,
    sourceVideoWidth: row.source_video_width ?? undefined,
    sourceVideoHeight: row.source_video_height ?? undefined,
    sourceVideoFps: row.source_video_fps ?? undefined,
    sourceAudioPath: row.source_audio_path ?? undefined,
    targetLanguage: row.target_language,
    sourceLanguage: row.source_language ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    settings: row.settings ? JSON.parse(row.settings) : undefined
  }
}

export const projectRepository = {
  /**
   * Create a new project
   */
  create(data: {
    name: string
    sourceVideoPath: string
    sourceVideoDurationMs: number
    sourceVideoWidth?: number
    sourceVideoHeight?: number
    sourceVideoFps?: number
    targetLanguage: string
    sourceLanguage?: string
    settings?: ProjectSettings
  }): Project {
    const db = getDatabase()
    const id = uuidv4()

    const stmt = db.prepare(`
      INSERT INTO projects (
        id, name, source_video_path, source_video_duration_ms,
        source_video_width, source_video_height, source_video_fps,
        target_language, source_language, settings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.name,
      data.sourceVideoPath,
      data.sourceVideoDurationMs,
      data.sourceVideoWidth ?? null,
      data.sourceVideoHeight ?? null,
      data.sourceVideoFps ?? null,
      data.targetLanguage,
      data.sourceLanguage ?? null,
      data.settings ? JSON.stringify(data.settings) : null
    )

    // Add to recent projects
    this.addToRecent(id)

    return this.findById(id)!
  },

  /**
   * Find a project by ID
   */
  findById(id: string): Project | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?')
    const row = stmt.get(id) as ProjectRow | undefined

    if (!row) {
      return null
    }

    return rowToProject(row)
  },

  /**
   * Get all projects
   */
  findAll(): Project[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC')
    const rows = stmt.all() as ProjectRow[]

    return rows.map(rowToProject)
  },

  /**
   * Update a project
   */
  update(
    id: string,
    data: {
      name?: string
      description?: string
      targetLanguage?: string
      sourceLanguage?: string
      sourceAudioPath?: string
      settings?: Partial<ProjectSettings>
    }
  ): Project | null {
    const db = getDatabase()

    // First get the current project to merge settings
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

    if (data.description !== undefined) {
      updates.push('description = ?')
      values.push(data.description)
    }

    if (data.targetLanguage !== undefined) {
      updates.push('target_language = ?')
      values.push(data.targetLanguage)
    }

    if (data.sourceLanguage !== undefined) {
      updates.push('source_language = ?')
      values.push(data.sourceLanguage)
    }

    if (data.sourceAudioPath !== undefined) {
      updates.push('source_audio_path = ?')
      values.push(data.sourceAudioPath)
    }

    if (data.settings !== undefined) {
      const mergedSettings = { ...current.settings, ...data.settings }
      updates.push('settings = ?')
      values.push(JSON.stringify(mergedSettings))
    }

    if (updates.length === 0) {
      return current
    }

    values.push(id)
    const stmt = db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.findById(id)
  },

  /**
   * Delete a project
   */
  delete(id: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  /**
   * Get recent projects
   */
  getRecent(limit = 10): RecentProject[] {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT p.id, p.name, p.source_video_path, p.updated_at, rp.thumbnail_path
      FROM projects p
      LEFT JOIN recent_projects rp ON p.id = rp.project_id
      ORDER BY COALESCE(rp.last_opened_at, p.updated_at) DESC
      LIMIT ?
    `)

    const rows = stmt.all(limit) as Array<{
      id: string
      name: string
      source_video_path: string
      updated_at: string
      thumbnail_path: string | null
    }>

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sourceVideoPath: row.source_video_path,
      updatedAt: row.updated_at,
      thumbnailPath: row.thumbnail_path ?? undefined
    }))
  },

  /**
   * Add a project to recent projects
   */
  addToRecent(projectId: string, thumbnailPath?: string): void {
    const db = getDatabase()
    const stmt = db.prepare(`
      INSERT INTO recent_projects (project_id, last_opened_at, thumbnail_path)
      VALUES (?, datetime('now'), ?)
      ON CONFLICT(project_id) DO UPDATE SET
        last_opened_at = datetime('now'),
        thumbnail_path = COALESCE(excluded.thumbnail_path, recent_projects.thumbnail_path)
    `)

    stmt.run(projectId, thumbnailPath ?? null)
  },

  /**
   * Remove a project from recent projects
   */
  removeFromRecent(projectId: string): void {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM recent_projects WHERE project_id = ?')
    stmt.run(projectId)
  },

  /**
   * Check if a project exists
   */
  exists(id: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare('SELECT 1 FROM projects WHERE id = ?')
    const row = stmt.get(id)
    return row !== undefined
  }
}
