import type { ImageOverlay, ImageOverlayUpdateInput } from '@shared/types/overlay'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'

interface OverlayState {
  overlays: ImageOverlay[]
  selectedOverlayId: string | null
  isLoading: boolean
  error: string | null
}

interface OverlayActions {
  loadOverlays: (projectId: string) => Promise<void>
  createOverlay: (input: {
    projectId: string
    sourceImagePath: string
    startTimeMs: number
    endTimeMs: number
  }) => Promise<ImageOverlay>
  updateOverlay: (id: string, updates: ImageOverlayUpdateInput) => Promise<void>
  deleteOverlay: (id: string) => Promise<void>
  selectOverlay: (id: string | null) => void
  importAndCreateOverlay: (
    projectId: string,
    currentTimeMs: number,
    durationMs: number
  ) => Promise<void>
  reset: () => void
}

type OverlayStore = OverlayState & OverlayActions

const initialState: OverlayState = {
  overlays: [],
  selectedOverlayId: null,
  isLoading: false,
  error: null
}

export const useOverlayStore = create<OverlayStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      loadOverlays: async (projectId: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await window.dubdesk.overlay.getAll(projectId)
          if (!response.success) {
            throw new Error(response.error)
          }
          set({ overlays: response.overlays, isLoading: false })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load overlays',
            isLoading: false
          })
        }
      },

      createOverlay: async (input) => {
        try {
          const response = await window.dubdesk.overlay.create(input)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { overlays } = get()
          set({ overlays: [...overlays, response.overlay] })
          return response.overlay
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to create overlay' })
          throw error
        }
      },

      updateOverlay: async (id, updates) => {
        try {
          const response = await window.dubdesk.overlay.update(id, updates)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { overlays } = get()
          set({
            overlays: overlays.map((o) => (o.id === id ? response.overlay : o))
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to update overlay' })
          throw error
        }
      },

      deleteOverlay: async (id) => {
        try {
          const response = await window.dubdesk.overlay.delete(id)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { overlays, selectedOverlayId } = get()
          set({
            overlays: overlays.filter((o) => o.id !== id),
            selectedOverlayId: selectedOverlayId === id ? null : selectedOverlayId
          })
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to delete overlay' })
          throw error
        }
      },

      selectOverlay: (id) => {
        set({ selectedOverlayId: id })
      },

      importAndCreateOverlay: async (projectId, currentTimeMs, durationMs) => {
        try {
          const result = await window.dubdesk.overlay.importImage()
          if (!result.success || result.canceled || !result.filePath) return

          const startTimeMs = currentTimeMs
          const endTimeMs = Math.min(currentTimeMs + 5000, durationMs)

          const overlay = await get().createOverlay({
            projectId,
            sourceImagePath: result.filePath,
            startTimeMs,
            endTimeMs
          })

          set({ selectedOverlayId: overlay.id })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to import overlay'
          })
        }
      },

      reset: () => set(initialState)
    })),
    { name: 'overlay-store' }
  )
)
