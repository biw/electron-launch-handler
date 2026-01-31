import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { isMacOS, isWindows, isLinux } from '../helpers/platform.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_APP_DIR = path.join(__dirname, 'fixtures', 'test-app')

describe('E2E: Deep Link Handling', () => {
  describe('Test app configuration', () => {
    it('should have deep link handling in main.js', () => {
      const mainJs = fs.readFileSync(
        path.join(TEST_APP_DIR, 'main.js'),
        'utf-8'
      )

      expect(mainJs).toContain('handleDeepLink')
      expect(mainJs).toContain('pendingDeepLinks')
    })

    it('should register testapp protocol', () => {
      const mainJs = fs.readFileSync(
        path.join(TEST_APP_DIR, 'main.js'),
        'utf-8'
      )

      expect(mainJs).toContain("setAsDefaultProtocolClient('testapp'")
    })

    it('should handle deep links before window is ready', () => {
      const mainJs = fs.readFileSync(
        path.join(TEST_APP_DIR, 'main.js'),
        'utf-8'
      )

      expect(mainJs).toContain('windowReady')
      expect(mainJs).toContain('pendingDeepLinks.push')
    })
  })

  describe('IPC communication', () => {
    it('should send deep links to renderer via IPC', () => {
      const mainJs = fs.readFileSync(
        path.join(TEST_APP_DIR, 'main.js'),
        'utf-8'
      )

      expect(mainJs).toContain("webContents.send('deep-link'")
    })

    it('should listen for deep links in renderer', () => {
      const indexHtml = fs.readFileSync(
        path.join(TEST_APP_DIR, 'index.html'),
        'utf-8'
      )

      expect(indexHtml).toContain("ipcRenderer.on('deep-link'")
    })
  })
})

describe('E2E: Second Instance Deep Links', () => {
  it('should handle deep links from second instance', () => {
    const mainJs = fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')

    expect(mainJs).toContain("app.on('second-instance'")
    expect(mainJs).toContain("argv.find(arg => arg.startsWith('testapp://')")
  })

  it('should focus window on second instance', () => {
    const mainJs = fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')

    expect(mainJs).toContain('mainWindow.focus()')
    expect(mainJs).toContain('mainWindow.restore()')
  })
})

describe('E2E: URL Parsing', () => {
  it('should parse deep link URLs in renderer', () => {
    const indexHtml = fs.readFileSync(
      path.join(TEST_APP_DIR, 'index.html'),
      'utf-8'
    )

    expect(indexHtml).toContain('new URL(url)')
    expect(indexHtml).toContain('parsed.protocol')
    expect(indexHtml).toContain('parsed.host')
    expect(indexHtml).toContain('parsed.pathname')
  })
})

describe('E2E: Platform Deep Link Sources', () => {
  it.skipIf(!isMacOS())('macOS: should handle open-url event', () => {
    const mainJs = fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')

    // macOS uses open-url event
    expect(mainJs).toContain("app.on('open-url', (event, url)")
    expect(mainJs).toContain('event.preventDefault()')
  })

  it.skipIf(!isWindows())('Windows: should extract deep link from argv', () => {
    const mainJs = fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')

    // Windows passes URL in command line
    expect(mainJs).toContain(
      "process.argv.find(arg => arg.startsWith('testapp://')"
    )
  })

  it.skipIf(!isLinux())('Linux: should extract deep link from argv', () => {
    const mainJs = fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')

    // Linux passes URL in command line
    expect(mainJs).toContain(
      "process.argv.find(arg => arg.startsWith('testapp://')"
    )
  })
})
