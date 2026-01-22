import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.electron for renderer tests
vi.stubGlobal('electron', {
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn()
  },
  process: {
    versions: {
      electron: '39.0.0',
      chrome: '120.0.0',
      node: '20.0.0'
    }
  }
})

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  return setTimeout(() => callback(Date.now()), 16)
})

vi.stubGlobal('cancelAnimationFrame', (id: number) => {
  clearTimeout(id)
})

// Mock AudioContext for Tone.js
class AudioContextMock {
  state = 'running'
  sampleRate = 44100
  createGain = vi.fn(() => ({
    connect: vi.fn(),
    gain: { value: 1 }
  }))
  createOscillator = vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { value: 440 }
  }))
  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
}

vi.stubGlobal('AudioContext', AudioContextMock)
vi.stubGlobal('webkitAudioContext', AudioContextMock)

// Mock window.dubdesk API
vi.stubGlobal('dubdesk', {
  segment: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    batchUpdate: vi.fn(),
    split: vi.fn(),
    merge: vi.fn(),
    reorder: vi.fn()
  },
  speaker: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  tts: {
    generateSingle: vi.fn(),
    generateBatch: vi.fn(),
    getVoices: vi.fn(),
    previewVoice: vi.fn()
  },
  history: {
    undo: vi.fn(),
    redo: vi.fn(),
    getStack: vi.fn(),
    clear: vi.fn()
  },
  project: {
    getCurrent: vi.fn(),
    create: vi.fn(),
    open: vi.fn(),
    save: vi.fn(),
    close: vi.fn(),
    listRecent: vi.fn(),
    delete: vi.fn(),
    update: vi.fn()
  }
})
