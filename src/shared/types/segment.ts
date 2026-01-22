/**
 * Segment Types
 * Represents a dubbed audio segment in the timeline
 */

export type SegmentStatus = 'pending' | 'generating' | 'ready' | 'error'

export interface Segment {
  id: string
  projectId: string
  speakerId?: string
  originalText?: string
  translatedText: string
  startTimeMs: number
  endTimeMs: number
  originalStartTimeMs: number
  originalEndTimeMs: number
  audioFilePath?: string
  audioDurationMs?: number
  voiceId?: string
  speedAdjustment: number
  pitchAdjustment: number
  status: SegmentStatus
  generationError?: string
  orderIndex: number
  audioGeneratedAt?: string // ISO timestamp when audio was last generated
  translatedTextHash?: string // Hash of translatedText when audio was generated
  audioGeneratedVoiceId?: string // Voice ID used when audio was generated
  audioGeneratedDurationMs?: number // Segment duration when audio was generated
  createdAt: string
  updatedAt: string
}

export interface SegmentCreateInput {
  id?: string // Optional - used for restoring deleted segments with original ID
  projectId: string
  speakerId?: string
  originalText?: string
  translatedText: string
  startTimeMs: number
  endTimeMs: number
  voiceId?: string
  speedAdjustment?: number
  pitchAdjustment?: number
  audioFilePath?: string
  audioDurationMs?: number
}

export interface SegmentUpdateInput {
  speakerId?: string | null
  originalText?: string | null
  translatedText?: string
  startTimeMs?: number
  endTimeMs?: number
  voiceId?: string | null
  audioFilePath?: string | null
  audioDurationMs?: number | null
  speedAdjustment?: number
  pitchAdjustment?: number
  status?: SegmentStatus
  generationError?: string | null
  audioGeneratedAt?: string | null
  translatedTextHash?: string | null
  audioGeneratedVoiceId?: string | null
  audioGeneratedDurationMs?: number | null
}

export interface SegmentBatchUpdate {
  id: string
  updates: SegmentUpdateInput
}

export interface Speaker {
  id: string
  projectId: string
  name: string
  defaultVoiceId?: string
  color: string
}

export interface SpeakerCreateInput {
  projectId: string
  name: string
  defaultVoiceId?: string
  color?: string
}

export const SPEAKER_COLORS = [
  '#ff6b6b', // Red
  '#4ecdc4', // Teal
  '#ffe66d', // Yellow
  '#95e1d3', // Mint
  '#f38181', // Coral
  '#aa96da', // Purple
  '#fcbad3', // Pink
  '#a8d8ea' // Light blue
] as const

export function getNextSpeakerColor(existingSpeakers: Speaker[]): string {
  const usedColors = new Set(existingSpeakers.map((s) => s.color))
  for (const color of SPEAKER_COLORS) {
    if (!usedColors.has(color)) {
      return color
    }
  }
  // If all colors are used, cycle back
  return SPEAKER_COLORS[existingSpeakers.length % SPEAKER_COLORS.length]
}
