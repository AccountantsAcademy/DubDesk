/**
 * Workflow Service
 * Main entry point for dubbing workflow orchestration
 */

export * from './export'
export * from './generate'
export * from './transcribe'
export * from './translate'

import type { BrowserWindow } from 'electron'

export type WorkflowStage = 'idle' | 'transcribing' | 'translating' | 'generating' | 'exporting'

export interface WorkflowProgress {
  stage: WorkflowStage
  progress: number // 0-100
  message: string
  segmentId?: string
  error?: string
}

export interface WorkflowState {
  projectId: string
  stage: WorkflowStage
  progress: number
  startedAt?: Date
  completedAt?: Date
  error?: string
}

// Track active workflows
const activeWorkflows = new Map<string, WorkflowState>()

/**
 * Get the current workflow state for a project
 */
export function getWorkflowState(projectId: string): WorkflowState | undefined {
  return activeWorkflows.get(projectId)
}

/**
 * Set workflow state
 */
export function setWorkflowState(projectId: string, state: Partial<WorkflowState>): void {
  const current = activeWorkflows.get(projectId) || {
    projectId,
    stage: 'idle' as WorkflowStage,
    progress: 0
  }

  activeWorkflows.set(projectId, { ...current, ...state })
}

/**
 * Clear workflow state
 */
export function clearWorkflowState(projectId: string): void {
  activeWorkflows.delete(projectId)
}

/**
 * Send workflow progress to renderer
 */
export function sendWorkflowProgress(
  window: BrowserWindow | null,
  channel: string,
  progress: WorkflowProgress
): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, progress)
  }
}

/**
 * Check if a workflow is currently running for a project
 */
export function isWorkflowRunning(projectId: string): boolean {
  const state = activeWorkflows.get(projectId)
  return state !== undefined && state.stage !== 'idle'
}

/**
 * Cancel a running workflow
 */
export function cancelWorkflow(projectId: string): boolean {
  const state = activeWorkflows.get(projectId)
  if (state && state.stage !== 'idle') {
    activeWorkflows.delete(projectId)
    return true
  }
  return false
}
