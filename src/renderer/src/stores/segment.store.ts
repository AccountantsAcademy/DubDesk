import type {
  Segment,
  SegmentCreateInput,
  SegmentUpdateInput,
  Speaker,
  SpeakerCreateInput
} from '@shared/types/segment'
import { hashText } from '@shared/utils/hash'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { useHistoryStore } from './history.store'

/**
 * Check if a segment's audio is stale (text, voice, or duration changed since audio was generated)
 */
export function isSegmentStale(segment: Segment): boolean {
  if (!segment.translatedText?.trim()) return false // No text = not stale
  if (!segment.audioFilePath) return true // No audio = stale
  if (!segment.translatedTextHash) return true // Never generated = stale
  // Check if text changed
  if (hashText(segment.translatedText) !== segment.translatedTextHash) return true
  // Check if voice changed (only if both current voice and generated voice are known)
  if (
    segment.voiceId &&
    segment.audioGeneratedVoiceId &&
    segment.audioGeneratedVoiceId !== segment.voiceId
  )
    return true
  // Check if segment duration changed since audio was generated
  if (segment.audioGeneratedDurationMs !== undefined) {
    const currentDuration = segment.endTimeMs - segment.startTimeMs
    if (currentDuration !== segment.audioGeneratedDurationMs) return true
  }
  return false
}

interface SegmentState {
  segments: Segment[]
  speakers: Speaker[]
  selectedSegmentIds: Set<string>
  isLoading: boolean
  isGenerating: boolean
  generationProgress: { completed: number; total: number } | null
  error: string | null
}

interface SegmentActions {
  loadSegments: (projectId: string) => Promise<void>
  createSegment: (input: SegmentCreateInput) => Promise<Segment>
  updateSegment: (id: string, updates: SegmentUpdateInput) => Promise<void>
  deleteSegment: (id: string) => Promise<void>
  deleteSelectedSegments: () => Promise<void>
  batchUpdateSegments: (
    updates: Array<{ id: string; updates: SegmentUpdateInput }>
  ) => Promise<void>
  splitSegment: (id: string, splitTimeMs: number) => Promise<[Segment, Segment]>
  mergeSegments: (ids: string[]) => Promise<Segment>
  reorderSegments: (projectId: string, segmentIds: string[]) => Promise<void>

  loadSpeakers: (projectId: string) => Promise<void>
  createSpeaker: (input: SpeakerCreateInput) => Promise<Speaker>
  updateSpeaker: (id: string, updates: Partial<Speaker>) => Promise<void>
  deleteSpeaker: (id: string) => Promise<void>

  selectSegment: (id: string, multi?: boolean) => void
  deselectSegment: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  selectRange: (startId: string, endId: string) => void

  // Stale audio management
  regenerateSegmentAudio: (id: string) => Promise<void>
  regenerateAllStaleAudio: () => Promise<void>
  markAudioGenerated: (id: string, hash: string) => void

  setSegments: (segments: Segment[]) => void
  setSpeakers: (speakers: Speaker[]) => void
  clearError: () => void
  reset: () => void
}

type SegmentStore = SegmentState & SegmentActions

const initialState: SegmentState = {
  segments: [],
  speakers: [],
  selectedSegmentIds: new Set(),
  isLoading: false,
  isGenerating: false,
  generationProgress: null,
  error: null
}

export const useSegmentStore = create<SegmentStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      loadSegments: async (projectId: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await window.dubdesk.segment.getAll(projectId)
          if (!response.success) {
            throw new Error(response.error)
          }
          set({ segments: response.segments, isLoading: false })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load segments',
            isLoading: false
          })
          throw error
        }
      },

      createSegment: async (input) => {
        try {
          const response = await window.dubdesk.segment.create(input)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { segments } = get()
          set({ segments: [...segments, response.segment] })
          return response.segment
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to create segment' })
          throw error
        }
      },

      updateSegment: async (id, updates) => {
        try {
          const { segments } = get()
          const previousSegment = segments.find((s) => s.id === id)

          const response = await window.dubdesk.segment.update(id, updates)
          if (!response.success) {
            throw new Error(response.error)
          }

          // Record history if we have previous state
          if (previousSegment) {
            const historyResult = await window.dubdesk.history.record(previousSegment.projectId, {
              type: 'segment:update',
              undoData: { segment: previousSegment },
              redoData: { segment: response.segment }
            })
            if (historyResult.success) {
              useHistoryStore.setState({
                canUndo: historyResult.canUndo ?? true,
                canRedo: historyResult.canRedo ?? false
              })
            }
          }

          set({
            segments: segments.map((s) => (s.id === id ? response.segment : s))
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to update segment' })
          throw error
        }
      },

      deleteSegment: async (id) => {
        try {
          const { segments, selectedSegmentIds } = get()
          const segmentToDelete = segments.find((s) => s.id === id)

          const response = await window.dubdesk.segment.delete(id)
          if (!response.success) {
            throw new Error(response.error)
          }

          // Record history for undo
          if (segmentToDelete) {
            const historyResult = await window.dubdesk.history.record(segmentToDelete.projectId, {
              type: 'segment:delete',
              undoData: { segment: segmentToDelete },
              redoData: { segmentId: id }
            })
            if (historyResult.success) {
              useHistoryStore.setState({
                canUndo: historyResult.canUndo ?? true,
                canRedo: historyResult.canRedo ?? false
              })
            }
          }

          const newSelected = new Set(selectedSegmentIds)
          newSelected.delete(id)
          set({
            segments: segments.filter((s) => s.id !== id),
            selectedSegmentIds: newSelected
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to delete segment' })
          throw error
        }
      },

      deleteSelectedSegments: async () => {
        const { selectedSegmentIds, segments } = get()
        if (selectedSegmentIds.size === 0) return

        try {
          const idsToDelete = Array.from(selectedSegmentIds)
          const segmentsToDelete = segments.filter((s) => selectedSegmentIds.has(s.id))

          // Delete all selected segments
          for (const id of idsToDelete) {
            await window.dubdesk.segment.delete(id)
          }

          // Record history for each deleted segment
          let lastHistoryResult: { success: boolean; canUndo?: boolean; canRedo?: boolean } | null =
            null
          for (const segment of segmentsToDelete) {
            lastHistoryResult = await window.dubdesk.history.record(segment.projectId, {
              type: 'segment:delete',
              undoData: { segment },
              redoData: { segmentId: segment.id }
            })
          }
          // Update history store with final state
          if (lastHistoryResult?.success) {
            useHistoryStore.setState({
              canUndo: lastHistoryResult.canUndo ?? true,
              canRedo: lastHistoryResult.canRedo ?? false
            })
          }

          set({
            segments: segments.filter((s) => !selectedSegmentIds.has(s.id)),
            selectedSegmentIds: new Set()
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to delete segments' })
          throw error
        }
      },

      batchUpdateSegments: async (updates) => {
        try {
          const response = await window.dubdesk.segment.batchUpdate(updates)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { segments } = get()
          const responseSegments = response.segments as Segment[]
          const updatedMap = new Map(responseSegments.map((s) => [s.id, s]))
          set({
            segments: segments.map((s) => updatedMap.get(s.id) || s)
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to batch update segments' })
          throw error
        }
      },

      splitSegment: async (id, splitTimeMs) => {
        try {
          const response = await window.dubdesk.segment.split(id, splitTimeMs)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { segments } = get()
          const index = segments.findIndex((s) => s.id === id)
          const newSegments = [...segments]
          newSegments.splice(index, 1, ...response.segments)
          set({ segments: newSegments })
          return response.segments as [Segment, Segment]
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to split segment' })
          throw error
        }
      },

      mergeSegments: async (ids) => {
        try {
          const { segments } = get()
          // Store original segments before merge for undo
          const originalSegments = segments
            .filter((s) => ids.includes(s.id))
            .sort((a, b) => a.startTimeMs - b.startTimeMs)

          const response = await window.dubdesk.segment.merge(ids)
          if (!response.success) {
            throw new Error(response.error)
          }

          // Record history for undo/redo
          if (originalSegments.length > 0) {
            const projectId = originalSegments[0].projectId
            const historyResult = await window.dubdesk.history.record(projectId, {
              type: 'segment:merge',
              undoData: {
                originalSegments,
                mergedSegmentId: response.segment.id
              },
              redoData: {
                originalSegmentIds: ids,
                mergedSegment: response.segment
              }
            })
            if (historyResult.success) {
              useHistoryStore.setState({
                canUndo: historyResult.canUndo ?? true,
                canRedo: historyResult.canRedo ?? false
              })
            }
          }

          const firstIndex = segments.findIndex((s) => ids.includes(s.id))
          const newSegments = segments.filter((s) => !ids.includes(s.id))
          newSegments.splice(firstIndex, 0, response.segment)
          set({ segments: newSegments, selectedSegmentIds: new Set([response.segment.id]) })
          return response.segment
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to merge segments' })
          throw error
        }
      },

      reorderSegments: async (projectId, segmentIds) => {
        try {
          const response = await window.dubdesk.segment.reorder(projectId, segmentIds)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { segments } = get()
          const segmentMap = new Map(segments.map((s) => [s.id, s]))
          set({
            segments: segmentIds.map((id) => segmentMap.get(id)!).filter(Boolean)
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to reorder segments' })
          throw error
        }
      },

      loadSpeakers: async (projectId) => {
        try {
          const response = await window.dubdesk.speaker.getAll(projectId)
          if (!response.success) {
            throw new Error(response.error)
          }
          set({ speakers: response.speakers })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to load speakers' })
          throw error
        }
      },

      createSpeaker: async (input) => {
        try {
          const response = await window.dubdesk.speaker.create(input)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { speakers } = get()
          set({ speakers: [...speakers, response.speaker] })
          return response.speaker
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to create speaker' })
          throw error
        }
      },

      updateSpeaker: async (id, updates) => {
        try {
          const response = await window.dubdesk.speaker.update(id, updates)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { speakers } = get()
          set({
            speakers: speakers.map((s) => (s.id === id ? response.speaker : s))
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to update speaker' })
          throw error
        }
      },

      deleteSpeaker: async (id) => {
        try {
          const response = await window.dubdesk.speaker.delete(id)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { speakers } = get()
          set({ speakers: speakers.filter((s) => s.id !== id) })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to delete speaker' })
          throw error
        }
      },

      selectSegment: (id, multi = false) => {
        const { selectedSegmentIds } = get()
        if (multi) {
          const newSelected = new Set(selectedSegmentIds)
          if (newSelected.has(id)) {
            newSelected.delete(id)
          } else {
            newSelected.add(id)
          }
          set({ selectedSegmentIds: newSelected })
        } else {
          set({ selectedSegmentIds: new Set([id]) })
        }
      },

      deselectSegment: (id) => {
        const { selectedSegmentIds } = get()
        const newSelected = new Set(selectedSegmentIds)
        newSelected.delete(id)
        set({ selectedSegmentIds: newSelected })
      },

      selectAll: () => {
        const { segments } = get()
        set({ selectedSegmentIds: new Set(segments.map((s) => s.id)) })
      },

      clearSelection: () => {
        set({ selectedSegmentIds: new Set() })
      },

      selectRange: (startId, endId) => {
        const { segments } = get()
        const startIndex = segments.findIndex((s) => s.id === startId)
        const endIndex = segments.findIndex((s) => s.id === endId)
        if (startIndex === -1 || endIndex === -1) return

        const [min, max] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)]
        const rangeIds = segments.slice(min, max + 1).map((s) => s.id)
        set({ selectedSegmentIds: new Set(rangeIds) })
      },

      // Stale audio management
      regenerateSegmentAudio: async (id) => {
        const { segments, speakers } = get()
        const segment = segments.find((s) => s.id === id)
        if (!segment || !segment.translatedText?.trim()) return

        // Determine the voice to use (segment voice > speaker default voice)
        const speaker = segment.speakerId
          ? speakers.find((s) => s.id === segment.speakerId)
          : undefined
        const voiceId = segment.voiceId || speaker?.defaultVoiceId
        if (!voiceId) {
          throw new Error('No voice selected for segment')
        }

        set({ isGenerating: true })
        try {
          const response = await window.dubdesk.tts.generateSingle({
            segmentId: id,
            voiceId
          })

          if (!response.success) {
            throw new Error(response.error)
          }

          // Update the segment in store
          set({
            segments: segments.map((s) =>
              s.id === id
                ? {
                    ...s,
                    audioFilePath: response.data.audioPath,
                    audioDurationMs: response.data.durationMs,
                    audioGeneratedAt: new Date().toISOString(),
                    translatedTextHash: hashText(segment.translatedText),
                    audioGeneratedDurationMs: segment.endTimeMs - segment.startTimeMs,
                    status: 'ready' as const
                  }
                : s
            ),
            isGenerating: false
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to regenerate audio',
            isGenerating: false
          })
          throw error
        }
      },

      regenerateAllStaleAudio: async () => {
        const { segments, speakers } = get()
        const staleSegments = segments.filter(isSegmentStale)

        if (staleSegments.length === 0) return

        set({
          isGenerating: true,
          generationProgress: { completed: 0, total: staleSegments.length }
        })

        try {
          for (let i = 0; i < staleSegments.length; i++) {
            const segment = staleSegments[i]
            if (!segment.translatedText?.trim()) continue

            // Determine the voice to use (segment voice > speaker default voice)
            const speaker = segment.speakerId
              ? speakers.find((s) => s.id === segment.speakerId)
              : undefined
            const voiceId = segment.voiceId || speaker?.defaultVoiceId
            if (!voiceId) continue // Skip segments without voice

            const response = await window.dubdesk.tts.generateSingle({
              segmentId: segment.id,
              voiceId
            })

            if (response.success) {
              const currentSegments = get().segments
              set({
                segments: currentSegments.map((s) =>
                  s.id === segment.id
                    ? {
                        ...s,
                        audioFilePath: response.data.audioPath,
                        audioDurationMs: response.data.durationMs,
                        audioGeneratedAt: new Date().toISOString(),
                        translatedTextHash: hashText(segment.translatedText),
                        audioGeneratedDurationMs: segment.endTimeMs - segment.startTimeMs,
                        status: 'ready' as const
                      }
                    : s
                ),
                generationProgress: { completed: i + 1, total: staleSegments.length }
              })
            }
          }

          set({ isGenerating: false, generationProgress: null })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to regenerate stale audio',
            isGenerating: false,
            generationProgress: null
          })
          throw error
        }
      },

      markAudioGenerated: (id, hash) => {
        const { segments } = get()
        set({
          segments: segments.map((s) =>
            s.id === id
              ? {
                  ...s,
                  audioGeneratedAt: new Date().toISOString(),
                  translatedTextHash: hash
                }
              : s
          )
        })
      },

      setSegments: (segments) => set({ segments }),
      setSpeakers: (speakers) => set({ speakers }),
      clearError: () => set({ error: null }),
      reset: () => set(initialState)
    })),
    { name: 'segment-store' }
  )
)

// Selectors
export const selectSegmentById = (id: string) => (state: SegmentStore) =>
  state.segments.find((s) => s.id === id)

export const selectSelectedSegments = (state: SegmentStore) =>
  state.segments.filter((s) => state.selectedSegmentIds.has(s.id))

export const selectSpeakerById = (id: string) => (state: SegmentStore) =>
  state.speakers.find((s) => s.id === id)

export const selectSegmentsBySpeaker = (speakerId: string) => (state: SegmentStore) =>
  state.segments.filter((s) => s.speakerId === speakerId)

export const selectStaleSegments = (state: SegmentStore) => state.segments.filter(isSegmentStale)

export const selectStaleSegmentCount = (state: SegmentStore) =>
  state.segments.filter(isSegmentStale).length

// Stretched segment selectors (based on speedAdjustment)
export const selectStretchedSegmentsOrange = (state: SegmentStore) =>
  state.segments.filter((s) => {
    const stretchPercent = Math.abs(s.speedAdjustment - 1) * 100
    return stretchPercent > 15 && stretchPercent <= 25
  })

export const selectStretchedSegmentsRed = (state: SegmentStore) =>
  state.segments.filter((s) => {
    const stretchPercent = Math.abs(s.speedAdjustment - 1) * 100
    return stretchPercent > 25
  })
