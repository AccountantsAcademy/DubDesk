import { useProjectStore } from '@renderer/stores/project.store'
import type { Project, RecentProject } from '@shared/types/project'
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

// Helper to create a mock recent project
function createMockRecentProject(overrides: Partial<RecentProject> = {}): RecentProject {
  return {
    id: 'proj-1',
    name: 'Test Project',
    videoPath: '/path/to/video.mp4',
    targetLanguage: 'es',
    lastOpenedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('project.store', () => {
  beforeEach(() => {
    // Reset store to initial state
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
      const state = useProjectStore.getState()
      expect(state.currentProject).toBe(null)
      expect(state.recentProjects).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.isSaving).toBe(false)
      expect(state.hasUnsavedChanges).toBe(false)
      expect(state.error).toBe(null)
    })
  })

  describe('loadProject', () => {
    it('should load project successfully', async () => {
      const mockProject = createMockProject()
      vi.mocked(window.dubdesk.project.open).mockResolvedValue({
        success: true,
        project: mockProject
      })

      await useProjectStore.getState().loadProject('proj-1')

      expect(window.dubdesk.project.open).toHaveBeenCalledWith('proj-1')
      expect(useProjectStore.getState().currentProject).toEqual(mockProject)
      expect(useProjectStore.getState().isLoading).toBe(false)
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(false)
    })

    it('should set isLoading during load', async () => {
      let loadingDuringCall = false
      vi.mocked(window.dubdesk.project.open).mockImplementation(async () => {
        loadingDuringCall = useProjectStore.getState().isLoading
        return { success: true, project: createMockProject() }
      })

      await useProjectStore.getState().loadProject('proj-1')

      expect(loadingDuringCall).toBe(true)
      expect(useProjectStore.getState().isLoading).toBe(false)
    })

    it('should handle load error from response', async () => {
      vi.mocked(window.dubdesk.project.open).mockResolvedValue({
        success: false,
        error: 'Project not found'
      })

      await expect(useProjectStore.getState().loadProject('proj-1')).rejects.toThrow(
        'Project not found'
      )

      expect(useProjectStore.getState().currentProject).toBe(null)
      expect(useProjectStore.getState().error).toBe('Project not found')
      expect(useProjectStore.getState().isLoading).toBe(false)
    })

    it('should handle load exception', async () => {
      vi.mocked(window.dubdesk.project.open).mockRejectedValue(new Error('Network error'))

      await expect(useProjectStore.getState().loadProject('proj-1')).rejects.toThrow(
        'Network error'
      )

      expect(useProjectStore.getState().error).toBe('Network error')
      expect(useProjectStore.getState().isLoading).toBe(false)
    })

    it('should handle non-Error exception', async () => {
      vi.mocked(window.dubdesk.project.open).mockRejectedValue('Something went wrong')

      await expect(useProjectStore.getState().loadProject('proj-1')).rejects.toBe(
        'Something went wrong'
      )

      expect(useProjectStore.getState().error).toBe('Failed to load project')
    })

    it('should clear error before loading', async () => {
      useProjectStore.setState({ error: 'Previous error' })

      vi.mocked(window.dubdesk.project.open).mockResolvedValue({
        success: true,
        project: createMockProject()
      })

      await useProjectStore.getState().loadProject('proj-1')

      expect(useProjectStore.getState().error).toBe(null)
    })
  })

  describe('createProject', () => {
    const createData = {
      name: 'New Project',
      videoPath: '/path/to/video.mp4',
      targetLanguage: 'es',
      sourceLanguage: 'en',
      importMode: 'automatic' as const
    }

    it('should create project successfully', async () => {
      const mockProject = createMockProject({ name: 'New Project' })
      vi.mocked(window.dubdesk.project.create).mockResolvedValue({
        success: true,
        project: mockProject
      })

      const result = await useProjectStore.getState().createProject(createData)

      expect(window.dubdesk.project.create).toHaveBeenCalledWith(createData)
      expect(result).toEqual(mockProject)
      expect(useProjectStore.getState().currentProject).toEqual(mockProject)
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(false)
    })

    it('should set isLoading during creation', async () => {
      let loadingDuringCall = false
      vi.mocked(window.dubdesk.project.create).mockImplementation(async () => {
        loadingDuringCall = useProjectStore.getState().isLoading
        return { success: true, project: createMockProject() }
      })

      await useProjectStore.getState().createProject(createData)

      expect(loadingDuringCall).toBe(true)
      expect(useProjectStore.getState().isLoading).toBe(false)
    })

    it('should handle create error from response', async () => {
      vi.mocked(window.dubdesk.project.create).mockResolvedValue({
        success: false,
        error: 'Invalid video format'
      })

      await expect(useProjectStore.getState().createProject(createData)).rejects.toThrow(
        'Invalid video format'
      )

      expect(useProjectStore.getState().error).toBe('Invalid video format')
    })

    it('should handle create exception', async () => {
      vi.mocked(window.dubdesk.project.create).mockRejectedValue(new Error('Disk full'))

      await expect(useProjectStore.getState().createProject(createData)).rejects.toThrow(
        'Disk full'
      )

      expect(useProjectStore.getState().error).toBe('Disk full')
    })
  })

  describe('saveProject', () => {
    it('should do nothing when no project is loaded', async () => {
      await useProjectStore.getState().saveProject()

      expect(window.dubdesk.project.save).not.toHaveBeenCalled()
    })

    it('should save project successfully', async () => {
      useProjectStore.setState({
        currentProject: createMockProject(),
        hasUnsavedChanges: true
      })

      vi.mocked(window.dubdesk.project.save).mockResolvedValue({
        success: true
      })

      await useProjectStore.getState().saveProject()

      expect(window.dubdesk.project.save).toHaveBeenCalledWith('proj-1')
      expect(useProjectStore.getState().isSaving).toBe(false)
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(false)
    })

    it('should set isSaving during save', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      let savingDuringCall = false
      vi.mocked(window.dubdesk.project.save).mockImplementation(async () => {
        savingDuringCall = useProjectStore.getState().isSaving
        return { success: true }
      })

      await useProjectStore.getState().saveProject()

      expect(savingDuringCall).toBe(true)
      expect(useProjectStore.getState().isSaving).toBe(false)
    })

    it('should handle save error from response', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.project.save).mockResolvedValue({
        success: false,
        error: 'Permission denied'
      })

      await expect(useProjectStore.getState().saveProject()).rejects.toThrow('Permission denied')

      expect(useProjectStore.getState().error).toBe('Permission denied')
      expect(useProjectStore.getState().isSaving).toBe(false)
    })

    it('should handle save exception', async () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      vi.mocked(window.dubdesk.project.save).mockRejectedValue(new Error('IO error'))

      await expect(useProjectStore.getState().saveProject()).rejects.toThrow('IO error')

      expect(useProjectStore.getState().error).toBe('IO error')
    })
  })

  describe('updateProject', () => {
    it('should do nothing when no project is loaded', () => {
      useProjectStore.getState().updateProject({ name: 'New Name' })

      expect(useProjectStore.getState().currentProject).toBe(null)
    })

    it('should update project and mark as unsaved', () => {
      useProjectStore.setState({
        currentProject: createMockProject(),
        hasUnsavedChanges: false
      })

      useProjectStore.getState().updateProject({ name: 'Updated Name' })

      expect(useProjectStore.getState().currentProject?.name).toBe('Updated Name')
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(true)
    })

    it('should merge updates with existing project', () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      useProjectStore.getState().updateProject({ status: 'completed' })

      const project = useProjectStore.getState().currentProject
      expect(project?.status).toBe('completed')
      expect(project?.name).toBe('Test Project') // Original values preserved
    })
  })

  describe('updateSettings', () => {
    it('should do nothing when no project is loaded', () => {
      useProjectStore.getState().updateSettings({ duckingLevel: 0.5 })

      expect(useProjectStore.getState().currentProject).toBe(null)
    })

    it('should update settings and mark as unsaved', () => {
      useProjectStore.setState({
        currentProject: createMockProject(),
        hasUnsavedChanges: false
      })

      useProjectStore.getState().updateSettings({ duckingLevel: 0.5 })

      expect(useProjectStore.getState().currentProject?.settings.duckingLevel).toBe(0.5)
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(true)
    })

    it('should merge settings with existing settings', () => {
      useProjectStore.setState({ currentProject: createMockProject() })

      useProjectStore.getState().updateSettings({ crossfadeDuration: 200 })

      const settings = useProjectStore.getState().currentProject?.settings
      expect(settings?.crossfadeDuration).toBe(200)
      expect(settings?.duckingLevel).toBe(0.3) // Original value preserved
    })
  })

  describe('closeProject', () => {
    it('should reset project state', () => {
      useProjectStore.setState({
        currentProject: createMockProject(),
        hasUnsavedChanges: true,
        error: 'Some error'
      })

      useProjectStore.getState().closeProject()

      expect(useProjectStore.getState().currentProject).toBe(null)
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(false)
      expect(useProjectStore.getState().error).toBe(null)
    })
  })

  describe('loadRecentProjects', () => {
    it('should load recent projects successfully', async () => {
      const mockRecentProjects = [
        createMockRecentProject({ id: 'proj-1' }),
        createMockRecentProject({ id: 'proj-2', name: 'Project 2' })
      ]

      vi.mocked(window.dubdesk.project.listRecent).mockResolvedValue({
        success: true,
        projects: mockRecentProjects
      })

      await useProjectStore.getState().loadRecentProjects()

      expect(window.dubdesk.project.listRecent).toHaveBeenCalled()
      expect(useProjectStore.getState().recentProjects).toEqual(mockRecentProjects)
    })

    it('should handle load error from response', async () => {
      vi.mocked(window.dubdesk.project.listRecent).mockResolvedValue({
        success: false,
        error: 'Database error'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useProjectStore.getState().loadRecentProjects()

      expect(consoleSpy).toHaveBeenCalled()
      expect(useProjectStore.getState().recentProjects).toEqual([])
    })

    it('should handle load exception', async () => {
      vi.mocked(window.dubdesk.project.listRecent).mockRejectedValue(new Error('Network error'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useProjectStore.getState().loadRecentProjects()

      expect(consoleSpy).toHaveBeenCalledWith('Failed to load recent projects:', expect.any(Error))
    })
  })

  describe('deleteProject', () => {
    it('should delete project successfully', async () => {
      const recentProjects = [
        createMockRecentProject({ id: 'proj-1' }),
        createMockRecentProject({ id: 'proj-2', name: 'Project 2' })
      ]
      useProjectStore.setState({ recentProjects })

      vi.mocked(window.dubdesk.project.delete).mockResolvedValue({
        success: true
      })

      await useProjectStore.getState().deleteProject('proj-1')

      expect(window.dubdesk.project.delete).toHaveBeenCalledWith('proj-1')
      expect(useProjectStore.getState().recentProjects).toHaveLength(1)
      expect(useProjectStore.getState().recentProjects[0].id).toBe('proj-2')
    })

    it('should close current project if deleted', async () => {
      useProjectStore.setState({
        currentProject: createMockProject({ id: 'proj-1' }),
        recentProjects: [createMockRecentProject({ id: 'proj-1' })]
      })

      vi.mocked(window.dubdesk.project.delete).mockResolvedValue({
        success: true
      })

      await useProjectStore.getState().deleteProject('proj-1')

      expect(useProjectStore.getState().currentProject).toBe(null)
    })

    it('should not close current project if different project deleted', async () => {
      useProjectStore.setState({
        currentProject: createMockProject({ id: 'proj-1' }),
        recentProjects: [
          createMockRecentProject({ id: 'proj-1' }),
          createMockRecentProject({ id: 'proj-2' })
        ]
      })

      vi.mocked(window.dubdesk.project.delete).mockResolvedValue({
        success: true
      })

      await useProjectStore.getState().deleteProject('proj-2')

      expect(useProjectStore.getState().currentProject?.id).toBe('proj-1')
    })

    it('should handle delete error from response', async () => {
      vi.mocked(window.dubdesk.project.delete).mockResolvedValue({
        success: false,
        error: 'Project in use'
      })

      await expect(useProjectStore.getState().deleteProject('proj-1')).rejects.toThrow(
        'Project in use'
      )

      expect(useProjectStore.getState().error).toBe('Project in use')
    })

    it('should handle delete exception', async () => {
      vi.mocked(window.dubdesk.project.delete).mockRejectedValue(new Error('Permission denied'))

      await expect(useProjectStore.getState().deleteProject('proj-1')).rejects.toThrow(
        'Permission denied'
      )

      expect(useProjectStore.getState().error).toBe('Permission denied')
    })
  })

  describe('setUnsavedChanges', () => {
    it('should set hasUnsavedChanges to true', () => {
      useProjectStore.getState().setUnsavedChanges(true)
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(true)
    })

    it('should set hasUnsavedChanges to false', () => {
      useProjectStore.setState({ hasUnsavedChanges: true })
      useProjectStore.getState().setUnsavedChanges(false)
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(false)
    })
  })

  describe('clearError', () => {
    it('should clear the error', () => {
      useProjectStore.setState({ error: 'Some error' })

      useProjectStore.getState().clearError()

      expect(useProjectStore.getState().error).toBe(null)
    })
  })
})
