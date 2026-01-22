import { formatShortcut, getModifierKey } from '@shared/constants/defaults'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('defaults helpers', () => {
  describe('getModifierKey', () => {
    const originalNavigator = globalThis.navigator

    beforeEach(() => {
      // Reset navigator before each test
      vi.stubGlobal('navigator', { platform: '' })
    })

    afterEach(() => {
      // Restore original navigator
      vi.stubGlobal('navigator', originalNavigator)
    })

    it('should return Cmd on Mac', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' })
      expect(getModifierKey()).toBe('Cmd')
    })

    it('should return Ctrl on Windows', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' })
      expect(getModifierKey()).toBe('Ctrl')
    })

    it('should return Ctrl on Linux', () => {
      vi.stubGlobal('navigator', { platform: 'Linux x86_64' })
      expect(getModifierKey()).toBe('Ctrl')
    })

    it('should return Ctrl when navigator is undefined', () => {
      vi.stubGlobal('navigator', undefined)
      expect(getModifierKey()).toBe('Ctrl')
    })
  })

  describe('formatShortcut', () => {
    const originalNavigator = globalThis.navigator

    afterEach(() => {
      vi.stubGlobal('navigator', originalNavigator)
    })

    it('should replace mod with Cmd on Mac', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' })
      expect(formatShortcut('mod+s')).toBe('Cmd+s')
      expect(formatShortcut('mod+shift+z')).toBe('Cmd+shift+z')
    })

    it('should replace mod with Ctrl on Windows', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' })
      expect(formatShortcut('mod+s')).toBe('Ctrl+s')
      expect(formatShortcut('mod+shift+z')).toBe('Ctrl+shift+z')
    })

    it('should handle shortcuts without mod', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' })
      expect(formatShortcut('space')).toBe('space')
      expect(formatShortcut('escape')).toBe('escape')
    })
  })
})
