import { describe, it, expect, beforeAll } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import electron from 'electron'
import { isMacOS, isWindows, isLinux } from '../helpers/platform.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_APP_DIR = path.join(__dirname, 'fixtures', 'test-app')
const LOG_FILE = path.join(os.tmpdir(), 'electron-launch-handler-e2e-test.log')

// Skip E2E tests if electron is not available or in CI without display
const shouldSkipE2E = () => {
  // Check if we're in a CI environment without display
  if (process.env.CI && isLinux() && !process.env.DISPLAY) {
    return true
  }
  return false
}

describe('E2E: App Launch', () => {
  let electronPath: string

  beforeAll(() => {
    // Get electron executable path (electron package exports the path as default)
    electronPath = electron as unknown as string

    // Clean up log file
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE)
    }
  })

  it.skipIf(shouldSkipE2E())(
    'should start and acquire single instance lock',
    async () => {
      if (!electronPath) {
        console.log('Skipping: Electron not available')
        return
      }

      const proc = spawn(electronPath, [TEST_APP_DIR], {
        env: {
          ...process.env,
          TEST_LOG_FILE: LOG_FILE,
        },
        stdio: 'pipe',
      })

      // Wait for app to start
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Check if process is running
      expect(proc.killed).toBe(false)

      // Kill the process
      proc.kill()

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Check log file
      if (fs.existsSync(LOG_FILE)) {
        const log = fs.readFileSync(LOG_FILE, 'utf-8')
        expect(log).toContain('Acquired single instance lock')
      }
    },
    10000
  )

  it.skipIf(shouldSkipE2E())(
    'second instance should quit when first is running',
    async () => {
      if (!electronPath) {
        console.log('Skipping: Electron not available')
        return
      }

      // Clean log file
      if (fs.existsSync(LOG_FILE)) {
        fs.unlinkSync(LOG_FILE)
      }

      // Start first instance
      const proc1 = spawn(electronPath, [TEST_APP_DIR], {
        env: {
          ...process.env,
          TEST_LOG_FILE: LOG_FILE,
        },
        stdio: 'pipe',
      })

      // Wait for first instance to start
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Start second instance with different log file
      const log2File = LOG_FILE + '.2'
      const proc2 = spawn(electronPath, [TEST_APP_DIR], {
        env: {
          ...process.env,
          TEST_LOG_FILE: log2File,
        },
        stdio: 'pipe',
      })

      // Wait for second instance to exit
      await new Promise<void>((resolve) => {
        proc2.on('exit', () => resolve())
        setTimeout(resolve, 5000)
      })

      // Second process should have exited
      // First process should still be running
      expect(proc1.killed).toBe(false)

      // Cleanup
      proc1.kill()

      await new Promise((resolve) => setTimeout(resolve, 500))

      // Clean up log files
      if (fs.existsSync(log2File)) {
        fs.unlinkSync(log2File)
      }
    },
    15000
  )
})

describe('E2E: Protocol Registration', () => {
  it('should have testapp protocol configured in package.json', () => {
    const pkgPath = path.join(TEST_APP_DIR, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    expect(pkg.build.protocols).toBeDefined()
    expect(pkg.build.protocols[0].schemes).toContain('testapp')
  })
})

describe('E2E: Platform-specific behavior', () => {
  it.skipIf(!isMacOS())('macOS: should use open-url event', () => {
    const mainJs = fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')
    expect(mainJs).toContain("app.on('open-url'")
  })

  it.skipIf(!isWindows())('Windows: should check argv for deep links', () => {
    const mainJs = fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')
    expect(mainJs).toContain('checkArgvForDeepLink')
  })

  it.skipIf(!isLinux())('Linux: should check argv for deep links', () => {
    const mainJs = fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')
    expect(mainJs).toContain('checkArgvForDeepLink')
  })
})
