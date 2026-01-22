/**
 * Claude Translation Service
 * AI-powered translation using Anthropic's Claude API
 */

import Anthropic from '@anthropic-ai/sdk'
import { API_KEYS, keychainService } from '../keychain'

let anthropicClient: Anthropic | null = null

/**
 * Get or create the Anthropic client
 */
async function getClient(): Promise<Anthropic> {
  const apiKey = await keychainService.getAPIKey(API_KEYS.ANTHROPIC)
  if (!apiKey) {
    throw new Error('Anthropic API key not configured')
  }

  // Create new client if API key changed or not initialized
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey })
  }

  return anthropicClient
}

/**
 * Reset the client (e.g., when API key changes)
 */
export function resetClient(): void {
  anthropicClient = null
}

export interface TranslationSegment {
  id: string
  text: string
  speakerName?: string
}

export interface TranslationResult {
  id: string
  translatedText: string
}

export interface TranslationOptions {
  /** Source language code (e.g., 'en') */
  sourceLanguage: string
  /** Target language code (e.g., 'es') */
  targetLanguage: string
  /** Optional context about the content */
  context?: string
  /** Optional glossary of terms to use */
  glossary?: Record<string, string>
  /** Preserve formatting like line breaks */
  preserveFormatting?: boolean
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string
}

/**
 * Translate a single text segment
 */
export async function translateText(text: string, options: TranslationOptions): Promise<string> {
  const client = await getClient()

  const systemPrompt = buildSystemPrompt(options)
  const userPrompt = buildUserPrompt(text, options)

  const response = await client.messages.create({
    model: options.model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })

  // Extract text from response
  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return content.text.trim()
}

/**
 * Translate multiple segments in batch for efficiency
 * Provides context from surrounding segments for better translation
 */
export async function translateBatch(
  segments: TranslationSegment[],
  options: TranslationOptions,
  onProgress?: (progress: { current: number; total: number }) => void
): Promise<TranslationResult[]> {
  const client = await getClient()
  const results: TranslationResult[] = []

  // Process in batches of 10 segments for context
  const batchSize = 10

  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, i + batchSize)
    const batchResults = await translateBatchGroup(client, batch, options, segments, i)
    results.push(...batchResults)

    onProgress?.({
      current: Math.min(i + batchSize, segments.length),
      total: segments.length
    })
  }

  return results
}

/**
 * Translate a group of segments with context
 */
async function translateBatchGroup(
  client: Anthropic,
  batch: TranslationSegment[],
  options: TranslationOptions,
  allSegments: TranslationSegment[],
  startIndex: number
): Promise<TranslationResult[]> {
  const systemPrompt = buildSystemPrompt(options)

  // Build context from surrounding segments
  const contextBefore = allSegments
    .slice(Math.max(0, startIndex - 3), startIndex)
    .map((s) => s.text)
    .join(' ')

  const contextAfter = allSegments
    .slice(startIndex + batch.length, startIndex + batch.length + 3)
    .map((s) => s.text)
    .join(' ')

  // Format segments for translation
  const segmentsText = batch
    .map((s, idx) => {
      const speakerPrefix = s.speakerName ? `[${s.speakerName}] ` : ''
      return `[${idx + 1}] ${speakerPrefix}${s.text}`
    })
    .join('\n')

  const userPrompt = `Translate the following dialogue segments from ${getLanguageName(options.sourceLanguage)} to ${getLanguageName(options.targetLanguage)}.

${contextBefore ? `Previous context (for reference only, do not translate): "${contextBefore}"\n` : ''}
Segments to translate:
${segmentsText}
${contextAfter ? `\nFollowing context (for reference only, do not translate): "${contextAfter}"` : ''}

${
  options.glossary
    ? `\nGlossary to use:\n${Object.entries(options.glossary)
        .map(([term, translation]) => `- "${term}" → "${translation}"`)
        .join('\n')}`
    : ''
}

Respond with ONLY the translations in the same numbered format:
[1] translated text
[2] translated text
...

Maintain the same speaking style, tone, and any speaker tags. Do not include explanations.`

  const response = await client.messages.create({
    model: options.model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  // Parse the response
  return parseTranslationResponse(content.text, batch)
}

/**
 * Parse the numbered translation response
 */
function parseTranslationResponse(
  response: string,
  segments: TranslationSegment[]
): TranslationResult[] {
  const results: TranslationResult[] = []
  const lines = response.trim().split('\n')

  // Match lines like "[1] translated text" or "1. translated text"
  const lineRegex = /^\[?(\d+)\]?\s*[.)]?\s*(.+)$/

  let currentIndex = 0
  for (const line of lines) {
    const match = line.match(lineRegex)
    if (match) {
      const index = Number.parseInt(match[1], 10) - 1
      const translatedText = match[2].trim()

      if (index >= 0 && index < segments.length) {
        results[index] = {
          id: segments[index].id,
          translatedText
        }
        currentIndex = index + 1
      }
    } else if (line.trim() && currentIndex < segments.length) {
      // Handle continuation of previous line
      if (results[currentIndex - 1]) {
        results[currentIndex - 1].translatedText += ` ${line.trim()}`
      }
    }
  }

  // Fill in any missing results with original text
  for (let i = 0; i < segments.length; i++) {
    if (!results[i]) {
      console.warn(`Translation missing for segment ${segments[i].id}, using original`)
      results[i] = {
        id: segments[i].id,
        translatedText: segments[i].text
      }
    }
  }

  return results
}

/**
 * Build the system prompt for translation
 */
function buildSystemPrompt(options: TranslationOptions): string {
  let prompt = `You are an expert translator specializing in video dubbing and localization. Your translations should:

1. Sound natural when spoken aloud
2. Match the original timing and pacing as closely as possible
3. Preserve the emotional tone and intent of the speaker
4. Use appropriate register and formality for the context
5. Maintain consistency with character voices throughout

${options.context ? `Context about this content: ${options.context}\n` : ''}
`

  if (options.preserveFormatting) {
    prompt += '\nPreserve line breaks and formatting from the original text.'
  }

  return prompt
}

/**
 * Build the user prompt for single translation
 */
function buildUserPrompt(text: string, options: TranslationOptions): string {
  let prompt = `Translate the following from ${getLanguageName(options.sourceLanguage)} to ${getLanguageName(options.targetLanguage)}:\n\n"${text}"`

  if (options.glossary && Object.keys(options.glossary).length > 0) {
    prompt += `\n\nUse this glossary:\n${Object.entries(options.glossary)
      .map(([term, translation]) => `- "${term}" → "${translation}"`)
      .join('\n')}`
  }

  prompt += '\n\nRespond with ONLY the translation, no explanations or quotes.'

  return prompt
}

/**
 * Get human-readable language name from code
 */
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    ar: 'Arabic',
    hi: 'Hindi',
    nl: 'Dutch',
    pl: 'Polish',
    tr: 'Turkish',
    vi: 'Vietnamese',
    th: 'Thai',
    sv: 'Swedish',
    da: 'Danish',
    no: 'Norwegian',
    fi: 'Finnish',
    cs: 'Czech',
    el: 'Greek',
    he: 'Hebrew',
    id: 'Indonesian',
    ms: 'Malay',
    ro: 'Romanian',
    uk: 'Ukrainian'
  }

  return languages[code.toLowerCase()] || code
}

/**
 * Validate that the translation service is configured
 */
export async function isTranslationConfigured(): Promise<boolean> {
  return keychainService.hasAPIKey(API_KEYS.ANTHROPIC)
}
