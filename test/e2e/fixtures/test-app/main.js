const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

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
let instance = null
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

  mainWindow.webContents.on('did-finish-load', () => {
    log('Window finished loading')
    windowReady = true
    instance.processPendingDeepLinks()
    instance.processDeferredDeepLinks()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    windowReady = false
  })
}

async function main() {
  const { setupInstance } = await import('../../../../dist/index.js')

  instance = setupInstance({
    logger,
    onDeepLink: handleDeepLink,
    onSecondInstance: ({ deepLinkUrl }) => {
      if (deepLinkUrl) {
        log(`Second instance deep link: ${deepLinkUrl}`)
        return
      }

      log('Plain second instance')
      focusMainWindow()
    },
    protocols: ['testapp'],
  })

  if (instance.shouldQuit) {
    log('Another instance is running, quitting')
    app.quit()
    return
  }

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

app.on('open-url', (event) => {
  event.preventDefault()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    log('All windows closed, quitting')
    app.quit()
  }
})

ipcMain.handle('get-log-file', () => logFile)
ipcMain.handle('ping', () => 'pong')

main().catch((error) => {
  log(
    `Failed to start test app: ${error instanceof Error ? error.stack : error}`
  )
  app.quit()
})
