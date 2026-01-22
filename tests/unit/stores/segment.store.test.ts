import {
  isSegmentStale,
  selectSegmentById,
  selectSegmentsBySpeaker,
  selectSelectedSegments,
  selectSpeakerById,
  selectStaleSegmentCount,
  selectStaleSegments,
  useSegmentStore
} from '@renderer/stores/segment.store'
import type { Segment, Speaker } from '@shared/types/segment'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Helper to create mock segments
function createMockSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-1',
    projectId: 'proj-1',
    translatedText: 'Hello world',
    startTimeMs: 0,
    endTimeMs: 5000,
    originalStartTimeMs: 0,
    originalEndTimeMs: 5000,
    speedAdjustment: 1,
    pitchAdjustment: 0,
    status: 'pending',
    orderIndex: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides
  }
}

// Helper to create mock speakers
function createMockSpeaker(overrides: Partial<Speaker> = {}): Speaker {
  return {
    id: 'speaker-1',
    projectId: 'proj-1',
    name: 'Speaker 1',
    color: '#ff6b6b',
    ...overrides
  }
}

describe('SegmentStore', () => {
  beforeEach(() => {
    useSegmentStore.getState().reset()
    vi.clearAllMocks()
  })

  describe('isSegmentStale', () => {
    it('should return false for segment with no translated text', () => {
      const segment = createMockSegment({ translatedText: '' })
      expect(isSegmentStale(segment)).toBe(false)
    })

    it('should return false for segment with only whitespace text', () => {
      const segment = createMockSegment({ translatedText: '   ' })
      expect(isSegmentStale(segment)).toBe(false)
    })

    it('should return true for segment with text but no audio', () => {
      const segment = createMockSegment({ audioFilePath: undefined })
      expect(isSegmentStale(segment)).toBe(true)
    })

    it('should return true for segment with text and audio but no hash', () => {
      const segment = createMockSegment({
        audioFilePath: '/path/to/audio.mp3',
        translatedTextHash: undefined
      })
      expect(isSegmentStale(segment)).toBe(true)
    })

    it('should return true when text hash does not match stored hash', () => {
      const segment = createMockSegment({
        audioFilePath: '/path/to/audio.mp3',
        translatedText: 'New text',
        translatedTextHash: 'old-hash'
      })
      expect(isSegmentStale(segment)).toBe(true)
    })

    it('should return false when text hash matches stored hash', () => {
      // Hash of "Hello world" using djb2
      const segment = createMockSegment({
        audioFilePath: '/path/to/audio.mp3',
        translatedText: 'Hello world',
        translatedTextHash: '33c13465' // Actual hash of "Hello world"
      })
      expect(isSegmentStale(segment)).toBe(false)
    })
  })

  describe('loadSegments', () => {
    it('should load segments successfully', async () => {
      const mockSegments = [createMockSegment(), createMockSegment({ id: 'seg-2' })]
      vi.mocked(window.dubdesk.segment.getAll).mockResolvedValue({
        success: true,
        segments: mockSegments
      })

      await useSegmentStore.getState().loadSegments('proj-1')

      expect(window.dubdesk.segment.getAll).toHaveBeenCalledWith('proj-1')
      expect(useSegmentStore.getState().segments).toEqual(mockSegments)
      expect(useSegmentStore.getState().isLoading).toBe(false)
    })

    it('should set loading state while loading', async () => {
      vi.mocked(window.dubdesk.segment.getAll).mockImplementation(
        () =>
          new Promise((resolve) => {
            expect(useSegmentStore.getState().isLoading).toBe(true)
            resolve({ success: true, segments: [] })
          })
      )

      await useSegmentStore.getState().loadSegments('proj-1')
    })

    it('should handle errors when loading segments', async () => {
      vi.mocked(window.dubdesk.segment.getAll).mockResolvedValue({
        success: false,
        error: 'Database error'
      })

      await expect(useSegmentStore.getState().loadSegments('proj-1')).rejects.toThrow(
        'Database error'
      )
      expect(useSegmentStore.getState().error).toBe('Database error')
    })

    it('should handle non-Error exceptions when loading segments', async () => {
      vi.mocked(window.dubdesk.segment.getAll).mockRejectedValue('String error')

      await expect(useSegmentStore.getState().loadSegments('proj-1')).rejects.toBe('String error')

      expect(useSegmentStore.getState().error).toBe('Failed to load segments')
      expect(useSegmentStore.getState().isLoading).toBe(false)
    })
  })

  describe('createSegment', () => {
    it('should create a segment successfully', async () => {
      const mockSegment = createMockSegment()
      vi.mocked(window.dubdesk.segment.create).mockResolvedValue({
        success: true,
        segment: mockSegment
      })

      const result = await useSegmentStore.getState().createSegment({
        projectId: 'proj-1',
        translatedText: 'Hello world',
        startTimeMs: 0,
        endTimeMs: 5000
      })

      expect(result).toEqual(mockSegment)
      expect(useSegmentStore.getState().segments).toContain(mockSegment)
    })

    it('should handle errors when creating segment', async () => {
      vi.mocked(window.dubdesk.segment.create).mockResolvedValue({
        success: false,
        error: 'Creation failed'
      })

      await expect(
        useSegmentStore.getState().createSegment({
          projectId: 'proj-1',
          translatedText: 'Hello',
          startTimeMs: 0,
          endTimeMs: 1000
        })
      ).rejects.toThrow('Creation failed')
    })

    it('should handle non-Error exceptions when creating segment', async () => {
      vi.mocked(window.dubdesk.segment.create).mockRejectedValue('Database error')

      await expect(
        useSegmentStore.getState().createSegment({
          projectId: 'proj-1',
          translatedText: 'Hello',
          startTimeMs: 0,
          endTimeMs: 1000
        })
      ).rejects.toBe('Database error')

      expect(useSegmentStore.getState().error).toBe('Failed to create segment')
    })
  })

  describe('updateSegment', () => {
    it('should update a segment successfully', async () => {
      const mockSegment = createMockSegment()
      const updatedSegment = { ...mockSegment, translatedText: 'Updated text' }
      useSegmentStore.setState({ segments: [mockSegment] })

      vi.mocked(window.dubdesk.segment.update).mockResolvedValue({
        success: true,
        segment: updatedSegment
      })

      await useSegmentStore.getState().updateSegment('seg-1', { translatedText: 'Updated text' })

      expect(useSegmentStore.getState().segments[0].translatedText).toBe('Updated text')
    })

    it('should handle errors when updating segment', async () => {
      vi.mocked(window.dubdesk.segment.update).mockResolvedValue({
        success: false,
        error: 'Update failed'
      })

      await expect(
        useSegmentStore.getState().updateSegment('seg-1', { translatedText: 'New text' })
      ).rejects.toThrow('Update failed')
    })
  })

  describe('deleteSegment', () => {
    it('should delete a segment successfully', async () => {
      const mockSegment = createMockSegment()
      useSegmentStore.setState({ segments: [mockSegment], selectedSegmentIds: new Set(['seg-1']) })

      vi.mocked(window.dubdesk.segment.delete).mockResolvedValue({ success: true })

      await useSegmentStore.getState().deleteSegment('seg-1')

      expect(useSegmentStore.getState().segments).toHaveLength(0)
      expect(useSegmentStore.getState().selectedSegmentIds.has('seg-1')).toBe(false)
    })

    it('should handle errors when deleting segment', async () => {
      vi.mocked(window.dubdesk.segment.delete).mockResolvedValue({
        success: false,
        error: 'Delete failed'
      })

      await expect(useSegmentStore.getState().deleteSegment('seg-1')).rejects.toThrow(
        'Delete failed'
      )
    })
  })

  describe('deleteSelectedSegments', () => {
    it('should delete all selected segments', async () => {
      const segments = [
        createMockSegment({ id: 'seg-1' }),
        createMockSegment({ id: 'seg-2' }),
        createMockSegment({ id: 'seg-3' })
      ]
      useSegmentStore.setState({
        segments,
        selectedSegmentIds: new Set(['seg-1', 'seg-3'])
      })

      vi.mocked(window.dubdesk.segment.delete).mockResolvedValue({ success: true })

      await useSegmentStore.getState().deleteSelectedSegments()

      expect(useSegmentStore.getState().segments).toHaveLength(1)
      expect(useSegmentStore.getState().segments[0].id).toBe('seg-2')
      expect(useSegmentStore.getState().selectedSegmentIds.size).toBe(0)
    })

    it('should do nothing when no segments are selected', async () => {
      useSegmentStore.setState({ segments: [createMockSegment()], selectedSegmentIds: new Set() })

      await useSegmentStore.getState().deleteSelectedSegments()

      expect(window.dubdesk.segment.delete).not.toHaveBeenCalled()
    })

    it('should handle errors when deleting selected segments', async () => {
      const segments = [createMockSegment({ id: 'seg-1' })]
      useSegmentStore.setState({
        segments,
        selectedSegmentIds: new Set(['seg-1'])
      })

      vi.mocked(window.dubdesk.segment.delete).mockRejectedValue(new Error('Delete failed'))

      await expect(useSegmentStore.getState().deleteSelectedSegments()).rejects.toThrow(
        'Delete failed'
      )

      expect(useSegmentStore.getState().error).toBe('Delete failed')
    })

    it('should handle non-Error exceptions when deleting selected segments', async () => {
      const segments = [createMockSegment({ id: 'seg-1' })]
      useSegmentStore.setState({
        segments,
        selectedSegmentIds: new Set(['seg-1'])
      })

      vi.mocked(window.dubdesk.segment.delete).mockRejectedValue('Database error')

      await expect(useSegmentStore.getState().deleteSelectedSegments()).rejects.toBe(
        'Database error'
      )

      expect(useSegmentStore.getState().error).toBe('Failed to delete segments')
    })
  })

  describe('batchUpdateSegments', () => {
    it('should batch update segments successfully', async () => {
      const segments = [createMockSegment({ id: 'seg-1' }), createMockSegment({ id: 'seg-2' })]
      useSegmentStore.setState({ segments })

      const updatedSegments = [
        { ...segments[0], translatedText: 'Updated 1' },
        { ...segments[1], translatedText: 'Updated 2' }
      ]
      vi.mocked(window.dubdesk.segment.batchUpdate).mockResolvedValue({
        success: true,
        segments: updatedSegments
      })

      await useSegmentStore.getState().batchUpdateSegments([
        { id: 'seg-1', updates: { translatedText: 'Updated 1' } },
        { id: 'seg-2', updates: { translatedText: 'Updated 2' } }
      ])

      expect(useSegmentStore.getState().segments[0].translatedText).toBe('Updated 1')
      expect(useSegmentStore.getState().segments[1].translatedText).toBe('Updated 2')
    })

    it('should preserve segments not in response', async () => {
      const segments = [
        createMockSegment({ id: 'seg-1', translatedText: 'Original 1' }),
        createMockSegment({ id: 'seg-2', translatedText: 'Original 2' }),
        createMockSegment({ id: 'seg-3', translatedText: 'Original 3' })
      ]
      useSegmentStore.setState({ segments })

      // Response only contains seg-1, not seg-2 or seg-3
      vi.mocked(window.dubdesk.segment.batchUpdate).mockResolvedValue({
        success: true,
        segments: [{ ...segments[0], translatedText: 'Updated 1' }]
      })

      await useSegmentStore
        .getState()
        .batchUpdateSegments([{ id: 'seg-1', updates: { translatedText: 'Updated 1' } }])

      expect(useSegmentStore.getState().segments[0].translatedText).toBe('Updated 1')
      // seg-2 and seg-3 should be preserved as-is
      expect(useSegmentStore.getState().segments[1].translatedText).toBe('Original 2')
      expect(useSegmentStore.getState().segments[2].translatedText).toBe('Original 3')
    })

    it('should handle error when response.success is false', async () => {
      const segments = [createMockSegment({ id: 'seg-1' })]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.batchUpdate).mockResolvedValue({
        success: false,
        error: 'Batch update failed'
      })

      await expect(
        useSegmentStore
          .getState()
          .batchUpdateSegments([{ id: 'seg-1', updates: { translatedText: 'New text' } }])
      ).rejects.toThrow('Batch update failed')

      expect(useSegmentStore.getState().error).toBe('Batch update failed')
    })

    it('should handle non-Error exception when batch updating', async () => {
      const segments = [createMockSegment({ id: 'seg-1' })]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.batchUpdate).mockRejectedValue('Database error')

      await expect(
        useSegmentStore
          .getState()
          .batchUpdateSegments([{ id: 'seg-1', updates: { translatedText: 'New text' } }])
      ).rejects.toBe('Database error')

      expect(useSegmentStore.getState().error).toBe('Failed to batch update segments')
    })
  })

  describe('splitSegment', () => {
    it('should split a segment into two', async () => {
      const segment = createMockSegment({ id: 'seg-1', startTimeMs: 0, endTimeMs: 10000 })
      useSegmentStore.setState({ segments: [segment] })

      const splitSegments: [Segment, Segment] = [
        createMockSegment({ id: 'seg-1', endTimeMs: 5000 }),
        createMockSegment({ id: 'seg-1-split', startTimeMs: 5000 })
      ]
      vi.mocked(window.dubdesk.segment.split).mockResolvedValue({
        success: true,
        segments: splitSegments
      })

      const result = await useSegmentStore.getState().splitSegment('seg-1', 5000)

      expect(result).toEqual(splitSegments)
      expect(useSegmentStore.getState().segments).toHaveLength(2)
    })

    it('should handle error when response.success is false', async () => {
      const segment = createMockSegment({ id: 'seg-1' })
      useSegmentStore.setState({ segments: [segment] })

      vi.mocked(window.dubdesk.segment.split).mockResolvedValue({
        success: false,
        error: 'Split point out of bounds'
      })

      await expect(useSegmentStore.getState().splitSegment('seg-1', 5000)).rejects.toThrow(
        'Split point out of bounds'
      )

      expect(useSegmentStore.getState().error).toBe('Split point out of bounds')
    })

    it('should handle error when splitting fails', async () => {
      const segment = createMockSegment({ id: 'seg-1' })
      useSegmentStore.setState({ segments: [segment] })

      vi.mocked(window.dubdesk.segment.split).mockRejectedValue(new Error('Database error'))

      await expect(useSegmentStore.getState().splitSegment('seg-1', 5000)).rejects.toThrow(
        'Database error'
      )

      expect(useSegmentStore.getState().error).toBe('Database error')
    })

    it('should handle non-Error exception when splitting', async () => {
      const segment = createMockSegment({ id: 'seg-1' })
      useSegmentStore.setState({ segments: [segment] })

      vi.mocked(window.dubdesk.segment.split).mockRejectedValue('String error')

      await expect(useSegmentStore.getState().splitSegment('seg-1', 5000)).rejects.toBe(
        'String error'
      )

      expect(useSegmentStore.getState().error).toBe('Failed to split segment')
    })
  })

  describe('mergeSegments', () => {
    it('should merge multiple segments into one', async () => {
      const segments = [
        createMockSegment({ id: 'seg-1', orderIndex: 0 }),
        createMockSegment({ id: 'seg-2', orderIndex: 1 }),
        createMockSegment({ id: 'seg-3', orderIndex: 2 })
      ]
      useSegmentStore.setState({ segments })

      const mergedSegment = createMockSegment({ id: 'seg-merged' })
      vi.mocked(window.dubdesk.segment.merge).mockResolvedValue({
        success: true,
        segment: mergedSegment
      })

      const result = await useSegmentStore.getState().mergeSegments(['seg-1', 'seg-2'])

      expect(result).toEqual(mergedSegment)
      expect(useSegmentStore.getState().selectedSegmentIds.has('seg-merged')).toBe(true)
    })

    it('should handle error when response.success is false', async () => {
      const segments = [createMockSegment({ id: 'seg-1' }), createMockSegment({ id: 'seg-2' })]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.merge).mockResolvedValue({
        success: false,
        error: 'Segments not adjacent'
      })

      await expect(useSegmentStore.getState().mergeSegments(['seg-1', 'seg-2'])).rejects.toThrow(
        'Segments not adjacent'
      )

      expect(useSegmentStore.getState().error).toBe('Segments not adjacent')
    })

    it('should handle errors when merging segments', async () => {
      const segments = [createMockSegment({ id: 'seg-1' }), createMockSegment({ id: 'seg-2' })]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.merge).mockRejectedValue(new Error('Merge failed'))

      await expect(useSegmentStore.getState().mergeSegments(['seg-1', 'seg-2'])).rejects.toThrow(
        'Merge failed'
      )

      expect(useSegmentStore.getState().error).toBe('Merge failed')
    })

    it('should handle non-Error exceptions when merging segments', async () => {
      const segments = [createMockSegment({ id: 'seg-1' }), createMockSegment({ id: 'seg-2' })]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.merge).mockRejectedValue('Database error')

      await expect(useSegmentStore.getState().mergeSegments(['seg-1', 'seg-2'])).rejects.toBe(
        'Database error'
      )

      expect(useSegmentStore.getState().error).toBe('Failed to merge segments')
    })
  })

  describe('reorderSegments', () => {
    it('should reorder segments', async () => {
      const segments = [
        createMockSegment({ id: 'seg-1' }),
        createMockSegment({ id: 'seg-2' }),
        createMockSegment({ id: 'seg-3' })
      ]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.reorder).mockResolvedValue({ success: true })

      await useSegmentStore.getState().reorderSegments('proj-1', ['seg-3', 'seg-1', 'seg-2'])

      const reordered = useSegmentStore.getState().segments
      expect(reordered[0].id).toBe('seg-3')
      expect(reordered[1].id).toBe('seg-1')
      expect(reordered[2].id).toBe('seg-2')
    })

    it('should handle error when response.success is false', async () => {
      const segments = [createMockSegment({ id: 'seg-1' })]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.reorder).mockResolvedValue({
        success: false,
        error: 'Invalid order'
      })

      await expect(useSegmentStore.getState().reorderSegments('proj-1', ['seg-1'])).rejects.toThrow(
        'Invalid order'
      )

      expect(useSegmentStore.getState().error).toBe('Invalid order')
    })

    it('should handle error when reordering segments fails', async () => {
      const segments = [createMockSegment({ id: 'seg-1' })]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.reorder).mockRejectedValue(new Error('Reorder failed'))

      await expect(useSegmentStore.getState().reorderSegments('proj-1', ['seg-1'])).rejects.toThrow(
        'Reorder failed'
      )

      expect(useSegmentStore.getState().error).toBe('Reorder failed')
    })

    it('should handle non-Error exception when reordering segments', async () => {
      const segments = [createMockSegment({ id: 'seg-1' })]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.segment.reorder).mockRejectedValue('Database error')

      await expect(useSegmentStore.getState().reorderSegments('proj-1', ['seg-1'])).rejects.toBe(
        'Database error'
      )

      expect(useSegmentStore.getState().error).toBe('Failed to reorder segments')
    })
  })

  describe('speaker operations', () => {
    it('should load speakers successfully', async () => {
      const mockSpeakers = [createMockSpeaker(), createMockSpeaker({ id: 'speaker-2' })]
      vi.mocked(window.dubdesk.speaker.getAll).mockResolvedValue({
        success: true,
        speakers: mockSpeakers
      })

      await useSegmentStore.getState().loadSpeakers('proj-1')

      expect(useSegmentStore.getState().speakers).toEqual(mockSpeakers)
    })

    it('should handle error when loading speakers fails', async () => {
      vi.mocked(window.dubdesk.speaker.getAll).mockResolvedValue({
        success: false,
        error: 'Database connection lost'
      })

      await expect(useSegmentStore.getState().loadSpeakers('proj-1')).rejects.toThrow(
        'Database connection lost'
      )

      expect(useSegmentStore.getState().error).toBe('Database connection lost')
    })

    it('should handle non-Error exception when loading speakers', async () => {
      vi.mocked(window.dubdesk.speaker.getAll).mockRejectedValue('Network error')

      await expect(useSegmentStore.getState().loadSpeakers('proj-1')).rejects.toBe('Network error')

      expect(useSegmentStore.getState().error).toBe('Failed to load speakers')
    })

    it('should create a speaker successfully', async () => {
      const mockSpeaker = createMockSpeaker()
      vi.mocked(window.dubdesk.speaker.create).mockResolvedValue({
        success: true,
        speaker: mockSpeaker
      })

      const result = await useSegmentStore.getState().createSpeaker({
        projectId: 'proj-1',
        name: 'Speaker 1'
      })

      expect(result).toEqual(mockSpeaker)
      expect(useSegmentStore.getState().speakers).toContain(mockSpeaker)
    })

    it('should handle error when creating speaker fails', async () => {
      vi.mocked(window.dubdesk.speaker.create).mockResolvedValue({
        success: false,
        error: 'Duplicate speaker name'
      })

      await expect(
        useSegmentStore.getState().createSpeaker({ projectId: 'proj-1', name: 'Speaker 1' })
      ).rejects.toThrow('Duplicate speaker name')

      expect(useSegmentStore.getState().error).toBe('Duplicate speaker name')
    })

    it('should handle non-Error exception when creating speaker', async () => {
      vi.mocked(window.dubdesk.speaker.create).mockRejectedValue('Database error')

      await expect(
        useSegmentStore.getState().createSpeaker({ projectId: 'proj-1', name: 'Speaker 1' })
      ).rejects.toBe('Database error')

      expect(useSegmentStore.getState().error).toBe('Failed to create speaker')
    })

    it('should update a speaker successfully', async () => {
      const mockSpeaker = createMockSpeaker()
      useSegmentStore.setState({ speakers: [mockSpeaker] })

      const updatedSpeaker = { ...mockSpeaker, name: 'Updated Speaker' }
      vi.mocked(window.dubdesk.speaker.update).mockResolvedValue({
        success: true,
        speaker: updatedSpeaker
      })

      await useSegmentStore.getState().updateSpeaker('speaker-1', { name: 'Updated Speaker' })

      expect(useSegmentStore.getState().speakers[0].name).toBe('Updated Speaker')
    })

    it('should handle error when updating speaker fails', async () => {
      const mockSpeaker = createMockSpeaker()
      useSegmentStore.setState({ speakers: [mockSpeaker] })

      vi.mocked(window.dubdesk.speaker.update).mockResolvedValue({
        success: false,
        error: 'Speaker name already exists'
      })

      await expect(
        useSegmentStore.getState().updateSpeaker('speaker-1', { name: 'Duplicate Name' })
      ).rejects.toThrow('Speaker name already exists')

      expect(useSegmentStore.getState().error).toBe('Speaker name already exists')
    })

    it('should handle non-Error exception when updating speaker', async () => {
      const mockSpeaker = createMockSpeaker()
      useSegmentStore.setState({ speakers: [mockSpeaker] })

      vi.mocked(window.dubdesk.speaker.update).mockRejectedValue('Network error')

      await expect(
        useSegmentStore.getState().updateSpeaker('speaker-1', { name: 'New Name' })
      ).rejects.toBe('Network error')

      expect(useSegmentStore.getState().error).toBe('Failed to update speaker')
    })

    it('should delete a speaker successfully', async () => {
      const mockSpeaker = createMockSpeaker()
      useSegmentStore.setState({ speakers: [mockSpeaker] })

      vi.mocked(window.dubdesk.speaker.delete).mockResolvedValue({ success: true })

      await useSegmentStore.getState().deleteSpeaker('speaker-1')

      expect(useSegmentStore.getState().speakers).toHaveLength(0)
    })

    it('should handle error when deleting speaker fails', async () => {
      const mockSpeaker = createMockSpeaker()
      useSegmentStore.setState({ speakers: [mockSpeaker] })

      vi.mocked(window.dubdesk.speaker.delete).mockResolvedValue({
        success: false,
        error: 'Speaker in use'
      })

      await expect(useSegmentStore.getState().deleteSpeaker('speaker-1')).rejects.toThrow(
        'Speaker in use'
      )

      expect(useSegmentStore.getState().error).toBe('Speaker in use')
      // Speaker should still be in the list since delete failed
      expect(useSegmentStore.getState().speakers).toHaveLength(1)
    })

    it('should handle non-Error exception when deleting speaker', async () => {
      const mockSpeaker = createMockSpeaker()
      useSegmentStore.setState({ speakers: [mockSpeaker] })

      vi.mocked(window.dubdesk.speaker.delete).mockRejectedValue('Network error')

      await expect(useSegmentStore.getState().deleteSpeaker('speaker-1')).rejects.toBe(
        'Network error'
      )

      expect(useSegmentStore.getState().error).toBe('Failed to delete speaker')
    })
  })

  describe('selection operations', () => {
    beforeEach(() => {
      const segments = [
        createMockSegment({ id: 'seg-1' }),
        createMockSegment({ id: 'seg-2' }),
        createMockSegment({ id: 'seg-3' })
      ]
      useSegmentStore.setState({ segments })
    })

    it('should select a single segment', () => {
      useSegmentStore.getState().selectSegment('seg-1')
      expect(useSegmentStore.getState().selectedSegmentIds).toEqual(new Set(['seg-1']))
    })

    it('should replace selection when not multi-selecting', () => {
      useSegmentStore.getState().selectSegment('seg-1')
      useSegmentStore.getState().selectSegment('seg-2')
      expect(useSegmentStore.getState().selectedSegmentIds).toEqual(new Set(['seg-2']))
    })

    it('should toggle selection in multi-select mode', () => {
      useSegmentStore.getState().selectSegment('seg-1', true)
      useSegmentStore.getState().selectSegment('seg-2', true)
      expect(useSegmentStore.getState().selectedSegmentIds).toEqual(new Set(['seg-1', 'seg-2']))

      useSegmentStore.getState().selectSegment('seg-1', true) // Toggle off
      expect(useSegmentStore.getState().selectedSegmentIds).toEqual(new Set(['seg-2']))
    })

    it('should deselect a segment', () => {
      useSegmentStore.setState({ selectedSegmentIds: new Set(['seg-1', 'seg-2']) })
      useSegmentStore.getState().deselectSegment('seg-1')
      expect(useSegmentStore.getState().selectedSegmentIds).toEqual(new Set(['seg-2']))
    })

    it('should select all segments', () => {
      useSegmentStore.getState().selectAll()
      expect(useSegmentStore.getState().selectedSegmentIds).toEqual(
        new Set(['seg-1', 'seg-2', 'seg-3'])
      )
    })

    it('should clear selection', () => {
      useSegmentStore.setState({ selectedSegmentIds: new Set(['seg-1', 'seg-2']) })
      useSegmentStore.getState().clearSelection()
      expect(useSegmentStore.getState().selectedSegmentIds.size).toBe(0)
    })

    it('should select range of segments', () => {
      useSegmentStore.getState().selectRange('seg-1', 'seg-3')
      expect(useSegmentStore.getState().selectedSegmentIds).toEqual(
        new Set(['seg-1', 'seg-2', 'seg-3'])
      )
    })

    it('should select range in reverse order', () => {
      useSegmentStore.getState().selectRange('seg-3', 'seg-1')
      expect(useSegmentStore.getState().selectedSegmentIds).toEqual(
        new Set(['seg-1', 'seg-2', 'seg-3'])
      )
    })

    it('should not select range if start or end id not found', () => {
      useSegmentStore.getState().selectRange('seg-1', 'non-existent')
      expect(useSegmentStore.getState().selectedSegmentIds.size).toBe(0)
    })
  })

  describe('regenerateSegmentAudio', () => {
    it('should regenerate audio for a segment', async () => {
      const segment = createMockSegment({
        voiceId: 'voice-1',
        translatedText: 'Test text'
      })
      useSegmentStore.setState({ segments: [segment] })

      vi.mocked(window.dubdesk.tts.generateSingle).mockResolvedValue({
        success: true,
        data: { audioPath: '/path/to/audio.mp3', durationMs: 5000 }
      })

      await useSegmentStore.getState().regenerateSegmentAudio('seg-1')

      const updatedSegment = useSegmentStore.getState().segments[0]
      expect(updatedSegment.audioFilePath).toBe('/path/to/audio.mp3')
      expect(updatedSegment.audioDurationMs).toBe(5000)
      expect(updatedSegment.status).toBe('ready')
    })

    it('should use speaker default voice if segment has no voice', async () => {
      const speaker = createMockSpeaker({ defaultVoiceId: 'default-voice' })
      const segment = createMockSegment({
        voiceId: undefined,
        speakerId: 'speaker-1',
        translatedText: 'Test'
      })
      useSegmentStore.setState({ segments: [segment], speakers: [speaker] })

      vi.mocked(window.dubdesk.tts.generateSingle).mockResolvedValue({
        success: true,
        data: { audioPath: '/path/to/audio.mp3', durationMs: 5000 }
      })

      await useSegmentStore.getState().regenerateSegmentAudio('seg-1')

      expect(window.dubdesk.tts.generateSingle).toHaveBeenCalledWith({
        segmentId: 'seg-1',
        voiceId: 'default-voice'
      })
    })

    it('should throw error if no voice is available', async () => {
      const segment = createMockSegment({
        voiceId: undefined,
        speakerId: undefined,
        translatedText: 'Test'
      })
      useSegmentStore.setState({ segments: [segment] })

      await expect(useSegmentStore.getState().regenerateSegmentAudio('seg-1')).rejects.toThrow(
        'No voice selected for segment'
      )
    })

    it('should do nothing for segment with no text', async () => {
      const segment = createMockSegment({ translatedText: '' })
      useSegmentStore.setState({ segments: [segment] })

      await useSegmentStore.getState().regenerateSegmentAudio('seg-1')

      expect(window.dubdesk.tts.generateSingle).not.toHaveBeenCalled()
    })

    it('should throw error when TTS response is not successful', async () => {
      const segment = createMockSegment({ voiceId: 'voice-1', translatedText: 'Test' })
      useSegmentStore.setState({ segments: [segment] })

      vi.mocked(window.dubdesk.tts.generateSingle).mockResolvedValue({
        success: false,
        error: 'TTS generation failed'
      })

      await expect(useSegmentStore.getState().regenerateSegmentAudio('seg-1')).rejects.toThrow(
        'TTS generation failed'
      )

      expect(useSegmentStore.getState().error).toBe('TTS generation failed')
      expect(useSegmentStore.getState().isGenerating).toBe(false)
    })

    it('should handle non-Error exceptions', async () => {
      const segment = createMockSegment({ voiceId: 'voice-1', translatedText: 'Test' })
      useSegmentStore.setState({ segments: [segment] })

      vi.mocked(window.dubdesk.tts.generateSingle).mockRejectedValue('String error')

      await expect(useSegmentStore.getState().regenerateSegmentAudio('seg-1')).rejects.toBe(
        'String error'
      )

      expect(useSegmentStore.getState().error).toBe('Failed to regenerate audio')
    })
  })

  describe('regenerateAllStaleAudio', () => {
    it('should regenerate all stale segments', async () => {
      const segments = [
        createMockSegment({
          id: 'seg-1',
          voiceId: 'voice-1',
          audioFilePath: undefined
        }),
        createMockSegment({
          id: 'seg-2',
          voiceId: 'voice-1',
          audioFilePath: '/existing.mp3',
          translatedTextHash: '33c13465' // Correct hash for "Hello world"
        }),
        createMockSegment({
          id: 'seg-3',
          voiceId: 'voice-1',
          audioFilePath: '/old.mp3',
          translatedTextHash: 'wrong-hash'
        })
      ]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.tts.generateSingle).mockResolvedValue({
        success: true,
        data: { audioPath: '/new/audio.mp3', durationMs: 3000 }
      })

      await useSegmentStore.getState().regenerateAllStaleAudio()

      // Should be called for seg-1 (no audio) and seg-3 (wrong hash)
      expect(window.dubdesk.tts.generateSingle).toHaveBeenCalledTimes(2)
    })

    it('should track progress while regenerating', async () => {
      const segments = [
        createMockSegment({ id: 'seg-1', voiceId: 'voice-1', audioFilePath: undefined }),
        createMockSegment({ id: 'seg-2', voiceId: 'voice-1', audioFilePath: undefined })
      ]
      useSegmentStore.setState({ segments })

      const progressStates: Array<{ completed: number; total: number } | null> = []
      useSegmentStore.subscribe(
        (state) => state.generationProgress,
        (progress) => progressStates.push(progress)
      )

      vi.mocked(window.dubdesk.tts.generateSingle).mockResolvedValue({
        success: true,
        data: { audioPath: '/audio.mp3', durationMs: 3000 }
      })

      await useSegmentStore.getState().regenerateAllStaleAudio()

      expect(progressStates).toContainEqual({ completed: 1, total: 2 })
      expect(progressStates).toContainEqual({ completed: 2, total: 2 })
    })

    it('should do nothing when no stale segments', async () => {
      useSegmentStore.setState({ segments: [] })

      await useSegmentStore.getState().regenerateAllStaleAudio()

      expect(window.dubdesk.tts.generateSingle).not.toHaveBeenCalled()
    })

    it('should use speaker default voice when segment has speakerId', async () => {
      const speaker = createMockSpeaker({
        id: 'speaker-1',
        defaultVoiceId: 'speaker-default-voice'
      })
      const segments = [
        createMockSegment({
          id: 'seg-1',
          voiceId: undefined,
          speakerId: 'speaker-1',
          audioFilePath: undefined
        })
      ]
      useSegmentStore.setState({ segments, speakers: [speaker] })

      vi.mocked(window.dubdesk.tts.generateSingle).mockResolvedValue({
        success: true,
        data: { audioPath: '/new/audio.mp3', durationMs: 3000 }
      })

      await useSegmentStore.getState().regenerateAllStaleAudio()

      expect(window.dubdesk.tts.generateSingle).toHaveBeenCalledWith({
        segmentId: 'seg-1',
        voiceId: 'speaker-default-voice'
      })
    })

    it('should skip segments with speakerId but no voice', async () => {
      const speaker = createMockSpeaker({
        id: 'speaker-1',
        defaultVoiceId: undefined
      })
      const segments = [
        createMockSegment({
          id: 'seg-1',
          voiceId: undefined,
          speakerId: 'speaker-1',
          audioFilePath: undefined
        })
      ]
      useSegmentStore.setState({ segments, speakers: [speaker] })

      await useSegmentStore.getState().regenerateAllStaleAudio()

      expect(window.dubdesk.tts.generateSingle).not.toHaveBeenCalled()
    })

    it('should handle errors during regeneration', async () => {
      const segments = [
        createMockSegment({ id: 'seg-1', voiceId: 'voice-1', audioFilePath: undefined })
      ]
      useSegmentStore.setState({ segments })

      vi.mocked(window.dubdesk.tts.generateSingle).mockRejectedValue(new Error('TTS service down'))

      await expect(useSegmentStore.getState().regenerateAllStaleAudio()).rejects.toThrow(
        'TTS service down'
      )

      expect(useSegmentStore.getState().error).toBe('TTS service down')
      expect(useSegmentStore.getState().isGenerating).toBe(false)
      expect(useSegmentStore.getState().generationProgress).toBe(null)
    })
  })

  describe('markAudioGenerated', () => {
    it('should mark audio as generated with hash', () => {
      const segment = createMockSegment()
      useSegmentStore.setState({ segments: [segment] })

      useSegmentStore.getState().markAudioGenerated('seg-1', 'new-hash')

      const updated = useSegmentStore.getState().segments[0]
      expect(updated.translatedTextHash).toBe('new-hash')
      expect(updated.audioGeneratedAt).toBeDefined()
    })
  })

  describe('utility actions', () => {
    it('should set segments directly', () => {
      const segments = [createMockSegment()]
      useSegmentStore.getState().setSegments(segments)
      expect(useSegmentStore.getState().segments).toEqual(segments)
    })

    it('should set speakers directly', () => {
      const speakers = [createMockSpeaker()]
      useSegmentStore.getState().setSpeakers(speakers)
      expect(useSegmentStore.getState().speakers).toEqual(speakers)
    })

    it('should clear error', () => {
      useSegmentStore.setState({ error: 'Some error' })
      useSegmentStore.getState().clearError()
      expect(useSegmentStore.getState().error).toBeNull()
    })

    it('should reset to initial state', () => {
      useSegmentStore.setState({
        segments: [createMockSegment()],
        speakers: [createMockSpeaker()],
        selectedSegmentIds: new Set(['seg-1']),
        error: 'Error'
      })

      useSegmentStore.getState().reset()

      const state = useSegmentStore.getState()
      expect(state.segments).toHaveLength(0)
      expect(state.speakers).toHaveLength(0)
      expect(state.selectedSegmentIds.size).toBe(0)
      expect(state.error).toBeNull()
    })
  })

  describe('selectors', () => {
    beforeEach(() => {
      const segments = [
        createMockSegment({ id: 'seg-1', speakerId: 'speaker-1' }),
        createMockSegment({ id: 'seg-2', speakerId: 'speaker-1' }),
        createMockSegment({ id: 'seg-3', speakerId: 'speaker-2' })
      ]
      const speakers = [
        createMockSpeaker({ id: 'speaker-1' }),
        createMockSpeaker({ id: 'speaker-2' })
      ]
      useSegmentStore.setState({
        segments,
        speakers,
        selectedSegmentIds: new Set(['seg-1', 'seg-3'])
      })
    })

    it('selectSegmentById should return segment by id', () => {
      const state = useSegmentStore.getState()
      expect(selectSegmentById('seg-1')(state)?.id).toBe('seg-1')
      expect(selectSegmentById('non-existent')(state)).toBeUndefined()
    })

    it('selectSelectedSegments should return selected segments', () => {
      const state = useSegmentStore.getState()
      const selected = selectSelectedSegments(state)
      expect(selected).toHaveLength(2)
      expect(selected.map((s) => s.id)).toEqual(['seg-1', 'seg-3'])
    })

    it('selectSpeakerById should return speaker by id', () => {
      const state = useSegmentStore.getState()
      expect(selectSpeakerById('speaker-1')(state)?.id).toBe('speaker-1')
      expect(selectSpeakerById('non-existent')(state)).toBeUndefined()
    })

    it('selectSegmentsBySpeaker should return segments for speaker', () => {
      const state = useSegmentStore.getState()
      const segments = selectSegmentsBySpeaker('speaker-1')(state)
      expect(segments).toHaveLength(2)
      expect(segments.every((s) => s.speakerId === 'speaker-1')).toBe(true)
    })

    it('selectStaleSegments should return stale segments', () => {
      const segments = [
        createMockSegment({ id: 'seg-1', audioFilePath: undefined }), // Stale - no audio
        createMockSegment({
          id: 'seg-2',
          audioFilePath: '/audio.mp3',
          translatedTextHash: '33c13465' // Correct hash for "Hello world"
        }) // Not stale - hash matches
      ]
      useSegmentStore.setState({ segments })

      const state = useSegmentStore.getState()
      const stale = selectStaleSegments(state)
      expect(stale).toHaveLength(1)
      expect(stale[0].id).toBe('seg-1')
    })

    it('selectStaleSegmentCount should return count of stale segments', () => {
      const segments = [
        createMockSegment({ id: 'seg-1', audioFilePath: undefined }), // Stale - no audio
        createMockSegment({ id: 'seg-2', audioFilePath: undefined }), // Stale - no audio
        createMockSegment({
          id: 'seg-3',
          audioFilePath: '/audio.mp3',
          translatedTextHash: '33c13465' // Correct hash - not stale
        })
      ]
      useSegmentStore.setState({ segments })

      const state = useSegmentStore.getState()
      expect(selectStaleSegmentCount(state)).toBe(2)
    })
  })
})
