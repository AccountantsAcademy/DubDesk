/**
 * Speaker Manager Modal
 * Allows creating, editing, and deleting speakers
 */

import { useProjectStore } from '@renderer/stores/project.store'
import { useSegmentStore } from '@renderer/stores/segment.store'
import { useUIStore } from '@renderer/stores/ui.store'
import { getNextSpeakerColor, SPEAKER_COLORS, type Speaker } from '@shared/types/segment'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { VoiceSelector } from '../voices/VoiceSelector'

interface EditingSpeaker {
  id?: string
  name: string
  color: string
  defaultVoiceId?: string
}

export function SpeakerManagerModal(): React.JSX.Element | null {
  const isOpen = useUIStore((state) => state.modals.speakerManager.isOpen)
  const closeModal = useUIStore((state) => state.closeModal)
  const addToast = useUIStore((state) => state.addToast)

  const currentProject = useProjectStore((state) => state.currentProject)
  const speakers = useSegmentStore((state) => state.speakers)
  const segments = useSegmentStore((state) => state.segments)
  const selectedSegmentIds = useSegmentStore((state) => state.selectedSegmentIds)
  const createSpeaker = useSegmentStore((state) => state.createSpeaker)
  const updateSpeaker = useSegmentStore((state) => state.updateSpeaker)
  const deleteSpeaker = useSegmentStore((state) => state.deleteSpeaker)
  const batchUpdateSegments = useSegmentStore((state) => state.batchUpdateSegments)

  const [editingSpeaker, setEditingSpeaker] = useState<EditingSpeaker | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setEditingSpeaker(null)
      setIsDeleting(null)
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    closeModal('speakerManager')
  }, [closeModal])

  const handleNewSpeaker = useCallback(() => {
    setEditingSpeaker({
      name: '',
      color: getNextSpeakerColor(speakers)
    })
  }, [speakers])

  const handleEditSpeaker = useCallback((speaker: Speaker) => {
    setEditingSpeaker({
      id: speaker.id,
      name: speaker.name,
      color: speaker.color,
      defaultVoiceId: speaker.defaultVoiceId
    })
  }, [])

  const handleSaveSpeaker = useCallback(async () => {
    if (!editingSpeaker || !currentProject) return
    if (!editingSpeaker.name.trim()) {
      addToast('error', 'Speaker name is required')
      return
    }

    try {
      if (editingSpeaker.id) {
        // Update existing speaker
        await updateSpeaker(editingSpeaker.id, {
          name: editingSpeaker.name,
          color: editingSpeaker.color,
          defaultVoiceId: editingSpeaker.defaultVoiceId
        })
        addToast('success', 'Speaker updated')
      } else {
        // Create new speaker
        await createSpeaker({
          projectId: currentProject.id,
          name: editingSpeaker.name,
          color: editingSpeaker.color,
          defaultVoiceId: editingSpeaker.defaultVoiceId
        })
        addToast('success', 'Speaker created')
      }
      setEditingSpeaker(null)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to save speaker')
    }
  }, [editingSpeaker, currentProject, updateSpeaker, createSpeaker, addToast])

  const handleDeleteSpeaker = useCallback(
    async (id: string) => {
      try {
        await deleteSpeaker(id)
        addToast('success', 'Speaker deleted')
        setIsDeleting(null)
      } catch (error) {
        addToast('error', error instanceof Error ? error.message : 'Failed to delete speaker')
      }
    },
    [deleteSpeaker, addToast]
  )

  const handleAssignToSelected = useCallback(
    async (speakerId: string) => {
      if (selectedSegmentIds.size === 0) {
        addToast('info', 'No segments selected')
        return
      }

      const updates = Array.from(selectedSegmentIds).map((id) => ({
        id,
        updates: { speakerId }
      }))

      try {
        await batchUpdateSegments(updates)
        addToast('success', `Assigned speaker to ${updates.length} segment(s)`)
      } catch (error) {
        addToast('error', error instanceof Error ? error.message : 'Failed to assign speaker')
      }
    },
    [selectedSegmentIds, batchUpdateSegments, addToast]
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-chrome-surface border border-chrome-border rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-chrome-border">
          <h2 className="text-lg font-medium">Speaker Manager</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-chrome-muted hover:text-chrome-text"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {editingSpeaker ? (
            <SpeakerForm
              speaker={editingSpeaker}
              onChange={setEditingSpeaker}
              onSave={handleSaveSpeaker}
              onCancel={() => setEditingSpeaker(null)}
            />
          ) : (
            <div className="space-y-4">
              {/* Speaker List */}
              {speakers.length === 0 ? (
                <p className="text-sm text-chrome-muted text-center py-8">
                  No speakers yet. Create one to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {speakers.map((speaker) => {
                    const segmentCount = segments.filter((s) => s.speakerId === speaker.id).length

                    return (
                      <div
                        key={speaker.id}
                        className="flex items-center gap-3 p-3 bg-chrome-bg rounded border border-chrome-border"
                      >
                        {/* Color Swatch */}
                        <div
                          className="w-6 h-6 rounded-full flex-shrink-0"
                          style={{ backgroundColor: speaker.color }}
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{speaker.name}</div>
                          <div className="text-xs text-chrome-muted">
                            {segmentCount} segment{segmentCount !== 1 ? 's' : ''}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {selectedSegmentIds.size > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAssignToSelected(speaker.id)}
                              className="px-2 py-1 text-xs bg-chrome-hover hover:bg-chrome-active rounded"
                              title="Assign to selected segments"
                            >
                              Assign
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEditSpeaker(speaker)}
                            className="p-1 text-chrome-muted hover:text-chrome-text rounded hover:bg-chrome-hover"
                            title="Edit speaker"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                          {isDeleting === speaker.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteSpeaker(speaker.id)}
                                className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsDeleting(null)}
                                className="px-2 py-1 text-xs bg-chrome-hover hover:bg-chrome-active rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsDeleting(speaker.id)}
                              className="p-1 text-chrome-muted hover:text-red-400 rounded hover:bg-chrome-hover"
                              title="Delete speaker"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* New Speaker Button */}
              <button
                type="button"
                onClick={handleNewSpeaker}
                className="w-full py-2 px-4 border-2 border-dashed border-chrome-border rounded-lg text-sm text-chrome-muted hover:border-accent-primary hover:text-accent-primary transition-colors"
              >
                + Add Speaker
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SpeakerFormProps {
  speaker: EditingSpeaker
  onChange: (speaker: EditingSpeaker) => void
  onSave: () => void
  onCancel: () => void
}

function SpeakerForm({ speaker, onChange, onSave, onCancel }: SpeakerFormProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <h3 className="font-medium">{speaker.id ? 'Edit Speaker' : 'New Speaker'}</h3>

      {/* Name */}
      <div>
        <label className="block text-sm text-chrome-muted mb-1">Name</label>
        <input
          type="text"
          value={speaker.name}
          onChange={(e) => onChange({ ...speaker, name: e.target.value })}
          className="w-full px-3 py-2 bg-chrome-bg border border-chrome-border rounded text-sm"
          placeholder="Speaker name..."
        />
      </div>

      {/* Color */}
      <div>
        <label className="block text-sm text-chrome-muted mb-1">Color</label>
        <div className="flex flex-wrap gap-2">
          {SPEAKER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange({ ...speaker, color })}
              className={`w-8 h-8 rounded-full border-2 transition-transform ${
                speaker.color === color
                  ? 'border-white scale-110'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Default Voice */}
      <div>
        <label className="block text-sm text-chrome-muted mb-1">Default Voice</label>
        <VoiceSelector
          value={speaker.defaultVoiceId}
          onChange={(voiceId) => onChange({ ...speaker, defaultVoiceId: voiceId })}
          placeholder="Select default voice..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm bg-chrome-hover hover:bg-chrome-active rounded"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-2 text-sm bg-accent-primary hover:bg-accent-primary-hover text-white rounded"
        >
          {speaker.id ? 'Save Changes' : 'Create Speaker'}
        </button>
      </div>
    </div>
  )
}
