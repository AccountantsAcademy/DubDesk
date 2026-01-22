/**
 * Translation Workflow
 * Orchestrates: Load segments → Translate → Update segments
 */

import { projectRepository, segmentRepository, speakerRepository } from '../database/repositories'
import { type TranslationOptions, type TranslationSegment, translateBatch } from '../translation'
import { setWorkflowState, type WorkflowProgress } from './index'

export interface TranslateWorkflowOptions {
  /** Project ID */
  projectId: string
  /** Source language code */
  sourceLanguage: string
  /** Target language code */
  targetLanguage: string
  /** Optional context about the content */
  context?: string
  /** Optional glossary of terms */
  glossary?: Record<string, string>
}

export interface TranslateWorkflowResult {
  /** Number of segments translated */
  translatedCount: number
  /** Number of segments skipped (already translated) */
  skippedCount: number
}

/**
 * Run the translation workflow
 * 1. Load segments from database
 * 2. Batch translate using Claude
 * 3. Update segments with translations
 */
export async function runTranslateWorkflow(
  options: TranslateWorkflowOptions,
  onProgress?: (progress: WorkflowProgress) => void
): Promise<TranslateWorkflowResult> {
  const { projectId, sourceLanguage, targetLanguage, context, glossary } = options

  setWorkflowState(projectId, {
    stage: 'translating',
    progress: 0,
    startedAt: new Date()
  })

  try {
    // Step 1: Load segments that need translation
    onProgress?.({
      stage: 'translating',
      progress: 0,
      message: 'Loading segments...'
    })

    const allSegments = segmentRepository.findByProject(projectId)
    const speakers = speakerRepository.findByProject(projectId)
    const speakerMap = new Map(speakers.map((s) => [s.id, s.name]))

    // Filter segments that have original text but no translation
    const segmentsToTranslate = allSegments.filter((s) => s.originalText && !s.translatedText)

    if (segmentsToTranslate.length === 0) {
      onProgress?.({
        stage: 'translating',
        progress: 100,
        message: 'All segments already translated'
      })

      setWorkflowState(projectId, {
        stage: 'idle',
        progress: 100,
        completedAt: new Date()
      })

      return {
        translatedCount: 0,
        skippedCount: allSegments.length
      }
    }

    // Step 2: Prepare segments for translation
    const translationSegments: TranslationSegment[] = segmentsToTranslate.map((s) => ({
      id: s.id,
      text: s.originalText || '',
      speakerName: s.speakerId ? speakerMap.get(s.speakerId) : undefined
    }))

    // Step 3: Translate in batch
    onProgress?.({
      stage: 'translating',
      progress: 10,
      message: `Translating ${segmentsToTranslate.length} segments...`
    })

    const translationOptions: TranslationOptions = {
      sourceLanguage,
      targetLanguage,
      context,
      glossary,
      preserveFormatting: true
    }

    const results = await translateBatch(translationSegments, translationOptions, (progress) => {
      const percent = 10 + (progress.current / progress.total) * 80
      onProgress?.({
        stage: 'translating',
        progress: percent,
        message: `Translating segment ${progress.current}/${progress.total}...`
      })
    })

    // Step 4: Update segments with translations
    onProgress?.({
      stage: 'translating',
      progress: 90,
      message: 'Saving translations...'
    })

    for (const result of results) {
      segmentRepository.update(result.id, {
        translatedText: result.translatedText
      })
    }

    // Update project
    projectRepository.update(projectId, {
      targetLanguage,
      sourceLanguage
    })

    onProgress?.({
      stage: 'translating',
      progress: 100,
      message: 'Translation complete'
    })

    setWorkflowState(projectId, {
      stage: 'idle',
      progress: 100,
      completedAt: new Date()
    })

    return {
      translatedCount: results.length,
      skippedCount: allSegments.length - segmentsToTranslate.length
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Translation failed'

    setWorkflowState(projectId, {
      stage: 'idle',
      progress: 0,
      error: errorMessage
    })

    onProgress?.({
      stage: 'translating',
      progress: 0,
      message: errorMessage,
      error: errorMessage
    })

    throw error
  }
}

/**
 * Translate a single segment
 */
export async function translateSingleSegment(
  segmentId: string,
  options: TranslationOptions
): Promise<string> {
  const segment = segmentRepository.findById(segmentId)
  if (!segment) {
    throw new Error(`Segment not found: ${segmentId}`)
  }

  if (!segment.originalText) {
    throw new Error('Segment has no original text to translate')
  }

  const results = await translateBatch([{ id: segmentId, text: segment.originalText }], options)

  const translatedText = results[0]?.translatedText || ''

  // Update segment
  segmentRepository.update(segmentId, {
    translatedText
  })

  return translatedText
}
