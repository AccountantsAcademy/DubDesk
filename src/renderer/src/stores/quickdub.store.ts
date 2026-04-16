/**
 * Quick Dub Store
 * Manages the multi-step Quick Dub wizard state
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

type QuickDubStep =
  | 'idle'
  | 'transcribing'
  | 'editing'
  | 'cloning'
  | 'generating'
  | 'lipsyncing'
  | 'complete'
  | 'error'

interface QuickDubState {
  step: QuickDubStep
  rangeStartMs: number | null
  rangeEndMs: number | null
  transcribedText: string
  editedText: string
  clonedVoiceId: string | null
  generatedSegmentId: string | null
  generatedAudioPath: string | null
  lipsyncVideoPath: string | null
  skipLipsync: boolean
  isProcessing: boolean
  error: string | null
}

interface QuickDubActions {
  /** Start the Quick Dub workflow: transcribe the selected range */
  startQuickDub: (
    startMs: number,
    endMs: number,
    projectId: string,
    audioPath: string,
    language?: string
  ) => Promise<void>
  /** Update the edited text */
  setEditedText: (text: string) => void
  /** Clone voice, generate audio, and lip-sync */
  generateAudio: (
    projectId: string,
    audioPath: string,
    videoPath: string,
    projectName: string
  ) => Promise<void>
  /** Toggle skip lip-sync flag */
  setSkipLipsync: (skip: boolean) => void
  /** Cancel the workflow and reset */
  cancel: () => void
  /** Reset to idle state */
  reset: () => void
}

type QuickDubStore = QuickDubState & QuickDubActions

const initialState: QuickDubState = {
  step: 'idle',
  rangeStartMs: null,
  rangeEndMs: null,
  transcribedText: '',
  editedText: '',
  clonedVoiceId: null,
  generatedSegmentId: null,
  generatedAudioPath: null,
  lipsyncVideoPath: null,
  skipLipsync: false,
  isProcessing: false,
  error: null
}

export const useQuickDubStore = create<QuickDubStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      startQuickDub: async (startMs, endMs, projectId, audioPath, language) => {
        set({
          step: 'transcribing',
          rangeStartMs: startMs,
          rangeEndMs: endMs,
          isProcessing: true,
          error: null,
          transcribedText: '',
          editedText: '',
          generatedSegmentId: null,
          generatedAudioPath: null,
          lipsyncVideoPath: null
        })

        try {
          const response = await window.dubdesk.quickDub.transcribeRange({
            projectId,
            audioPath,
            startTimeMs: startMs,
            endTimeMs: endMs,
            language
          })

          if (!response.success) {
            throw new Error(response.error || 'Transcription failed')
          }

          const text = response.data.text
          set({
            step: 'editing',
            transcribedText: text,
            editedText: text,
            isProcessing: false
          })
        } catch (error) {
          set({
            step: 'error',
            isProcessing: false,
            error: error instanceof Error ? error.message : 'Transcription failed'
          })
        }
      },

      setEditedText: (text) => set({ editedText: text }),

      setSkipLipsync: (skip) => set({ skipLipsync: skip }),

      generateAudio: async (projectId, audioPath, videoPath, projectName) => {
        const { editedText, rangeStartMs, rangeEndMs } = get()

        if (!editedText.trim() || rangeStartMs === null || rangeEndMs === null) {
          set({ error: 'Missing text or range', step: 'error' })
          return
        }

        // Step 1: Clone voice (if needed)
        set({ step: 'cloning', isProcessing: true, error: null })

        try {
          const cloneResponse = await window.dubdesk.quickDub.cloneVoice({
            projectId,
            audioPath,
            voiceName: `${projectName} - Quick Dub Voice`
          })

          if (!cloneResponse.success) {
            throw new Error(cloneResponse.error || 'Voice cloning failed')
          }

          const voiceId = cloneResponse.data.voiceId
          set({ clonedVoiceId: voiceId })

          // Step 2: Generate TTS
          set({ step: 'generating' })

          const generateResponse = await window.dubdesk.quickDub.generate({
            projectId,
            text: editedText,
            voiceId,
            startTimeMs: rangeStartMs,
            endTimeMs: rangeEndMs
          })

          if (!generateResponse.success) {
            throw new Error(generateResponse.error || 'Audio generation failed')
          }

          const segmentId = generateResponse.data.segmentId
          const generatedAudioPath = generateResponse.data.audioPath
          set({ generatedSegmentId: segmentId, generatedAudioPath })

          // Step 3: Lip-sync (unless skipped by user)
          const { skipLipsync } = get()
          if (skipLipsync) {
            set({ step: 'complete', isProcessing: false })
            return
          }

          set({ step: 'lipsyncing' })

          try {
            const lipsyncResponse = await window.dubdesk.quickDub.lipsync({
              projectId,
              segmentId,
              videoPath,
              audioPath: generatedAudioPath,
              startTimeMs: rangeStartMs,
              endTimeMs: rangeEndMs
            })

            if (lipsyncResponse.success) {
              set({ lipsyncVideoPath: lipsyncResponse.data.lipsyncVideoPath })
            }
            // If lip-sync fails, we still complete (audio-only is fine)
          } catch {
            console.log('[QuickDub] Lip-sync skipped or failed, completing with audio only')
          }

          set({
            step: 'complete',
            isProcessing: false
          })
        } catch (error) {
          set({
            step: 'error',
            isProcessing: false,
            error: error instanceof Error ? error.message : 'Generation failed'
          })
        }
      },

      cancel: () => {
        set(initialState)
      },

      reset: () => {
        set(initialState)
      }
    }),
    { name: 'quickdub-store' }
  )
)
