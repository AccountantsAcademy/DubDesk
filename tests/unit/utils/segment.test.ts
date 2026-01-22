import type { Speaker } from '@shared/types/segment'
import { getNextSpeakerColor, SPEAKER_COLORS } from '@shared/types/segment'
import { describe, expect, it } from 'vitest'

describe('Segment Utils', () => {
  describe('getNextSpeakerColor', () => {
    it('should return first color when no speakers exist', () => {
      const existingSpeakers: Speaker[] = []
      const color = getNextSpeakerColor(existingSpeakers)
      expect(color).toBe(SPEAKER_COLORS[0])
    })

    it('should return next unused color', () => {
      const existingSpeakers: Speaker[] = [
        { id: '1', projectId: 'p1', name: 'Speaker 1', color: SPEAKER_COLORS[0] }
      ]
      const color = getNextSpeakerColor(existingSpeakers)
      expect(color).toBe(SPEAKER_COLORS[1])
    })

    it('should skip used colors', () => {
      const existingSpeakers: Speaker[] = [
        { id: '1', projectId: 'p1', name: 'Speaker 1', color: SPEAKER_COLORS[0] },
        { id: '2', projectId: 'p1', name: 'Speaker 2', color: SPEAKER_COLORS[1] },
        { id: '3', projectId: 'p1', name: 'Speaker 3', color: SPEAKER_COLORS[2] }
      ]
      const color = getNextSpeakerColor(existingSpeakers)
      expect(color).toBe(SPEAKER_COLORS[3])
    })

    it('should cycle back when all colors are used', () => {
      const existingSpeakers: Speaker[] = SPEAKER_COLORS.map((color, index) => ({
        id: String(index),
        projectId: 'p1',
        name: `Speaker ${index + 1}`,
        color
      }))
      const color = getNextSpeakerColor(existingSpeakers)
      // Should cycle back based on speaker count
      expect(color).toBe(SPEAKER_COLORS[existingSpeakers.length % SPEAKER_COLORS.length])
    })

    it('should handle non-sequential color usage', () => {
      const existingSpeakers: Speaker[] = [
        { id: '1', projectId: 'p1', name: 'Speaker 1', color: SPEAKER_COLORS[0] },
        { id: '2', projectId: 'p1', name: 'Speaker 2', color: SPEAKER_COLORS[2] },
        { id: '3', projectId: 'p1', name: 'Speaker 3', color: SPEAKER_COLORS[4] }
      ]
      const color = getNextSpeakerColor(existingSpeakers)
      // Should return first unused color
      expect(color).toBe(SPEAKER_COLORS[1])
    })
  })
})
