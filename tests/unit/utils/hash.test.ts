import { hashText } from '@shared/utils/hash'
import { describe, expect, it } from 'vitest'

describe('hashText', () => {
  it('should return a hex string hash', () => {
    const result = hashText('hello')
    expect(typeof result).toBe('string')
    expect(/^[0-9a-f]+$/.test(result)).toBe(true)
  })

  it('should return consistent hashes for the same input', () => {
    const hash1 = hashText('test string')
    const hash2 = hashText('test string')
    expect(hash1).toBe(hash2)
  })

  it('should return different hashes for different inputs', () => {
    const hash1 = hashText('hello')
    const hash2 = hashText('world')
    expect(hash1).not.toBe(hash2)
  })

  it('should handle empty strings', () => {
    const hash = hashText('')
    expect(typeof hash).toBe('string')
    expect(hash).toBe('1505') // djb2 initial value 5381 in hex
  })

  it('should handle unicode characters', () => {
    const hash1 = hashText('hello')
    const hash2 = hashText('helloこんにちは')
    expect(hash1).not.toBe(hash2)
  })

  it('should handle long strings', () => {
    const longString = 'a'.repeat(10000)
    const hash = hashText(longString)
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('should handle special characters', () => {
    const hash = hashText('!@#$%^&*()_+-=[]{}|;:,.<>?')
    expect(typeof hash).toBe('string')
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
  })

  it('should detect small changes in text', () => {
    const hash1 = hashText('The quick brown fox')
    const hash2 = hashText('The quick brown fox.')
    expect(hash1).not.toBe(hash2)
  })
})
