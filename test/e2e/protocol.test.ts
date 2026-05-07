import { describe, expect, it } from 'vitest'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_APP_DIR = path.join(__dirname, 'fixtures', 'test-app')

const readFixtureMain = () => {
  return fs.readFileSync(path.join(TEST_APP_DIR, 'main.js'), 'utf-8')
}

describe('E2E fixture', () => {
  it('uses the built package entrypoint', () => {
    const mainJs = readFixtureMain()

    expect(mainJs).toContain('../../../../dist/index.js')
    expect(mainJs).toContain('setupInstance')
  })

  it('routes fixture deep links through setupInstance', () => {
    const mainJs = readFixtureMain()

    expect(mainJs).toContain("protocols: ['testapp']")
    expect(mainJs).toContain('onDeepLink: handleDeepLink')
    expect(mainJs).toContain("return { action: 'defer' }")
    expect(mainJs).toContain('processPendingDeepLinks')
    expect(mainJs).toContain('processDeferredDeepLinks')
  })

  it('routes plain relaunches through onSecondInstance', () => {
    const mainJs = readFixtureMain()

    expect(mainJs).toContain('onSecondInstance')
    expect(mainJs).toContain('Plain second instance')
    expect(mainJs).toContain('focusMainWindow()')
  })

  it('sends delivered links to the renderer', () => {
    const mainJs = readFixtureMain()
    const indexHtml = fs.readFileSync(
      path.join(TEST_APP_DIR, 'index.html'),
      'utf-8'
    )

    expect(mainJs).toContain("webContents.send('deep-link'")
    expect(indexHtml).toContain("ipcRenderer.on('deep-link'")
  })
})
