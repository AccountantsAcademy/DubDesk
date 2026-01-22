/**
 * History Store
 * Manages undo/redo state for the application
 */

import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { useProjectStore } from './project.store'
import { useSegmentStore } from './segment.store'
import { useUIStore } from './ui.store'

// Map action types to human-readable descriptions
function getActionDescription(actionType: string, isUndo: boolean): string {
  const verb = isUndo ? 'Undid' : 'Redid'
  switch (actionType) {
    case 'segment:create':
      return `${verb} segment creation`
    case 'segment:update':
      return `${verb} segment edit`
    case 'segment:delete':
      return `${verb} segment deletion`
    case 'segment:batch':
      return `${verb} batch edit`
    case 'segment:merge':
      return `${verb} segment merge`
    default:
      return `${verb} action`
  }
}

interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  isLoading: boolean
}

interface HistoryActions {
  undo: () => Promise<void>
  redo: () => Promise<void>
  refreshState: () => Promise<void>
}

type HistoryStore = HistoryState & HistoryActions

const initialState: HistoryState = {
  canUndo: false,
  canRedo: false,
  isLoading: false
}

// Helper to get current project ID
function getCurrentProjectId(): string | null {
  return useProjectStore.getState().currentProject?.id ?? null
}

export const useHistoryStore = create<HistoryStore>()(
  devtools(
    subscribeWithSelector((set, _get) => ({
      ...initialState,

      undo: async () => {
        const projectId = getCurrentProjectId()
        if (!projectId) return

        set({ isLoading: true })
        try {
          const result = await window.dubdesk.history.undo(projectId)
          if (result.success) {
            // Reload segments to reflect the undo
            await useSegmentStore.getState().loadSegments(projectId)

            // Show toast with action description
            const description = getActionDescription(result.actionType, true)
            useUIStore.getState().addToast('info', description)

            set({
              canUndo: result.canUndo ?? false,
              canRedo: result.canRedo ?? true,
              isLoading: false
            })
          } else {
            console.warn('[History] Undo failed:', result.error)
            set({ isLoading: false })
          }
        } catch (error) {
          console.error('[History] Undo error:', error)
          set({ isLoading: false })
        }
      },

      redo: async () => {
        const projectId = getCurrentProjectId()
        if (!projectId) return

        set({ isLoading: true })
        try {
          const result = await window.dubdesk.history.redo(projectId)
          if (result.success) {
            // Reload segments to reflect the redo
            await useSegmentStore.getState().loadSegments(projectId)

            // Show toast with action description
            const description = getActionDescription(result.actionType, false)
            useUIStore.getState().addToast('info', description)

            set({
              canUndo: result.canUndo ?? true,
              canRedo: result.canRedo ?? false,
              isLoading: false
            })
          } else {
            console.warn('[History] Redo failed:', result.error)
            set({ isLoading: false })
          }
        } catch (error) {
          console.error('[History] Redo error:', error)
          set({ isLoading: false })
        }
      },

      refreshState: async () => {
        const projectId = getCurrentProjectId()
        if (!projectId) {
          set({ canUndo: false, canRedo: false })
          return
        }

        try {
          const result = await window.dubdesk.history.getStack(projectId)
          if (result.success) {
            set({
              canUndo: result.canUndo ?? false,
              canRedo: result.canRedo ?? false
            })
          }
        } catch (error) {
          console.error('[History] Refresh state error:', error)
        }
      }
    })),
    { name: 'history-store' }
  )
)

// Selectors
export const selectCanUndo = (state: HistoryStore) => state.canUndo
export const selectCanRedo = (state: HistoryStore) => state.canRedo
