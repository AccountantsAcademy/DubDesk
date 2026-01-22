import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { config } from 'dotenv'
import { app, BrowserWindow, shell } from 'electron'

// Load environment variables from .env file
config()

import icon from '../../resources/icon.png?asset'
import { registerAllHandlers } from './ipc'
import { createApplicationMenu } from './menu'
import { closeDatabase, initializeDatabase } from './services/database'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#0d0d0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Allow loading local files via file:// protocol
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function initializeApp(): Promise<void> {
  try {
    initializeDatabase()
    console.log('Database initialized successfully')

    registerAllHandlers()
    console.log('IPC handlers registered')
  } catch (error) {
    console.error('Failed to initialize app:', error)
    app.quit()
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.dubdesk')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await initializeApp()
  createApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
  console.log('Database closed')
})

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
