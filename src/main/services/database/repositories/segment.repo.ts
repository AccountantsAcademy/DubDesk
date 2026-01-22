/**
 * Segment Repository
 * Database operations for segments
 */

import type {
  Segment,
  SegmentBatchUpdate,
  SegmentCreateInput,
  SegmentStatus,
  SegmentUpdateInput
} from '@shared/types/segment'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase, runTransaction } from '../index'

interface SegmentRow {
  id: string
  project_id: string
  speaker_id: string | null
  original_text: string | null
  translated_text: string
  start_time_ms: number
  end_time_ms: number
  original_start_time_ms: number
  original_end_time_ms: number
  audio_file_path: string | null
  audio_duration_ms: number | null
  voice_id: string | null
  speed_adjustment: number
  pitch_adjustment: number
  status: string
  generation_error: string | null
  order_index: number
  audio_generated_at: string | null
  translated_text_hash: string | null
  audio_generated_voice_id: string | null
  audio_generated_duration_ms: number | null
  created_at: string
  updated_at: string
}

function rowToSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    projectId: row.project_id,
    speakerId: row.speaker_id ?? undefined,
    originalText: row.original_text ?? undefined,
    translatedText: row.translated_text,
    startTimeMs: row.start_time_ms,
    endTimeMs: row.end_time_ms,
    originalStartTimeMs: row.original_start_time_ms,
    originalEndTimeMs: row.original_end_time_ms,
    audioFilePath: row.audio_file_path ?? undefined,
    audioDurationMs: row.audio_duration_ms ?? undefined,
    voiceId: row.voice_id ?? undefined,
    speedAdjustment: row.speed_adjustment,
    pitchAdjustment: row.pitch_adjustment,
    status: row.status as SegmentStatus,
    generationError: row.generation_error ?? undefined,
    orderIndex: row.order_index,
    audioGeneratedAt: row.audio_generated_at ?? undefined,
    translatedTextHash: row.translated_text_hash ?? undefined,
    audioGeneratedVoiceId: row.audio_generated_voice_id ?? undefined,
    audioGeneratedDurationMs: row.audio_generated_duration_ms ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const segmentRepository = {
  /**
   * Create a new segment
   */
  create(data: SegmentCreateInput): Segment {
    const db = getDatabase()
    // Use provided id if given (for restoring deleted segments), otherwise generate new one
    const id = data.id ?? uuidv4()

    // Get the next order index
    const maxOrderStmt = db.prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM segments WHERE project_id = ?'
    )
    const maxOrderRow = maxOrderStmt.get(data.projectId) as { max_order: number }
    const orderIndex = maxOrderRow.max_order + 1

    const stmt = db.prepare(`
      INSERT INTO segments (
        id, project_id, speaker_id, original_text, translated_text,
        start_time_ms, end_time_ms, original_start_time_ms, original_end_time_ms,
        voice_id, speed_adjustment, pitch_adjustment, audio_file_path, audio_duration_ms,
        order_index, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `)

    stmt.run(
      id,
      data.projectId,
      data.speakerId ?? null,
      data.originalText ?? null,
      data.translatedText,
      data.startTimeMs,
      data.endTimeMs,
      data.startTimeMs, // original times start same as current
      data.endTimeMs,
      data.voiceId ?? null,
      data.speedAdjustment ?? 1.0,
      data.pitchAdjustment ?? 0,
      data.audioFilePath ?? null,
      data.audioDurationMs ?? null,
      orderIndex
    )

    return this.findById(id)!
  },

  /**
   * Create multiple segments at once
   */
  createMany(segments: SegmentCreateInput[]): Segment[] {
    return runTransaction(() => {
      const results: Segment[] = []
      for (const data of segments) {
        results.push(this.create(data))
      }
      return results
    })
  },

  /**
   * Find a segment by ID
   */
  findById(id: string): Segment | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM segments WHERE id = ?')
    const row = stmt.get(id) as SegmentRow | undefined

    if (!row) {
      return null
    }

    return rowToSegment(row)
  },

  /**
   * Get all segments for a project
   */
  findByProject(projectId: string): Segment[] {
    const db = getDatabase()
    const stmt = db.prepare(
      'SELECT * FROM segments WHERE project_id = ? ORDER BY start_time_ms ASC'
    )
    const rows = stmt.all(projectId) as SegmentRow[]

    return rows.map(rowToSegment)
  },

  /**
   * Get segments in a time range
   */
  findInTimeRange(projectId: string, startMs: number, endMs: number): Segment[] {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT * FROM segments
      WHERE project_id = ?
        AND end_time_ms > ?
        AND start_time_ms < ?
      ORDER BY start_time_ms ASC
    `)
    const rows = stmt.all(projectId, startMs, endMs) as SegmentRow[]

    return rows.map(rowToSegment)
  },

  /**
   * Get segments by status
   */
  findByStatus(projectId: string, status: SegmentStatus): Segment[] {
    const db = getDatabase()
    const stmt = db.prepare(
      'SELECT * FROM segments WHERE project_id = ? AND status = ? ORDER BY order_index ASC'
    )
    const rows = stmt.all(projectId, status) as SegmentRow[]

    return rows.map(rowToSegment)
  },

  /**
   * Update a segment
   */
  update(id: string, data: SegmentUpdateInput): Segment | null {
    const db = getDatabase()
    const current = this.findById(id)

    if (!current) {
      return null
    }

    const updates: string[] = []
    const values: unknown[] = []

    if (data.speakerId !== undefined) {
      updates.push('speaker_id = ?')
      values.push(data.speakerId)
    }

    if (data.originalText !== undefined) {
      updates.push('original_text = ?')
      values.push(data.originalText)
    }

    if (data.translatedText !== undefined) {
      updates.push('translated_text = ?')
      values.push(data.translatedText)
    }

    if (data.startTimeMs !== undefined) {
      updates.push('start_time_ms = ?')
      values.push(data.startTimeMs)
    }

    if (data.endTimeMs !== undefined) {
      updates.push('end_time_ms = ?')
      values.push(data.endTimeMs)
    }

    if (data.voiceId !== undefined) {
      updates.push('voice_id = ?')
      values.push(data.voiceId)
    }

    if (data.speedAdjustment !== undefined) {
      updates.push('speed_adjustment = ?')
      values.push(data.speedAdjustment)
    }

    if (data.pitchAdjustment !== undefined) {
      updates.push('pitch_adjustment = ?')
      values.push(data.pitchAdjustment)
    }

    if (data.status !== undefined) {
      updates.push('status = ?')
      values.push(data.status)
    }

    if (data.generationError !== undefined) {
      updates.push('generation_error = ?')
      values.push(data.generationError)
    }

    if (data.audioGeneratedAt !== undefined) {
      updates.push('audio_generated_at = ?')
      values.push(data.audioGeneratedAt)
    }

    if (data.translatedTextHash !== undefined) {
      updates.push('translated_text_hash = ?')
      values.push(data.translatedTextHash)
    }

    if (data.audioGeneratedVoiceId !== undefined) {
      updates.push('audio_generated_voice_id = ?')
      values.push(data.audioGeneratedVoiceId)
    }

    if (data.audioFilePath !== undefined) {
      updates.push('audio_file_path = ?')
      values.push(data.audioFilePath)
    }

    if (data.audioDurationMs !== undefined) {
      updates.push('audio_duration_ms = ?')
      values.push(data.audioDurationMs)
    }

    if (data.audioGeneratedDurationMs !== undefined) {
      updates.push('audio_generated_duration_ms = ?')
      values.push(data.audioGeneratedDurationMs)
    }

    if (updates.length === 0) {
      return current
    }

    values.push(id)
    const stmt = db.prepare(`UPDATE segments SET ${updates.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.findById(id)
  },

  /**
   * Update the audio file path and duration after generation
   */
  updateAudio(
    id: string,
    audioFilePath: string,
    audioDurationMs: number,
    translatedTextHash?: string
  ): Segment | null {
    const db = getDatabase()
    const audioGeneratedAt = new Date().toISOString()

    // Get the current segment to calculate its duration
    const current = this.findById(id)
    const segmentDurationMs = current ? current.endTimeMs - current.startTimeMs : null

    const stmt = db.prepare(`
      UPDATE segments
      SET audio_file_path = ?, audio_duration_ms = ?, status = 'ready',
          audio_generated_at = ?, translated_text_hash = COALESCE(?, translated_text_hash),
          audio_generated_duration_ms = ?
      WHERE id = ?
    `)
    stmt.run(
      audioFilePath,
      audioDurationMs,
      audioGeneratedAt,
      translatedTextHash ?? null,
      segmentDurationMs,
      id
    )

    return this.findById(id)
  },

  /**
   * Batch update segments
   */
  batchUpdate(updates: SegmentBatchUpdate[]): Segment[] {
    return runTransaction(() => {
      const results: Segment[] = []

      for (const { id, updates: data } of updates) {
        const segment = this.update(id, data)
        if (segment) {
          results.push(segment)
        }
      }

      return results
    })
  },

  /**
   * Delete a segment
   */
  delete(id: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM segments WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  /**
   * Delete multiple segments
   */
  deleteMany(ids: string[]): number {
    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    const stmt = db.prepare(`DELETE FROM segments WHERE id IN (${placeholders})`)
    const result = stmt.run(...ids)
    return result.changes
  },

  /**
   * Split a segment at a given time
   * Returns the two new segments
   */
  split(id: string, splitTimeMs: number): [Segment, Segment] | null {
    const segment = this.findById(id)

    if (!segment) {
      return null
    }

    // Validate split time is within segment bounds
    if (splitTimeMs <= segment.startTimeMs || splitTimeMs >= segment.endTimeMs) {
      throw new Error('Split time must be within segment bounds')
    }

    return runTransaction(() => {
      // Calculate text split position (approximate by time ratio)
      const totalDuration = segment.endTimeMs - segment.startTimeMs
      const firstDuration = splitTimeMs - segment.startTimeMs
      const ratio = firstDuration / totalDuration

      const text = segment.translatedText
      const splitIndex = Math.round(text.length * ratio)
      const firstText = text.substring(0, splitIndex).trim()
      const secondText = text.substring(splitIndex).trim()

      // Create first segment (update existing)
      this.update(id, {
        endTimeMs: splitTimeMs,
        translatedText: firstText || segment.translatedText,
        status: 'pending' // Need to regenerate
      })

      // Create second segment
      const secondSegment = this.create({
        projectId: segment.projectId,
        speakerId: segment.speakerId,
        originalText: segment.originalText,
        translatedText: secondText || segment.translatedText,
        startTimeMs: splitTimeMs,
        endTimeMs: segment.endTimeMs,
        voiceId: segment.voiceId
      })

      // Re-fetch the first segment
      const firstSegment = this.findById(id)!

      return [firstSegment, secondSegment]
    })
  },

  /**
   * Merge multiple segments into one
   * Returns the merged segment
   */
  merge(ids: string[]): Segment | null {
    if (ids.length < 2) {
      throw new Error('Need at least 2 segments to merge')
    }

    // Get all segments and sort by start time
    const segments = ids
      .map((id) => this.findById(id))
      .filter((s): s is Segment => s !== null)
      .sort((a, b) => a.startTimeMs - b.startTimeMs)

    if (segments.length !== ids.length) {
      throw new Error('Some segments not found')
    }

    // Verify all segments are from the same project
    const projectId = segments[0].projectId
    if (!segments.every((s) => s.projectId === projectId)) {
      throw new Error('All segments must be from the same project')
    }

    return runTransaction(() => {
      // Keep the first segment, update it to span all
      const first = segments[0]
      const last = segments[segments.length - 1]

      // Combine all translated text
      const combinedTranslatedText = segments.map((s) => s.translatedText).join(' ')

      // Combine all original text
      const combinedOriginalText = segments
        .map((s) => s.originalText)
        .filter(Boolean)
        .join(' ')

      // Update the first segment - clear audio fields since text changed
      this.update(first.id, {
        endTimeMs: last.endTimeMs,
        originalText: combinedOriginalText || first.originalText,
        translatedText: combinedTranslatedText,
        status: 'pending', // Need to regenerate
        // Clear audio-related fields since the text has changed
        audioFilePath: null,
        audioDurationMs: null,
        audioGeneratedAt: null,
        translatedTextHash: null,
        audioGeneratedVoiceId: null,
        audioGeneratedDurationMs: null
      })

      // Delete all other segments
      const idsToDelete = ids.slice(1)
      this.deleteMany(idsToDelete)

      return this.findById(first.id)
    })
  },

  /**
   * Reorder segments (update order_index)
   */
  reorder(_projectId: string, orderedIds: string[]): void {
    const db = getDatabase()

    runTransaction(() => {
      const stmt = db.prepare('UPDATE segments SET order_index = ? WHERE id = ?')

      orderedIds.forEach((id, index) => {
        stmt.run(index, id)
      })
    })
  },

  /**
   * Get the count of segments by status for a project
   */
  getStatusCounts(projectId: string): Record<SegmentStatus, number> {
    const db = getDatabase()
    const stmt = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM segments
      WHERE project_id = ?
      GROUP BY status
    `)

    const rows = stmt.all(projectId) as Array<{ status: string; count: number }>

    const counts: Record<SegmentStatus, number> = {
      pending: 0,
      generating: 0,
      ready: 0,
      error: 0
    }

    for (const row of rows) {
      counts[row.status as SegmentStatus] = row.count
    }

    return counts
  }
}
