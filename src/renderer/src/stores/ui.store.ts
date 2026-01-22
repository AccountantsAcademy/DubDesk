import { create } from 'zustand'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'

type PanelId = 'properties' | 'speakers' | 'voices' | 'export'
type ModalId =
  | 'newProject'
  | 'openProject'
  | 'settings'
  | 'export'
  | 'confirmDelete'
  | 'apiKeys'
  | 'about'
  | 'speakerManager'
  | 'exportSettings'

interface PanelState {
  isOpen: boolean
  width: number
}

interface ModalState {
  isOpen: boolean
  data?: Record<string, unknown>
}

interface UIState {
  sidebarOpen: boolean
  sidebarWidth: number
  panels: Record<PanelId, PanelState>
  modals: Record<ModalId, ModalState>
  activePanel: PanelId | null
  timelineHeight: number
  videoPlayerSize: { width: number; height: number }
  theme: 'dark' | 'light'
  toasts: Array<{
    id: string
    type: 'info' | 'success' | 'warning' | 'error'
    message: string
    duration?: number
  }>
  contextMenu: {
    isOpen: boolean
    x: number
    y: number
    items: Array<{
      id: string
      label: string
      icon?: string
      shortcut?: string
      disabled?: boolean
      danger?: boolean
    }>
    onSelect?: (id: string) => void
  }
}

interface UIActions {
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  togglePanel: (panelId: PanelId) => void
  setPanelWidth: (panelId: PanelId, width: number) => void
  setActivePanel: (panelId: PanelId | null) => void
  openModal: (modalId: ModalId, data?: Record<string, unknown>) => void
  closeModal: (modalId: ModalId) => void
  closeAllModals: () => void
  setTimelineHeight: (height: number) => void
  setVideoPlayerSize: (size: { width: number; height: number }) => void
  setTheme: (theme: 'dark' | 'light') => void
  addToast: (
    type: 'info' | 'success' | 'warning' | 'error',
    message: string,
    duration?: number
  ) => string
  removeToast: (id: string) => void
  showContextMenu: (
    x: number,
    y: number,
    items: UIState['contextMenu']['items'],
    onSelect?: (id: string) => void
  ) => void
  hideContextMenu: () => void
  reset: () => void
}

type UIStore = UIState & UIActions

const defaultPanels: Record<PanelId, PanelState> = {
  properties: { isOpen: true, width: 300 },
  speakers: { isOpen: false, width: 280 },
  voices: { isOpen: false, width: 320 },
  export: { isOpen: false, width: 350 }
}

const defaultModals: Record<ModalId, ModalState> = {
  newProject: { isOpen: false },
  openProject: { isOpen: false },
  settings: { isOpen: false },
  export: { isOpen: false },
  confirmDelete: { isOpen: false },
  apiKeys: { isOpen: false },
  about: { isOpen: false },
  speakerManager: { isOpen: false },
  exportSettings: { isOpen: false }
}

const initialState: UIState = {
  sidebarOpen: true,
  sidebarWidth: 280,
  panels: defaultPanels,
  modals: defaultModals,
  activePanel: 'properties',
  timelineHeight: 200,
  videoPlayerSize: { width: 640, height: 360 },
  theme: 'dark',
  toasts: [],
  contextMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    items: []
  }
}

let toastIdCounter = 0

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...initialState,

        toggleSidebar: () => {
          const { sidebarOpen } = get()
          set({ sidebarOpen: !sidebarOpen })
        },

        setSidebarWidth: (width) => {
          const clampedWidth = Math.max(200, Math.min(500, width))
          set({ sidebarWidth: clampedWidth })
        },

        togglePanel: (panelId) => {
          const { panels, activePanel } = get()
          const panel = panels[panelId]
          set({
            panels: {
              ...panels,
              [panelId]: { ...panel, isOpen: !panel.isOpen }
            },
            activePanel: !panel.isOpen ? panelId : activePanel === panelId ? null : activePanel
          })
        },

        setPanelWidth: (panelId, width) => {
          const { panels } = get()
          const clampedWidth = Math.max(200, Math.min(500, width))
          set({
            panels: {
              ...panels,
              [panelId]: { ...panels[panelId], width: clampedWidth }
            }
          })
        },

        setActivePanel: (panelId) => set({ activePanel: panelId }),

        openModal: (modalId, data) => {
          const { modals } = get()
          set({
            modals: {
              ...modals,
              [modalId]: { isOpen: true, data }
            }
          })
        },

        closeModal: (modalId) => {
          const { modals } = get()
          set({
            modals: {
              ...modals,
              [modalId]: { isOpen: false, data: undefined }
            }
          })
        },

        closeAllModals: () => set({ modals: defaultModals }),

        setTimelineHeight: (height) => {
          const clampedHeight = Math.max(100, Math.min(600, height))
          set({ timelineHeight: clampedHeight })
        },

        setVideoPlayerSize: (size) => set({ videoPlayerSize: size }),

        setTheme: (theme) => set({ theme }),

        addToast: (type, message, duration = 5000) => {
          const id = `toast-${++toastIdCounter}`
          const { toasts } = get()
          set({ toasts: [...toasts, { id, type, message, duration }] })

          if (duration > 0) {
            setTimeout(() => {
              const currentToasts = get().toasts
              set({ toasts: currentToasts.filter((t) => t.id !== id) })
            }, duration)
          }

          return id
        },

        removeToast: (id) => {
          const { toasts } = get()
          set({ toasts: toasts.filter((t) => t.id !== id) })
        },

        showContextMenu: (x, y, items, onSelect) => {
          set({
            contextMenu: { isOpen: true, x, y, items, onSelect }
          })
        },

        hideContextMenu: () => {
          set({
            contextMenu: { isOpen: false, x: 0, y: 0, items: [], onSelect: undefined }
          })
        },

        reset: () => set({ ...initialState, toasts: [], contextMenu: initialState.contextMenu })
      })),
      {
        name: 'dubdesk-ui-storage',
        partialize: (state) => ({
          sidebarOpen: state.sidebarOpen,
          sidebarWidth: state.sidebarWidth,
          panels: state.panels,
          activePanel: state.activePanel,
          timelineHeight: state.timelineHeight,
          theme: state.theme
        })
      }
    ),
    { name: 'ui-store' }
  )
)

// Selectors
export const selectIsModalOpen = (modalId: ModalId) => (state: UIStore) =>
  state.modals[modalId].isOpen

export const selectModalData = (modalId: ModalId) => (state: UIStore) => state.modals[modalId].data

export const selectIsPanelOpen = (panelId: PanelId) => (state: UIStore) =>
  state.panels[panelId].isOpen

export const selectPanelWidth = (panelId: PanelId) => (state: UIStore) =>
  state.panels[panelId].width
