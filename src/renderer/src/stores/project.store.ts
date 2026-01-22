import type { Project, ProjectSettings, RecentProject } from '@shared/types/project'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'

interface ProjectState {
  currentProject: Project | null
  recentProjects: RecentProject[]
  isLoading: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  error: string | null
}

interface ProjectActions {
  loadProject: (id: string) => Promise<void>
  createProject: (data: {
    name: string
    videoPath: string
    targetLanguage: string
    sourceLanguage?: string
    importMode: 'automatic' | 'csv'
    csvPath?: string
  }) => Promise<Project>
  saveProject: () => Promise<void>
  updateProject: (updates: Partial<Project>) => void
  updateSettings: (settings: Partial<ProjectSettings>) => void
  closeProject: () => void
  loadRecentProjects: () => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setUnsavedChanges: (hasChanges: boolean) => void
  clearError: () => void
}

type ProjectStore = ProjectState & ProjectActions

const initialState: ProjectState = {
  currentProject: null,
  recentProjects: [],
  isLoading: false,
  isSaving: false,
  hasUnsavedChanges: false,
  error: null
}

export const useProjectStore = create<ProjectStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      loadProject: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await window.dubdesk.project.open(id)
          if (!response.success) {
            throw new Error(response.error)
          }
          set({
            currentProject: response.project,
            isLoading: false,
            hasUnsavedChanges: false
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load project',
            isLoading: false
          })
          throw error
        }
      },

      createProject: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const response = await window.dubdesk.project.create(data)
          if (!response.success) {
            throw new Error(response.error)
          }
          set({
            currentProject: response.project,
            isLoading: false,
            hasUnsavedChanges: false
          })
          return response.project
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create project',
            isLoading: false
          })
          throw error
        }
      },

      saveProject: async () => {
        const { currentProject } = get()
        if (!currentProject) return

        set({ isSaving: true, error: null })
        try {
          const response = await window.dubdesk.project.save(currentProject.id)
          if (!response.success) {
            throw new Error(response.error)
          }
          set({ isSaving: false, hasUnsavedChanges: false })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to save project',
            isSaving: false
          })
          throw error
        }
      },

      updateProject: (updates) => {
        const { currentProject } = get()
        if (!currentProject) return

        set({
          currentProject: { ...currentProject, ...updates },
          hasUnsavedChanges: true
        })
      },

      updateSettings: (settings) => {
        const { currentProject } = get()
        if (!currentProject) return

        set({
          currentProject: {
            ...currentProject,
            settings: { ...currentProject.settings, ...settings } as ProjectSettings
          },
          hasUnsavedChanges: true
        })
      },

      closeProject: () => {
        set({
          currentProject: null,
          hasUnsavedChanges: false,
          error: null
        })
      },

      loadRecentProjects: async () => {
        try {
          const response = await window.dubdesk.project.listRecent()
          if (!response.success) {
            throw new Error(response.error)
          }
          set({ recentProjects: response.projects })
        } catch (error) {
          console.error('Failed to load recent projects:', error)
        }
      },

      deleteProject: async (id: string) => {
        try {
          const response = await window.dubdesk.project.delete(id)
          if (!response.success) {
            throw new Error(response.error)
          }
          const { currentProject, recentProjects } = get()
          if (currentProject?.id === id) {
            set({ currentProject: null })
          }
          set({
            recentProjects: recentProjects.filter((p) => p.id !== id)
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete project'
          })
          throw error
        }
      },

      setUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),

      clearError: () => set({ error: null })
    })),
    { name: 'project-store' }
  )
)
