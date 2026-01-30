import { useProjectStore } from '@renderer/stores/project.store'
import { selectStaleSegmentCount, useSegmentStore } from '@renderer/stores/segment.store'
import { useUIStore } from '@renderer/stores/ui.store'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExportSettings } from '../modals/ExportSettingsModal'

type WorkflowStage =
  | 'idle'
  | 'transcribing'
  | 'translating'
  | 'generating'
  | 'regenerating'
  | 'exporting'

interface WorkflowProgress {
  stage: WorkflowStage
  progress: number
  message: string
}

export function WorkflowToolbar(): React.JSX.Element | null {
  const currentProject = useProjectStore((state) => state.currentProject)
  const segments = useSegmentStore((state) => state.segments)
  const loadSegments = useSegmentStore((state) => state.loadSegments)
  const loadSpeakers = useSegmentStore((state) => state.loadSpeakers)
  const batchUpdateSegments = useSegmentStore((state) => state.batchUpdateSegments)
  const regenerateAllStaleAudio = useSegmentStore((state) => state.regenerateAllStaleAudio)
  const staleSegmentCount = useSegmentStore(selectStaleSegmentCount)
  const addToast = useUIStore((state) => state.addToast)
  const openModal = useUIStore((state) => state.openModal)

  const [workflowState, setWorkflowState] = useState<WorkflowProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  })
  const isGeneratingRef = useRef(false)

  const isRunning = workflowState.stage !== 'idle'

  // Subscribe to batch progress events during generation
  useEffect(() => {
    if (workflowState.stage !== 'generating') {
      isGeneratingRef.current = false
      return
    }

    isGeneratingRef.current = true

    const unsubscribe = window.dubdesk.tts.onBatchProgress((rawProgress: unknown) => {
      if (!isGeneratingRef.current) return

      const progress = rawProgress as { current: number; total: number; segmentId: string }
      if (typeof progress.current !== 'number' || typeof progress.total !== 'number') return

      const percent = Math.round((progress.current / progress.total) * 80) // Leave 20% for saving
      setWorkflowState({
        stage: 'generating',
        progress: percent,
        message: `Generating audio ${progress.current}/${progress.total}...`
      })
    })

    return () => {
      unsubscribe()
    }
  }, [workflowState.stage])

  const handleTranscribe = useCallback(async () => {
    if (!currentProject?.sourceVideoPath) {
      addToast('error', 'No video file in project')
      return
    }

    setWorkflowState({ stage: 'transcribing', progress: 0, message: 'Starting transcription...' })

    try {
      const result = await window.dubdesk.transcription.start({
        audioPath: currentProject.sourceVideoPath,
        projectId: currentProject.id,
        options: {
          languageCode: currentProject.sourceLanguage,
          diarize: true,
          timestampsGranularity: 'word'
        }
      })

      if (result.success && result.data?.segments) {
        // Create segments from transcription results
        setWorkflowState({ stage: 'transcribing', progress: 50, message: 'Saving segments...' })

        // Group segments by speaker label for potential speaker creation
        const speakerLabels = new Set<string>()
        for (const segment of result.data.segments) {
          if (segment.speaker) {
            speakerLabels.add(segment.speaker)
          }
        }

        // Create speakers for each unique label
        const speakerMap = new Map<string, string>() // label -> database ID
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
        let colorIndex = 0
        for (const label of speakerLabels) {
          try {
            const speakerResult = await window.dubdesk.speaker.create({
              projectId: currentProject.id,
              name: label.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()), // "speaker_1" -> "Speaker 1"
              color: colors[colorIndex % colors.length]
            })
            if (speakerResult.success && speakerResult.speaker?.id) {
              speakerMap.set(label, speakerResult.speaker.id)
            }
            colorIndex++
          } catch (e) {
            console.warn(`Failed to create speaker for label "${label}":`, e)
          }
        }

        // Create segments with proper speaker IDs
        for (const segment of result.data.segments) {
          await window.dubdesk.segment.create({
            projectId: currentProject.id,
            originalText: segment.text,
            translatedText: '',
            startTimeMs: segment.startTimeMs,
            endTimeMs: segment.endTimeMs,
            speakerId: segment.speaker ? speakerMap.get(segment.speaker) : undefined
          })
        }

        // Reload segments and speakers to update the store
        await loadSegments(currentProject.id)
        await loadSpeakers(currentProject.id)

        addToast('success', `Transcription complete: ${result.data.segments.length} segments`)
      } else {
        addToast('error', result.error || 'Transcription failed')
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Transcription failed')
    } finally {
      setWorkflowState({ stage: 'idle', progress: 0, message: '' })
    }
  }, [currentProject, addToast, loadSegments, loadSpeakers])

  const handleTranslate = useCallback(async () => {
    if (!currentProject) {
      addToast('error', 'No project open')
      return
    }

    const currentSegments = segments || []
    if (currentSegments.length === 0) {
      addToast('error', 'No segments to translate. Run transcription first.')
      return
    }

    // Filter segments that need translation (have original text but no translated text)
    const segmentsToTranslate = currentSegments.filter(
      (s) => s.originalText && !s.translatedText?.trim()
    )

    if (segmentsToTranslate.length === 0) {
      addToast('info', 'All segments are already translated')
      return
    }

    setWorkflowState({
      stage: 'translating',
      progress: 0,
      message: `Translating ${segmentsToTranslate.length} segments...`
    })

    try {
      const result = await window.dubdesk.translation.translateBatch({
        segments: segmentsToTranslate.map((s) => ({
          id: s.id,
          text: s.originalText || ''
        })),
        options: {
          sourceLanguage: currentProject.sourceLanguage || 'en',
          targetLanguage: currentProject.targetLanguage || 'es'
        }
      })

      if (result.success && result.data) {
        // Update segments with translated text
        setWorkflowState({ stage: 'translating', progress: 80, message: 'Saving translations...' })

        const updates = result.data.map((r: { id: string; translatedText: string }) => ({
          id: r.id,
          updates: { translatedText: r.translatedText }
        }))

        await batchUpdateSegments(updates)
        addToast('success', `Translated ${result.data.length} segments`)
      } else {
        addToast('error', result.error || 'Translation failed')
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Translation failed')
    } finally {
      setWorkflowState({ stage: 'idle', progress: 0, message: '' })
    }
  }, [currentProject, segments, addToast, batchUpdateSegments])

  const handleGenerate = useCallback(async () => {
    if (!currentProject) {
      addToast('error', 'No project open')
      return
    }

    // Filter segments that have translated text but no audio
    const currentSegments = segments || []
    const segmentsToGenerate = currentSegments.filter(
      (s) => s.translatedText?.trim() && !s.audioFilePath
    )

    if (segmentsToGenerate.length === 0) {
      if (currentSegments.length === 0) {
        addToast('error', 'No segments available. Run transcription first.')
      } else if (!currentSegments.some((s) => s.translatedText?.trim())) {
        addToast('error', 'No translated text. Run translation first.')
      } else {
        addToast('info', 'All segments already have generated audio')
      }
      return
    }

    setWorkflowState({
      stage: 'generating',
      progress: 0,
      message: `Generating audio for ${segmentsToGenerate.length} segments...`
    })

    try {
      // Get first available voice as default for segments without voice assigned
      const voicesResult = await window.dubdesk.tts.getVoices()
      if (!voicesResult.success || !voicesResult.data.length) {
        addToast('error', 'No voices available. Please check your ElevenLabs API key.')
        setWorkflowState({ stage: 'idle', progress: 0, message: '' })
        return
      }

      const defaultVoice = voicesResult.data[0]
      const voiceIdToUse = defaultVoice.voice_id

      // Get output directory
      const tempDir = await window.dubdesk.fs.getTempDir()
      const outputDir = `${tempDir.path}/dubdesk/${currentProject.id}/audio`

      // Start batch generation
      const result = await window.dubdesk.tts.generateBatch({
        segments: segmentsToGenerate.map((s) => ({
          id: s.id,
          text: s.translatedText || '',
          voiceId: s.voiceId // Use segment's voice if set, otherwise batch will use default
        })),
        outputDir,
        options: { defaultVoiceId: voiceIdToUse }
      })

      if (result.success && result.data) {
        // Update segments with audio paths
        setWorkflowState({ stage: 'generating', progress: 90, message: 'Saving audio info...' })

        const updates = result.data.map(
          (r: { segmentId: string; audioPath: string; durationMs: number }) => ({
            id: r.segmentId,
            updates: {
              audioFilePath: r.audioPath,
              audioDurationMs: r.durationMs
            }
          })
        )

        await batchUpdateSegments(updates)
        addToast('success', `Generated audio for ${result.data.length} segments`)
      } else {
        addToast('error', result.error || 'Audio generation failed')
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Audio generation failed')
    } finally {
      setWorkflowState({ stage: 'idle', progress: 0, message: '' })
    }
  }, [currentProject, segments, addToast, batchUpdateSegments])

  const handleRegenerateStale = useCallback(async () => {
    if (!currentProject) {
      addToast('error', 'No project open')
      return
    }

    if (staleSegmentCount === 0) {
      addToast('info', 'No stale segments to regenerate')
      return
    }

    setWorkflowState({
      stage: 'regenerating',
      progress: 0,
      message: `Regenerating ${staleSegmentCount} stale segment(s)...`
    })

    try {
      await regenerateAllStaleAudio()
      addToast('success', `Regenerated audio for ${staleSegmentCount} segment(s)`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Regeneration failed')
    } finally {
      setWorkflowState({ stage: 'idle', progress: 0, message: '' })
    }
  }, [currentProject, staleSegmentCount, regenerateAllStaleAudio, addToast])

  // Perform the actual export with the provided settings
  const performExport = useCallback(
    async (mode: 'video' | 'audio-only', exportSettings: ExportSettings) => {
      if (!currentProject) {
        addToast('error', 'No project open')
        return
      }

      // Check if we have audio segments to mix
      const currentSegments = segments || []
      const segmentsWithAudio = currentSegments.filter((s) => s.audioFilePath)
      if (segmentsWithAudio.length === 0) {
        addToast('error', 'No audio segments. Generate audio first.')
        return
      }

      // Open save dialog with the selected format
      const isAudioOnly = mode === 'audio-only'
      const selectedFormat = exportSettings.format

      // Map format to filter info
      const formatFilters: Record<string, { name: string; extensions: string[] }> = {
        mp4: { name: 'MP4 Video', extensions: ['mp4'] },
        mkv: { name: 'MKV Video', extensions: ['mkv'] },
        mov: { name: 'MOV Video', extensions: ['mov'] },
        m4a: { name: 'AAC Audio', extensions: ['m4a'] },
        mp3: { name: 'MP3 Audio', extensions: ['mp3'] },
        wav: { name: 'WAV Audio', extensions: ['wav'] },
        flac: { name: 'FLAC Audio', extensions: ['flac'] }
      }

      const selectedFilter =
        formatFilters[selectedFormat] || formatFilters[isAudioOnly ? 'm4a' : 'mp4']

      const saveResult = await window.dubdesk.fs.saveDialog({
        title: isAudioOnly ? 'Export Audio' : 'Export Video',
        defaultPath: `${currentProject.name}_dubbed.${selectedFormat}`,
        filters: [selectedFilter]
      })

      if (!saveResult.success || saveResult.canceled || !saveResult.filePath) {
        return
      }

      setWorkflowState({ stage: 'exporting', progress: 0, message: 'Extracting audio...' })

      // Subscribe to FFmpeg progress events
      const unsubscribeProgress = window.dubdesk.ffmpeg.onExportProgress((rawProgress: unknown) => {
        const progress = rawProgress as { stage?: string; percent?: number }
        const stage = progress.stage || 'processing'
        const percent = progress.percent || 0

        // Calculate overall progress based on stage
        // Extraction: 0-10%, Mixing: 10-60%, Encoding: 60-100%
        let overallProgress = 0
        let message = 'Processing...'

        if (stage === 'mixing') {
          overallProgress = 10 + percent * 0.5 // 10-60%
          message = `Mixing audio... ${Math.round(percent)}%`
        } else if (stage === 'encoding' || stage === 'encoding-audio') {
          overallProgress = 60 + percent * 0.4 // 60-100%
          message = `Encoding ${isAudioOnly ? 'audio' : 'video'}... ${Math.round(percent)}%`
        }

        if (overallProgress > 0) {
          setWorkflowState({
            stage: 'exporting',
            progress: overallProgress,
            message
          })
        }
      })

      try {
        // Get temp directory for intermediate files
        const tempDir = await window.dubdesk.fs.getTempDir()
        const projectTempDir = `${tempDir.path}/dubdesk/${currentProject.id}`

        // Extract original audio
        const originalAudioPath = `${projectTempDir}/original_audio.wav`
        await window.dubdesk.ffmpeg.extractAudio(
          currentProject.sourceVideoPath,
          originalAudioPath,
          {
            format: 'wav'
          }
        )

        setWorkflowState({ stage: 'exporting', progress: 10, message: 'Mixing audio... 0%' })

        // Mix dubbed audio with original using volume settings from export settings
        const mixedAudioPath = `${projectTempDir}/mixed_audio.wav`
        const minGapForOriginalMs = currentProject.settings?.minGapForOriginalMs ?? 5000
        await window.dubdesk.ffmpeg.mixAudio({
          originalAudioPath,
          segments: segmentsWithAudio.map((s) => ({
            audioPath: s.audioFilePath!,
            startTimeMs: s.startTimeMs,
            endTimeMs: s.endTimeMs,
            audioDurationMs: s.audioDurationMs
          })),
          outputPath: mixedAudioPath,
          options: {
            originalVolume: exportSettings.originalVolume,
            dubbedVolume: exportSettings.dubbedVolume,
            minGapForOriginalMs
          }
        })

        if (isAudioOnly) {
          // Export audio only
          setWorkflowState({ stage: 'exporting', progress: 60, message: 'Encoding audio... 0%' })

          // Map format to codec
          const codecMap: Record<string, 'aac' | 'mp3' | 'wav' | 'flac'> = {
            m4a: 'aac',
            mp3: 'mp3',
            wav: 'wav',
            flac: 'flac'
          }

          const result = await window.dubdesk.ffmpeg.exportAudio({
            audioPath: mixedAudioPath,
            outputPath: saveResult.filePath,
            options: {
              audioCodec: codecMap[selectedFormat] || 'aac',
              audioBitrate: '192k'
            },
            projectId: currentProject.id
          })

          if (result.success) {
            addToast('success', 'Audio export complete!')
          } else {
            addToast('error', result.error || 'Export failed')
          }
        } else {
          // Export video
          setWorkflowState({ stage: 'exporting', progress: 60, message: 'Encoding video... 0%' })

          const result = await window.dubdesk.ffmpeg.export({
            videoPath: currentProject.sourceVideoPath,
            audioPath: mixedAudioPath,
            outputPath: saveResult.filePath,
            projectId: currentProject.id
          })

          if (result.success) {
            addToast('success', 'Export complete!')
          } else {
            addToast('error', result.error || 'Export failed')
          }
        }
      } catch (error) {
        addToast('error', error instanceof Error ? error.message : 'Export failed')
      } finally {
        // Cleanup progress listener
        unsubscribeProgress()
        setWorkflowState({ stage: 'idle', progress: 0, message: '' })
      }
    },
    [currentProject, segments, addToast]
  )

  // Open the export settings modal
  const handleExport = useCallback(
    (mode: 'video' | 'audio-only' = 'video') => {
      if (!currentProject) {
        addToast('error', 'No project open')
        return
      }

      // Check if we have audio segments to mix
      const currentSegments = segments || []
      const segmentsWithAudio = currentSegments.filter((s) => s.audioFilePath)
      if (segmentsWithAudio.length === 0) {
        addToast('error', 'No audio segments. Generate audio first.')
        return
      }

      // Open export settings modal with callback
      openModal('exportSettings', {
        mode,
        onExport: async (settings: ExportSettings) => {
          try {
            await performExport(mode, settings)
          } catch (error) {
            console.error('Export error:', error)
            addToast('error', error instanceof Error ? error.message : 'Export failed')
          }
        }
      })
    },
    [currentProject, segments, addToast, openModal, performExport]
  )

  const [showExportMenu, setShowExportMenu] = useState(false)

  if (!currentProject) {
    return null
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-chrome-surface border-b border-chrome-border">
      <span className="text-sm text-chrome-muted mr-2">Workflow:</span>

      <WorkflowButton
        onClick={handleTranscribe}
        disabled={isRunning}
        active={workflowState.stage === 'transcribing'}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        }
      >
        1. Transcribe
      </WorkflowButton>

      <svg
        className="w-4 h-4 text-chrome-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>

      <WorkflowButton
        onClick={handleTranslate}
        disabled={isRunning}
        active={workflowState.stage === 'translating'}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
            />
          </svg>
        }
      >
        2. Translate
      </WorkflowButton>

      <svg
        className="w-4 h-4 text-chrome-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>

      <WorkflowButton
        onClick={handleGenerate}
        disabled={isRunning}
        active={workflowState.stage === 'generating'}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.828"
            />
          </svg>
        }
      >
        3. Generate
      </WorkflowButton>

      {/* Regenerate Stale Button - only visible when there are stale segments */}
      {staleSegmentCount > 0 && (
        <WorkflowButton
          onClick={handleRegenerateStale}
          disabled={isRunning}
          active={workflowState.stage === 'regenerating'}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          }
        >
          <span className="flex items-center gap-1">
            Regenerate
            <span className="bg-yellow-500 text-black text-xs rounded-full px-1.5">
              {staleSegmentCount}
            </span>
          </span>
        </WorkflowButton>
      )}

      <svg
        className="w-4 h-4 text-chrome-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>

      <div className="relative">
        <div className="flex">
          <WorkflowButton
            onClick={() => handleExport('video')}
            disabled={isRunning}
            active={workflowState.stage === 'exporting'}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            }
          >
            4. Export
          </WorkflowButton>
          <button
            type="button"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isRunning}
            className={`
              px-1.5 py-1.5 text-sm rounded-r transition-colors -ml-px border-l border-chrome-border
              ${
                isRunning
                  ? 'bg-chrome-hover text-chrome-muted cursor-not-allowed'
                  : 'bg-chrome-hover hover:bg-chrome-active text-chrome-text'
              }
            `}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
        {showExportMenu && (
          <div className="absolute right-0 mt-1 w-48 bg-chrome-surface border border-chrome-border rounded shadow-lg z-50">
            <button
              type="button"
              onClick={() => {
                setShowExportMenu(false)
                handleExport('video')
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-chrome-hover flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Export Video
            </button>
            <button
              type="button"
              onClick={() => {
                setShowExportMenu(false)
                handleExport('audio-only')
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-chrome-hover flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              Export Audio Only
            </button>
          </div>
        )}
      </div>

      {isRunning && (
        <div className="ml-4 flex items-center gap-2">
          <div className="w-32 h-2 bg-chrome-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${workflowState.progress}%` }}
            />
          </div>
          <span className="text-xs text-chrome-muted">{workflowState.message}</span>
        </div>
      )}
    </div>
  )
}

interface WorkflowButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
  icon?: React.ReactNode
}

function WorkflowButton({
  children,
  onClick,
  disabled,
  active,
  icon
}: WorkflowButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors
        ${
          active
            ? 'bg-accent-primary text-white'
            : disabled
              ? 'bg-chrome-hover text-chrome-muted cursor-not-allowed'
              : 'bg-chrome-hover hover:bg-chrome-active text-chrome-text'
        }
      `}
    >
      {active ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
