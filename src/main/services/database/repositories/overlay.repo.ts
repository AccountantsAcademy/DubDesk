/**
 * Overlay Repository
 * Database operations for image overlays
 */

import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type {
  ImageOverlay,
  ImageOverlayCreateInput,
  ImageOverlayUpdateInput
} from '@shared/types/overlay'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../index'

interface OverlayRow {
  id: string
  project_id: string
  image_path: string
  original_filename: string
  start_time_ms: number
  end_time_ms: number
  position_x: number
  position_y: number
  width_fraction: number
  height_fraction: number
  z_index: number
  opacity: number
  created_at: string
  updated_at: string
}

function rowToOverlay(row: OverlayRow): ImageOverlay {
  return {
    id: row.id,
    projectId: row.project_id,
    imagePath: row.image_path,
    originalFilename: row.original_filename,
    startTimeMs: row.start_time_ms,
    endTimeMs: row.end_time_ms,
    positionX: row.position_x,
    positionY: row.position_y,
    widthFraction: row.width_fraction,
    heightFraction: row.height_fraction,
    zIndex: row.z_index,
    opacity: row.opacity,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const overlayRepository = {
  /**
   * Create a new image overlay
   * Copies the source image into the project directory
   */
  create(data: ImageOverlayCreateInput): ImageOverlay {
    const db = getDatabase()
    const id = uuidv4()

    // Copy image to project directory
    const projectDir = path.join(app.getPath('userData'), 'projects', data.projectId)
    const overlaysDir = path.join(projectDir, 'overlays')
    if (!existsSync(overlaysDir)) {
      mkdirSync(overlaysDir, { recursive: true })
    }

    const ext = path.extname(data.sourceImagePath)
    const originalFilename = path.basename(data.sourceImagePath)
    const destPath = path.join(overlaysDir, `${id}${ext}`)
    copyFileSync(data.sourceImagePath, destPath)

    const stmt = db.prepare(`
      INSERT INTO image_overlays (id, project_id, image_path, original_filename, start_time_ms, end_time_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(id, data.projectId, destPath, originalFilename, data.startTimeMs, data.endTimeMs)

    return this.findById(id)!
  },

  /**
   * Find an overlay by ID
   */
  findById(id: string): ImageOverlay | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM image_overlays WHERE id = ?')
    const row = stmt.get(id) as OverlayRow | undefined
    return row ? rowToOverlay(row) : null
  },

  /**
   * Find all overlays for a project, ordered by start time
   */
  findByProject(projectId: string): ImageOverlay[] {
    const db = getDatabase()
    const stmt = db.prepare(
      'SELECT * FROM image_overlays WHERE project_id = ? ORDER BY start_time_ms ASC'
    )
    const rows = stmt.all(projectId) as OverlayRow[]
    return rows.map(rowToOverlay)
  },

  /**
   * Update an overlay
   */
  update(id: string, data: ImageOverlayUpdateInput): ImageOverlay | null {
    const db = getDatabase()
    const fields: string[] = []
    const values: unknown[] = []

    if (data.startTimeMs !== undefined) {
      fields.push('start_time_ms = ?')
      values.push(data.startTimeMs)
    }
    if (data.endTimeMs !== undefined) {
      fields.push('end_time_ms = ?')
      values.push(data.endTimeMs)
    }
    if (data.positionX !== undefined) {
      fields.push('position_x = ?')
      values.push(data.positionX)
    }
    if (data.positionY !== undefined) {
      fields.push('position_y = ?')
      values.push(data.positionY)
    }
    if (data.widthFraction !== undefined) {
      fields.push('width_fraction = ?')
      values.push(data.widthFraction)
    }
    if (data.heightFraction !== undefined) {
      fields.push('height_fraction = ?')
      values.push(data.heightFraction)
    }
    if (data.zIndex !== undefined) {
      fields.push('z_index = ?')
      values.push(data.zIndex)
    }
    if (data.opacity !== undefined) {
      fields.push('opacity = ?')
      values.push(data.opacity)
    }

    if (fields.length === 0) return this.findById(id)

    fields.push("updated_at = datetime('now')")
    values.push(id)

    const stmt = db.prepare(`UPDATE image_overlays SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.findById(id)
  },

  /**
   * Delete an overlay and its image file
   */
  delete(id: string): boolean {
    const db = getDatabase()

    // Get the overlay first to delete the image file
    const overlay = this.findById(id)
    if (!overlay) return false

    const stmt = db.prepare('DELETE FROM image_overlays WHERE id = ?')
    const result = stmt.run(id)

    // Clean up the image file
    if (overlay.imagePath && existsSync(overlay.imagePath)) {
      try {
        unlinkSync(overlay.imagePath)
      } catch (err) {
        console.error('[Overlay] Failed to delete image file:', err)
      }
    }

    return result.changes > 0
  }
}
