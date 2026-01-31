const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// Log file for E2E test verification
const logFile =
  process.env.TEST_LOG_FILE ||
  path.join(app.getPath('temp'), 'electron-launch-handler-test.log')

function log(message) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}\n`
  fs.appendFileSync(logFile, line)
  console.log(message)
}

// Clear log file on startup
fs.writeFileSync(logFile, '')
log('App starting')
log(`Log file: ${logFile}`)
log(`Process args: ${process.argv.join(' ')}`)

let mainWindow = null
const pendingDeepLinks = []
let windowReady = false

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  log('Another instance is running, quitting')
  app.quit()
} else {
  log('Acquired single instance lock')

  // Handle second instance
  app.on('second-instance', (event, argv, workingDirectory) => {
    log(`Second instance detected: ${argv.join(' ')}`)

    // Find deep link in argv
    const deepLink = argv.find((arg) => arg.startsWith('testapp://'))
    if (deepLink) {
      log(`Deep link from second instance: ${deepLink}`)
      handleDeepLink(deepLink)
    }

    // Focus window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Handle deep links
function handleDeepLink(url) {
  log(`Handling deep link: ${url}`)

  if (!windowReady) {
    log('Window not ready, queuing deep link')
    pendingDeepLinks.push(url)
    return
  }

  // Send to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deep-link', url)
  }
}

// macOS: open-url event
app.on('open-url', (event, url) => {
  event.preventDefault()
  log(`open-url event: ${url}`)
  handleDeepLink(url)
})

// Check for deep link in argv (Windows/Linux)
function checkArgvForDeepLink() {
  const deepLink = process.argv.find((arg) => arg.startsWith('testapp://'))
  if (deepLink) {
    log(`Deep link from argv: ${deepLink}`)
    handleDeepLink(deepLink)
  }
}

// Register protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('testapp', process.execPath, [
      path.resolve(process.argv[1]),
    ])
  }
} else {
  app.setAsDefaultProtocolClient('testapp')
}
log('Registered testapp:// protocol')

function createWindow() {
  log('Creating window')

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  mainWindow.loadFile('index.html')

  mainWindow.webContents.on('did-finish-load', () => {
    log('Window finished loading')
    windowReady = true

    // Process pending deep links
    while (pendingDeepLinks.length > 0) {
      const url = pendingDeepLinks.shift()
      log(`Processing pending deep link: ${url}`)
      mainWindow.webContents.send('deep-link', url)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    windowReady = false
  })
}

app.whenReady().then(() => {
  log('App ready')
  createWindow()
  checkArgvForDeepLink()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    log('All windows closed, quitting')
    app.quit()
  }
})

// IPC handlers for test verification
ipcMain.handle('get-log-file', () => logFile)
ipcMain.handle('get-pending-deep-links', () => pendingDeepLinks)
ipcMain.handle('ping', () => 'pong')

log('Main process setup complete')
