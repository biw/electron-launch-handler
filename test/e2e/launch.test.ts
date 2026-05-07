import { beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import electron from 'electron'
import { isLinux } from '../helpers/platform.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_APP_DIR = path.join(__dirname, 'fixtures', 'test-app')
const LOG_FILE = path.join(os.tmpdir(), 'electron-launch-handler-e2e-test.log')
const WAIT_TIMEOUT_MS = 10000

const shouldSkipElectronLaunch = () => {
  return Boolean(process.env.CI && isLinux() && !process.env.DISPLAY)
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const readLog = (logFile: string) => {
  if (!fs.existsSync(logFile)) {
    return ''
  }

  return fs.readFileSync(logFile, 'utf-8')
}

const waitForLog = async (
  logFile: string,
  text: string,
  timeoutMs = WAIT_TIMEOUT_MS
) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const log = readLog(logFile)
    if (log.includes(text)) {
      return log
    }

    await delay(100)
  }

  throw new Error(
    `Timed out waiting for "${text}" in ${logFile}\n${readLog(logFile)}`
  )
}

const waitForExit = async (
  proc: ReturnType<typeof spawn>,
  timeoutMs = WAIT_TIMEOUT_MS
) => {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs)
    proc.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

const stopProcess = async (proc: ReturnType<typeof spawn>) => {
  if (proc.exitCode === null && proc.signalCode === null) {
    proc.kill()
  }

  await waitForExit(proc, 5000)
}

const startElectron = (
  electronPath: string,
  logFile: string,
  args: string[] = []
) => {
  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile)
  }

  return spawn(electronPath, [TEST_APP_DIR, ...args], {
    env: {
      ...process.env,
      TEST_LOG_FILE: logFile,
    },
    stdio: 'pipe',
  })
}

describe('E2E: Electron launch handling', () => {
  let electronPath: string

  beforeAll(() => {
    electronPath = electron as unknown as string
  })

  it.skipIf(shouldSkipElectronLaunch())(
    'starts an Electron app and acquires the instance lock',
    async () => {
      const proc = startElectron(electronPath, LOG_FILE)

      try {
        await waitForLog(LOG_FILE, 'Acquired single instance lock')
        expect(proc.exitCode).toBeNull()
      } finally {
        await stopProcess(proc)
      }
    }
  )

  it.skipIf(shouldSkipElectronLaunch())(
    'reports a plain relaunch to the running Electron app',
    async () => {
      const proc1 = startElectron(electronPath, LOG_FILE)
      const log2File = `${LOG_FILE}.2`

      try {
        await waitForLog(LOG_FILE, 'Window finished loading')

        const proc2 = startElectron(electronPath, log2File)
        await waitForLog(LOG_FILE, 'Plain second instance')
        await waitForLog(log2File, 'Another instance is running, quitting')
        await waitForExit(proc2)

        expect(proc1.exitCode).toBeNull()
      } finally {
        await stopProcess(proc1)
        if (fs.existsSync(log2File)) {
          fs.unlinkSync(log2File)
        }
      }
    }
  )

  it.skipIf(shouldSkipElectronLaunch())(
    'routes a second-instance deep link through the package handler',
    async () => {
      const proc1 = startElectron(electronPath, LOG_FILE)
      const log2File = `${LOG_FILE}.2`
      const url = 'testapp://settings?tab=general'

      try {
        await waitForLog(LOG_FILE, 'Window finished loading')

        const proc2 = startElectron(electronPath, log2File, [url])
        await waitForLog(LOG_FILE, `Second instance deep link: ${url}`)
        await waitForLog(LOG_FILE, `Deep link received: ${url} (open-url)`)
        await waitForLog(log2File, 'Another instance is running, quitting')
        await waitForExit(proc2)

        expect(proc1.exitCode).toBeNull()
      } finally {
        await stopProcess(proc1)
        if (fs.existsSync(log2File)) {
          fs.unlinkSync(log2File)
        }
      }
    }
  )
})

describe('E2E: Protocol registration metadata', () => {
  it('declares the test protocol in the fixture package', () => {
    const pkgPath = path.join(TEST_APP_DIR, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    expect(pkg.build.protocols).toBeDefined()
    expect(pkg.build.protocols[0].schemes).toContain('testapp')
  })
})
