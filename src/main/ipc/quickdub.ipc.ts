/**
 * Quick Dub IPC Handlers
 * Handles voice cloning, partial transcription, and TTS generation for Quick Dub mode
 */

import { stat } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { projectRepository, segmentRepository } from '../services/database/repositories'
import { cloneVoiceFromAudio, transcribeAudio } from '../services/elevenlabs'
import { generateSpeech } from '../services/elevenlabs/tts'
import { extractAudioSegment, extractVideoClip } from '../services/ffmpeg/extract'
import { stretchAudioToDuration } from '../services/ffmpeg/stretch'
import {
  downloadLipsyncResult,
  submitLipsync,
  waitForLipsync
} from '../services/syncso/lipsync'
import { createHandler } from './index'

/** ElevenLabs voice cloning file size limit */
const VOICE_CLONE_MAX_BYTES = 10 * 1024 * 1024 // 10MB (stay under 11MB limit)
/** Duration of sample to extract for voice cloning (ms) */
const VOICE_CLONE_SAMPLE_DURATION_MS = 60_000 // 60 seconds

export function registerQuickDubHandlers(): void {
  // Clone voice from project audio
  createHandler(
    IPC_CHANNELS.QUICK_DUB.CLONE_VOICE,
    async (data: { projectId: string; audioPath: string; voiceName: string }) => {
      const { projectId, audioPath, voiceName } = data

      // Check if project already has a cloned voice
      const project = projectRepository.findById(projectId)
      if (!project) {
        throw new Error(`Project not found: ${projectId}`)
      }

      if (project.settings?.clonedVoiceId) {
        console.log(
          `[QuickDub] Reusing cached cloned voice: ${project.settings.clonedVoiceId}`
        )
        return {
          voiceId: project.settings.clonedVoiceId,
          name: voiceName
        }
      }

      // Extract a sample from the audio to stay under ElevenLabs 11MB limit.
      // Use first ~60s as MP3 which compresses well under 10MB.
      const projectDir = path.join(app.getPath('userData'), 'projects', projectId)
      const samplePath = path.join(projectDir, 'audio', 'voice_clone_sample.mp3')

      const videoDurationMs = project.sourceVideoDurationMs || 0
      const sampleDurationMs = Math.min(VOICE_CLONE_SAMPLE_DURATION_MS, videoDurationMs || VOICE_CLONE_SAMPLE_DURATION_MS)

      console.log(`[QuickDub] Extracting ${sampleDurationMs}ms voice sample from: ${audioPath}`)
      await extractAudioSegment(audioPath, samplePath, 0, sampleDurationMs, {
        format: 'mp3',
        sampleRate: 44100,
        channels: 1,
        bitrate: '128k'
      })

      // Verify file size is under the limit
      const sampleStat = await stat(samplePath)
      if (sampleStat.size > VOICE_CLONE_MAX_BYTES) {
        console.warn(
          `[QuickDub] Voice sample is ${(sampleStat.size / 1024 / 1024).toFixed(1)}MB, may exceed limit`
        )
      }

      console.log(
        `[QuickDub] Cloning voice from sample (${(sampleStat.size / 1024 / 1024).toFixed(1)}MB)`
      )
      const result = await cloneVoiceFromAudio(samplePath, voiceName, {
        description: `Cloned voice for project: ${project.name}`
      })

      // Cache the cloned voice ID in project settings
      projectRepository.update(projectId, {
        settings: { clonedVoiceId: result.voiceId }
      })

      console.log(`[QuickDub] Voice cloned and cached: ${result.voiceId}`)
      return result
    }
  )

  // Transcribe a time range
  createHandler(
    IPC_CHANNELS.QUICK_DUB.TRANSCRIBE_RANGE,
    async (data: {
      projectId: string
      audioPath: string
      startTimeMs: number
      endTimeMs: number
      language?: string
    }) => {
      const { projectId, audioPath, startTimeMs, endTimeMs, language } = data

      // Extract audio for the selected range
      const projectDir = path.join(app.getPath('userData'), 'projects', projectId)
      const tempAudioPath = path.join(
        projectDir,
        'audio',
        `quickdub_${startTimeMs}_${endTimeMs}.wav`
      )

      console.log(
        `[QuickDub] Extracting audio range: ${startTimeMs}ms - ${endTimeMs}ms`
      )

      await extractAudioSegment(audioPath, tempAudioPath, startTimeMs, endTimeMs, {
        format: 'wav',
        sampleRate: 16000,
        channels: 1
      })

      // Transcribe the extracted audio
      console.log('[QuickDub] Transcribing extracted audio...')
      const transcription = await transcribeAudio(tempAudioPath, {
        languageCode: language,
        timestampsGranularity: 'word',
        tagAudioEvents: false
      })

      // Offset segment timestamps by startTimeMs (since they're relative to the clip)
      const segments = transcription.segments.map((seg) => ({
        text: seg.text,
        startTimeMs: seg.startTimeMs + startTimeMs,
        endTimeMs: seg.endTimeMs + startTimeMs,
        speaker: seg.speaker
      }))

      // Combine all segment text
      const text = segments.map((s) => s.text).join(' ')

      console.log(
        `[QuickDub] Transcription complete: ${segments.length} segments, "${text.slice(0, 80)}..."`
      )

      return { text, segments }
    }
  )

  // Generate TTS for quick dub
  createHandler(
    IPC_CHANNELS.QUICK_DUB.GENERATE,
    async (data: {
      projectId: string
      text: string
      voiceId: string
      startTimeMs: number
      endTimeMs: number
    }) => {
      const { projectId, text, voiceId, startTimeMs, endTimeMs } = data
      const rangeDurationMs = endTimeMs - startTimeMs

      const projectDir = path.join(app.getPath('userData'), 'projects', projectId)
      const ttsDir = path.join(projectDir, 'tts')

      // Create the segment in the database
      const segment = segmentRepository.create({
        projectId,
        originalText: text,
        translatedText: text,
        startTimeMs,
        endTimeMs,
        voiceId
      })

      console.log(`[QuickDub] Generating TTS for segment ${segment.id}...`)

      // Generate TTS
      const rawAudioPath = path.join(ttsDir, `${segment.id}_raw.mp3`)
      await generateSpeech(text, rawAudioPath, { voiceId })

      // Stretch audio to match the range duration
      const finalAudioPath = path.join(ttsDir, `${segment.id}.mp3`)
      const stretchResult = await stretchAudioToDuration(rawAudioPath, finalAudioPath, {
        targetDurationMs: rangeDurationMs
      })

      // Update segment with audio info
      segmentRepository.update(segment.id, {
        audioFilePath: finalAudioPath,
        audioDurationMs: stretchResult.finalDurationMs,
        status: 'ready',
        speedAdjustment: stretchResult.speedRatio
      })

      console.log(
        `[QuickDub] Audio generated: ${stretchResult.finalDurationMs}ms (speed: ${stretchResult.speedRatio.toFixed(2)}x)`
      )

      return {
        segmentId: segment.id,
        audioPath: finalAudioPath,
        durationMs: stretchResult.finalDurationMs
      }
    }
  )

  // Lip-sync a video clip with generated audio via Sync.so
  createHandler(
    IPC_CHANNELS.QUICK_DUB.LIPSYNC,
    async (data: {
      projectId: string
      segmentId: string
      videoPath: string
      audioPath: string
      startTimeMs: number
      endTimeMs: number
    }) => {
      const { projectId, segmentId, videoPath, audioPath, startTimeMs, endTimeMs } = data

      const projectDir = path.join(app.getPath('userData'), 'projects', projectId)
      const lipsyncDir = path.join(projectDir, 'lipsync')

      // Step 1: Extract video clip for the time range
      const clipPath = path.join(lipsyncDir, `${segmentId}_clip.mp4`)
      console.log(`[QuickDub] Extracting video clip: ${startTimeMs}ms - ${endTimeMs}ms`)
      await extractVideoClip(videoPath, clipPath, startTimeMs, endTimeMs)

      // Step 2: Submit to Sync.so
      console.log('[QuickDub] Submitting lip-sync job to Sync.so...')
      const { generationId } = await submitLipsync(clipPath, audioPath)

      // Step 3: Poll until complete
      console.log(`[QuickDub] Polling lip-sync job: ${generationId}`)
      const { outputUrl } = await waitForLipsync(generationId, (status) => {
        console.log(`[QuickDub] Lip-sync status: ${status.status}`)
      })

      // Step 4: Download the result
      const finalPath = path.join(lipsyncDir, `${segmentId}.mp4`)
      await downloadLipsyncResult(outputUrl, finalPath)

      // Step 5: Update segment with lip-sync video path
      segmentRepository.update(segmentId, {
        lipsyncVideoPath: finalPath
      })

      console.log(`[QuickDub] Lip-sync complete: ${finalPath}`)
      return { lipsyncVideoPath: finalPath }
    }
  )
}
