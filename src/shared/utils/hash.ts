/**
 * Text Hash Utility
 * Simple hashing for comparing text changes (stale audio detection)
 */

/**
 * Simple djb2 hash function - fast and sufficient for change detection
 * @param text The text to hash
 * @returns A hex string hash of the text
 */
export function hashText(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i)
  }
  // Convert to unsigned 32-bit integer and then to hex
  return (hash >>> 0).toString(16)
}
