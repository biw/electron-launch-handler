import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createInstance } from '../../../../dist/index.js'

const logFile =
  process.env.TEST_LOG_FILE ||
  path.join(app.getPath('temp'), 'electron-launch-handler-test.log')

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  fs.appendFileSync(logFile, line)
  console.log(message)
}

const logger = {
  debug: log,
  error: log,
  info: log,
}

let mainWindow = null
let windowReady = false

fs.writeFileSync(logFile, '')
log('App starting')
log(`Log file: ${logFile}`)
log(`Process args: ${process.argv.join(' ')}`)

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.focus()
}

function handleDeepLink(url, context) {
  log(`Deep link received: ${url} (${context.intent})`)

  if (!windowReady || !mainWindow || mainWindow.isDestroyed()) {
    log('Window not ready, deferring deep link')
    return { action: 'defer' }
  }

  mainWindow.webContents.send('deep-link', url)

  if (context.params.get('test-exit') === '1') {
    setTimeout(() => app.quit(), 0)
  }
}

function createWindow() {
  log('Creating window')

  mainWindow = new BrowserWindow({
    height: 600,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
    width: 800,
  })

  mainWindow.loadFile('index.html')

  mainWindow.webContents.on('did-finish-load', async () => {
    log('Window finished loading')
    windowReady = true
    await instance.processPendingDeepLinks()
    await instance.processDeferredDeepLinks()
    log('Launch queues drained')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    windowReady = false
  })
}

// The static import and module-scope construction ensure this listener is live
// before Electron can emit a cold-launch open-url event.
const instance = createInstance({
  logger,
  protocols: ['testapp'],
})

if (instance.shouldQuit) {
  log('Another instance is running, quitting')
  app.quit()
} else {
  const autoExitMs = Number(process.env.TEST_AUTO_EXIT_MS)
  if (Number.isFinite(autoExitMs) && autoExitMs > 0) {
    setTimeout(() => {
      log('Test auto-exit timer fired')
      app.quit()
    }, autoExitMs)
  }

  // Handlers are supplied separately from listener/lock installation to mirror
  // staged application bootstrap.
  instance.configure({
    onDeepLink: handleDeepLink,
    onSecondInstance: ({ deepLinkUrl }) => {
      if (deepLinkUrl) {
        log(`Second instance deep link: ${deepLinkUrl}`)
        return
      }

      log('Plain second instance')
      focusMainWindow()
    },
  })

  app.whenReady().then(() => {
    log('App ready')
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    log('All windows closed, quitting')
    app.quit()
  }
})

ipcMain.handle('get-log-file', () => logFile)
ipcMain.handle('ping', () => 'pong')
