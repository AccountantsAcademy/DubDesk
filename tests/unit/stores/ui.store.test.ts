import {
  selectIsModalOpen,
  selectIsPanelOpen,
  selectModalData,
  selectPanelWidth,
  useUIStore
} from '@renderer/stores/ui.store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('UIStore', () => {
  beforeEach(() => {
    useUIStore.getState().reset()
    vi.useFakeTimers()
  })

  describe('sidebar', () => {
    it('should toggle sidebar', () => {
      const { toggleSidebar } = useUIStore.getState()

      const initialState = useUIStore.getState().sidebarOpen
      toggleSidebar()
      expect(useUIStore.getState().sidebarOpen).toBe(!initialState)

      toggleSidebar()
      expect(useUIStore.getState().sidebarOpen).toBe(initialState)
    })

    it('should set sidebar width within bounds', () => {
      const { setSidebarWidth } = useUIStore.getState()

      setSidebarWidth(350)
      expect(useUIStore.getState().sidebarWidth).toBe(350)

      // Test min bound
      setSidebarWidth(100)
      expect(useUIStore.getState().sidebarWidth).toBe(200)

      // Test max bound
      setSidebarWidth(600)
      expect(useUIStore.getState().sidebarWidth).toBe(500)
    })
  })

  describe('panels', () => {
    it('should toggle panel open state', () => {
      const { togglePanel } = useUIStore.getState()

      togglePanel('speakers')
      expect(useUIStore.getState().panels.speakers.isOpen).toBe(true)

      togglePanel('speakers')
      expect(useUIStore.getState().panels.speakers.isOpen).toBe(false)
    })

    it('should set active panel when opening', () => {
      const { togglePanel } = useUIStore.getState()

      togglePanel('voices')
      expect(useUIStore.getState().activePanel).toBe('voices')
    })

    it('should set panel width within bounds', () => {
      const { setPanelWidth } = useUIStore.getState()

      setPanelWidth('properties', 400)
      expect(useUIStore.getState().panels.properties.width).toBe(400)

      // Test min bound
      setPanelWidth('properties', 100)
      expect(useUIStore.getState().panels.properties.width).toBe(200)

      // Test max bound
      setPanelWidth('properties', 600)
      expect(useUIStore.getState().panels.properties.width).toBe(500)
    })
  })

  describe('modals', () => {
    it('should open modal', () => {
      const { openModal } = useUIStore.getState()

      openModal('settings')
      expect(useUIStore.getState().modals.settings.isOpen).toBe(true)
    })

    it('should open modal with data', () => {
      const { openModal } = useUIStore.getState()

      openModal('confirmDelete', { itemId: '123', itemName: 'Test Project' })
      const state = useUIStore.getState()
      expect(state.modals.confirmDelete.isOpen).toBe(true)
      expect(state.modals.confirmDelete.data).toEqual({ itemId: '123', itemName: 'Test Project' })
    })

    it('should close modal and clear data', () => {
      const { openModal, closeModal } = useUIStore.getState()

      openModal('confirmDelete', { itemId: '123' })
      closeModal('confirmDelete')

      const state = useUIStore.getState()
      expect(state.modals.confirmDelete.isOpen).toBe(false)
      expect(state.modals.confirmDelete.data).toBeUndefined()
    })

    it('should close all modals', () => {
      const { openModal, closeAllModals } = useUIStore.getState()

      openModal('settings')
      openModal('export')
      closeAllModals()

      const state = useUIStore.getState()
      expect(state.modals.settings.isOpen).toBe(false)
      expect(state.modals.export.isOpen).toBe(false)
    })
  })

  describe('toasts', () => {
    it('should add toast', () => {
      const { addToast } = useUIStore.getState()

      const id = addToast('success', 'Operation completed')
      const state = useUIStore.getState()

      expect(state.toasts).toHaveLength(1)
      expect(state.toasts[0]).toMatchObject({
        id,
        type: 'success',
        message: 'Operation completed'
      })
    })

    it('should remove toast', () => {
      const { addToast, removeToast } = useUIStore.getState()

      const id = addToast('info', 'Test message', 0) // No auto-remove
      removeToast(id)

      expect(useUIStore.getState().toasts).toHaveLength(0)
    })

    it('should auto-remove toast after duration', () => {
      const { addToast } = useUIStore.getState()

      addToast('warning', 'Temporary message', 3000)
      expect(useUIStore.getState().toasts).toHaveLength(1)

      vi.advanceTimersByTime(3000)
      expect(useUIStore.getState().toasts).toHaveLength(0)
    })
  })

  describe('context menu', () => {
    it('should show context menu', () => {
      const { showContextMenu } = useUIStore.getState()

      const items = [
        { id: 'edit', label: 'Edit' },
        { id: 'delete', label: 'Delete', danger: true }
      ]

      showContextMenu(100, 200, items)

      const state = useUIStore.getState()
      expect(state.contextMenu.isOpen).toBe(true)
      expect(state.contextMenu.x).toBe(100)
      expect(state.contextMenu.y).toBe(200)
      expect(state.contextMenu.items).toEqual(items)
    })

    it('should hide context menu', () => {
      const { showContextMenu, hideContextMenu } = useUIStore.getState()

      showContextMenu(100, 200, [{ id: 'test', label: 'Test' }])
      hideContextMenu()

      const state = useUIStore.getState()
      expect(state.contextMenu.isOpen).toBe(false)
      expect(state.contextMenu.items).toHaveLength(0)
    })
  })

  describe('theme', () => {
    it('should set theme', () => {
      const { setTheme } = useUIStore.getState()

      setTheme('light')
      expect(useUIStore.getState().theme).toBe('light')

      setTheme('dark')
      expect(useUIStore.getState().theme).toBe('dark')
    })
  })

  describe('layout', () => {
    it('should set timeline height within bounds', () => {
      const { setTimelineHeight } = useUIStore.getState()

      setTimelineHeight(300)
      expect(useUIStore.getState().timelineHeight).toBe(300)

      // Test min bound
      setTimelineHeight(50)
      expect(useUIStore.getState().timelineHeight).toBe(100)

      // Test max bound
      setTimelineHeight(800)
      expect(useUIStore.getState().timelineHeight).toBe(600)
    })

    it('should set video player size', () => {
      const { setVideoPlayerSize } = useUIStore.getState()

      setVideoPlayerSize({ width: 1280, height: 720 })
      expect(useUIStore.getState().videoPlayerSize).toEqual({ width: 1280, height: 720 })
    })
  })

  describe('active panel', () => {
    it('should set active panel directly', () => {
      const { setActivePanel } = useUIStore.getState()

      setActivePanel('speakers')
      expect(useUIStore.getState().activePanel).toBe('speakers')

      setActivePanel('voices')
      expect(useUIStore.getState().activePanel).toBe('voices')
    })
  })

  describe('selectors', () => {
    it('selectIsModalOpen should return true when modal is open', () => {
      const { openModal } = useUIStore.getState()

      expect(selectIsModalOpen('settings')(useUIStore.getState())).toBe(false)

      openModal('settings')
      expect(selectIsModalOpen('settings')(useUIStore.getState())).toBe(true)
    })

    it('selectModalData should return modal data', () => {
      const { openModal } = useUIStore.getState()

      expect(selectModalData('confirmDelete')(useUIStore.getState())).toBeUndefined()

      openModal('confirmDelete', { itemId: '123', itemName: 'Test' })
      expect(selectModalData('confirmDelete')(useUIStore.getState())).toEqual({
        itemId: '123',
        itemName: 'Test'
      })
    })

    it('selectIsPanelOpen should return panel open state', () => {
      const { togglePanel } = useUIStore.getState()

      expect(selectIsPanelOpen('speakers')(useUIStore.getState())).toBe(false)

      togglePanel('speakers')
      expect(selectIsPanelOpen('speakers')(useUIStore.getState())).toBe(true)
    })

    it('selectPanelWidth should return panel width', () => {
      const { setPanelWidth } = useUIStore.getState()

      setPanelWidth('properties', 350)
      expect(selectPanelWidth('properties')(useUIStore.getState())).toBe(350)
    })
  })
})
