import { selectCanRedo, selectCanUndo, useHistoryStore } from '@renderer/stores/history.store'
import { useProjectStore } from '@renderer/stores/project.store'
import type { Project } from '@shared/types/project'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Helper to create a mock project
function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    videoPath: '/path/to/video.mp4',
    sourceLanguage: 'en',
    targetLanguage: 'es',
    status: 'draft',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    settings: {
      duckingLevel: 0.3,
      crossfadeDuration: 100,
      defaultVoiceId: undefined
    },
    ...overrides
  }
}

describe('history.store', () => {
  beforeEach(() => {
    // Reset stores to initial state
    useHistoryStore.setState({
      canUndo: false,
      canRedo: false,
      isLoading: false
    })
    useProjectStore.setState({
      currentProject: null,
      recentProjects: [],
      isLoading: false,
      isSaving: false,
      hasUnsavedChanges: false,
      error: null
    })

    // Reset all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useHistoryStore.getState()
      expect(state.canUndo).toBe(false)
      expect(state.canRedo).toBe(false)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('undo', () => {
    it('should do nothing when no project is loaded', async () => {
      await useHistoryStore.getState().undo()

      expect(window.dubdesk.history.undo).not.toHaveBeenCalled()
      expect(useHistoryStore.getState().isLoading).toBe(false)
    })

    it('should call undo IPC and update state on success', async () => {
      // Set up project
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.history.undo).mockResolvedValue({
        success: true,
        canUndo: true,
        canRedo: true
      })
      // Mock segment.getAll for loadSegments call after undo
      vi.mocked(window.dubdesk.segment.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      await useHistoryStore.getState().undo()

      expect(window.dubdesk.history.undo).toHaveBeenCalledWith('proj-1')
      expect(useHistoryStore.getState().canUndo).toBe(true)
      expect(useHistoryStore.getState().canRedo).toBe(true)
      expect(useHistoryStore.getState().isLoading).toBe(false)
    })

    it('should set canRedo to true by default on successful undo', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.history.undo).mockResolvedValue({
        success: true
        // canUndo and canRedo not provided
      })
      // Mock segment.getAll for loadSegments call after undo
      vi.mocked(window.dubdesk.segment.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      await useHistoryStore.getState().undo()

      expect(useHistoryStore.getState().canUndo).toBe(false)
      expect(useHistoryStore.getState().canRedo).toBe(true)
    })

    it('should reset isLoading on failed undo', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.history.undo).mockResolvedValue({
        success: false
      })

      await useHistoryStore.getState().undo()

      expect(useHistoryStore.getState().isLoading).toBe(false)
    })

    it('should handle undo errors gracefully', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(window.dubdesk.history.undo).mockRejectedValue(new Error('Undo failed'))

      await useHistoryStore.getState().undo()

      expect(consoleSpy).toHaveBeenCalledWith('[History] Undo error:', expect.any(Error))
      expect(useHistoryStore.getState().isLoading).toBe(false)
    })
  })

  describe('redo', () => {
    it('should do nothing when no project is loaded', async () => {
      await useHistoryStore.getState().redo()

      expect(window.dubdesk.history.redo).not.toHaveBeenCalled()
      expect(useHistoryStore.getState().isLoading).toBe(false)
    })

    it('should call redo IPC and update state on success', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.history.redo).mockResolvedValue({
        success: true,
        canUndo: true,
        canRedo: false
      })
      // Mock segment.getAll for loadSegments call after redo
      vi.mocked(window.dubdesk.segment.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      await useHistoryStore.getState().redo()

      expect(window.dubdesk.history.redo).toHaveBeenCalledWith('proj-1')
      expect(useHistoryStore.getState().canUndo).toBe(true)
      expect(useHistoryStore.getState().canRedo).toBe(false)
      expect(useHistoryStore.getState().isLoading).toBe(false)
    })

    it('should set canUndo to true by default on successful redo', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.history.redo).mockResolvedValue({
        success: true
        // canUndo and canRedo not provided
      })
      // Mock segment.getAll for loadSegments call after redo
      vi.mocked(window.dubdesk.segment.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      await useHistoryStore.getState().redo()

      expect(useHistoryStore.getState().canUndo).toBe(true)
      expect(useHistoryStore.getState().canRedo).toBe(false)
    })

    it('should reset isLoading on failed redo', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.history.redo).mockResolvedValue({
        success: false
      })

      await useHistoryStore.getState().redo()

      expect(useHistoryStore.getState().isLoading).toBe(false)
    })

    it('should handle redo errors gracefully', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(window.dubdesk.history.redo).mockRejectedValue(new Error('Redo failed'))

      await useHistoryStore.getState().redo()

      expect(consoleSpy).toHaveBeenCalledWith('[History] Redo error:', expect.any(Error))
      expect(useHistoryStore.getState().isLoading).toBe(false)
    })
  })

  describe('refreshState', () => {
    it('should reset state when no project is loaded', async () => {
      useHistoryStore.setState({ canUndo: true, canRedo: true })

      await useHistoryStore.getState().refreshState()

      expect(window.dubdesk.history.getStack).not.toHaveBeenCalled()
      expect(useHistoryStore.getState().canUndo).toBe(false)
      expect(useHistoryStore.getState().canRedo).toBe(false)
    })

    it('should fetch and update history state on success', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.history.getStack).mockResolvedValue({
        success: true,
        canUndo: true,
        canRedo: false
      })

      await useHistoryStore.getState().refreshState()

      expect(window.dubdesk.history.getStack).toHaveBeenCalledWith('proj-1')
      expect(useHistoryStore.getState().canUndo).toBe(true)
      expect(useHistoryStore.getState().canRedo).toBe(false)
    })

    it('should handle missing canUndo/canRedo in response', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.history.getStack).mockResolvedValue({
        success: true
        // canUndo and canRedo not provided
      })

      await useHistoryStore.getState().refreshState()

      expect(useHistoryStore.getState().canUndo).toBe(false)
      expect(useHistoryStore.getState().canRedo).toBe(false)
    })

    it('should not update state on failed refresh', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })
      useHistoryStore.setState({ canUndo: true, canRedo: true })

      vi.mocked(window.dubdesk.history.getStack).mockResolvedValue({
        success: false
      })

      await useHistoryStore.getState().refreshState()

      // State should remain unchanged on failure
      expect(useHistoryStore.getState().canUndo).toBe(true)
      expect(useHistoryStore.getState().canRedo).toBe(true)
    })

    it('should handle refresh errors gracefully', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(window.dubdesk.history.getStack).mockRejectedValue(new Error('Refresh failed'))

      await useHistoryStore.getState().refreshState()

      expect(consoleSpy).toHaveBeenCalledWith('[History] Refresh state error:', expect.any(Error))
    })
  })

  describe('selectors', () => {
    it('selectCanUndo should return canUndo state', () => {
      useHistoryStore.setState({ canUndo: true })
      expect(selectCanUndo(useHistoryStore.getState())).toBe(true)

      useHistoryStore.setState({ canUndo: false })
      expect(selectCanUndo(useHistoryStore.getState())).toBe(false)
    })

    it('selectCanRedo should return canRedo state', () => {
      useHistoryStore.setState({ canRedo: true })
      expect(selectCanRedo(useHistoryStore.getState())).toBe(true)

      useHistoryStore.setState({ canRedo: false })
      expect(selectCanRedo(useHistoryStore.getState())).toBe(false)
    })
  })

  describe('isLoading state', () => {
    it('should set isLoading during undo operation', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      let loadingDuringCall = false
      vi.mocked(window.dubdesk.history.undo).mockImplementation(async () => {
        loadingDuringCall = useHistoryStore.getState().isLoading
        return { success: true }
      })
      // Mock segment.getAll for loadSegments call after undo
      vi.mocked(window.dubdesk.segment.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      await useHistoryStore.getState().undo()

      expect(loadingDuringCall).toBe(true)
      expect(useHistoryStore.getState().isLoading).toBe(false)
    })

    it('should set isLoading during redo operation', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      let loadingDuringCall = false
      vi.mocked(window.dubdesk.history.redo).mockImplementation(async () => {
        loadingDuringCall = useHistoryStore.getState().isLoading
        return { success: true }
      })
      // Mock segment.getAll for loadSegments call after redo
      vi.mocked(window.dubdesk.segment.getAll).mockResolvedValue({
        success: true,
        data: []
      })

      await useHistoryStore.getState().redo()

      expect(loadingDuringCall).toBe(true)
      expect(useHistoryStore.getState().isLoading).toBe(false)
    })
  })
})
