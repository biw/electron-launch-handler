import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockApp, type MockApp } from '../helpers/electron-mock.js'

const PLATFORMS = ['darwin', 'win32', 'linux'] as const

const originalPlatform = process.platform
const originalArgv = process.argv

const setPlatform = (platform: string) => {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

/**
 * Intent is derived by the library, never supplied by the caller. These tests
 * deliberately avoid passing an intent in: asserting that `queueDeepLink(url,
 * 'launch')` yields `intent: 'launch'` only proves the value was carried
 * through, not that the library classified the launch correctly.
 */
describe('deep link intent derivation', () => {
  let appMock: MockApp
  let createInstance: typeof import('../../src/index.js').createInstance

  const loadModule = async () => {
    vi.resetModules()
    appMock = createMockApp()
    vi.doMock('electron', () => ({ app: appMock }))
    ;({ createInstance } = await import('../../src/index.js'))
  }

  beforeEach(async () => {
    await loadModule()
  })

  afterEach(() => {
    setPlatform(originalPlatform)
    process.argv = originalArgv
  })

  describe('macOS open-url', () => {
    beforeEach(async () => {
      setPlatform('darwin')
      await loadModule()
    })

    it('classifies a URL delivered before ready as open-url', async () => {
      const onDeepLink = vi.fn()

      const manager = createInstance({ protocols: ['myapp'] })
      // This might be a cold launch or a URL received during slow startup;
      // Electron does not include that causal information in the event.
      appMock._setReady(false)
      appMock._simulateOpenUrl('myapp://open')

      manager.configure({ onDeepLink })
      await manager.processPendingDeepLinks()

      expect(onDeepLink).toHaveBeenCalledWith(
        'myapp://open',
        expect.objectContaining({ intent: 'open-url' })
      )
    })

    it('does not treat a second pre-ready URL as a launch', async () => {
      const onDeepLink = vi.fn()

      const manager = createInstance({ protocols: ['myapp'] })
      appMock._setReady(false)
      appMock._simulateOpenUrl('myapp://first')
      appMock._simulateOpenUrl('myapp://second')

      manager.configure({ onDeepLink })
      await manager.processPendingDeepLinks()

      expect(onDeepLink).toHaveBeenNthCalledWith(
        2,
        'myapp://second',
        expect.objectContaining({ intent: 'open-url' })
      )
    })

    it('classifies a URL delivered after ready as open-url', async () => {
      const onDeepLink = vi.fn()

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({ onDeepLink })
      await manager.processPendingDeepLinks()

      // App is running; the user clicks a link.
      appMock._setReady(true)
      appMock._simulateOpenUrl('myapp://open')
      await Promise.resolve()
      await Promise.resolve()

      expect(onDeepLink).toHaveBeenCalledWith(
        'myapp://open',
        expect.objectContaining({ intent: 'open-url' })
      )
    })
  })

  describe('argv cold launch', () => {
    it.each(PLATFORMS)(
      'classifies argv delivery on %s as a launch',
      async (platform) => {
        setPlatform(platform)
        process.argv = ['MyApp', 'myapp://open']
        await loadModule()

        const onDeepLink = vi.fn()
        const manager = createInstance({ protocols: ['myapp'] })
        manager.configure({ onDeepLink })
        await manager.processPendingDeepLinks()

        expect(onDeepLink).toHaveBeenCalledWith(
          'myapp://open',
          expect.objectContaining({ intent: 'launch' })
        )
      }
    )
  })

  describe('second instance', () => {
    it.each(PLATFORMS)(
      'classifies a relaunch on %s as open-url',
      async (platform) => {
        setPlatform(platform)
        await loadModule()

        const onDeepLink = vi.fn()
        const manager = createInstance({ protocols: ['myapp'] })
        manager.configure({ onDeepLink })

        // By definition the app was already running.
        appMock._simulateSecondInstance(['MyApp', 'myapp://open'], '/tmp')
        await manager.processPendingDeepLinks()

        expect(onDeepLink).toHaveBeenCalledWith(
          'myapp://open',
          expect.objectContaining({ intent: 'open-url' })
        )
      }
    )
  })

  describe('platform delivery differences', () => {
    it('does not infer macOS launch causality from open-url timing', async () => {
      const intents: string[] = []

      for (const platform of PLATFORMS) {
        setPlatform(platform)
        // Windows and Linux expose the URL in startup argv. macOS exposes a
        // runtime open-url event without saying whether it started the app.
        process.argv =
          platform === 'darwin' ? ['MyApp'] : ['MyApp', 'myapp://open']
        await loadModule()

        const onDeepLink = vi.fn()
        const manager = createInstance({ protocols: ['myapp'] })

        if (platform === 'darwin') {
          appMock._setReady(false)
          appMock._simulateOpenUrl('myapp://open')
        }

        manager.configure({ onDeepLink })
        await manager.processPendingDeepLinks()

        intents.push(onDeepLink.mock.calls[0]?.[1]?.intent)
      }

      expect(intents).toEqual(['open-url', 'launch', 'launch'])
    })

    it('reports the same intent for a relaunch on every platform', async () => {
      const intents: string[] = []

      for (const platform of PLATFORMS) {
        setPlatform(platform)
        process.argv = ['MyApp']
        await loadModule()

        const onDeepLink = vi.fn()
        const manager = createInstance({ protocols: ['myapp'] })
        manager.configure({ onDeepLink })

        appMock._simulateSecondInstance(['MyApp', 'myapp://open'], '/tmp')
        await manager.processPendingDeepLinks()

        intents.push(onDeepLink.mock.calls[0]?.[1]?.intent)
      }

      expect(intents).toEqual(['open-url', 'open-url', 'open-url'])
      expect(new Set(intents).size).toBe(1)
    })
  })

  describe('preservation through deferral', () => {
    it('preserves open-url intent when the handler defers', async () => {
      setPlatform('darwin')
      await loadModule()

      let shouldDefer = true
      const onDeepLink = vi.fn(() => {
        if (!shouldDefer) {
          return
        }

        shouldDefer = false
        return { action: 'defer' } as const
      })

      const manager = createInstance({ protocols: ['myapp'] })
      appMock._setReady(false)
      appMock._simulateOpenUrl('myapp://open')

      manager.configure({ onDeepLink })
      await manager.processPendingDeepLinks()

      expect(onDeepLink).toHaveBeenNthCalledWith(
        1,
        'myapp://open',
        expect.objectContaining({ intent: 'open-url' })
      )

      await manager.processDeferredDeepLinks()

      // Redelivery preserves the original delivery mechanism.
      expect(onDeepLink).toHaveBeenNthCalledWith(
        2,
        'myapp://open',
        expect.objectContaining({ intent: 'open-url' })
      )
    })

    it('preserves launch intent through an explicit deferDeepLink', async () => {
      const onDeepLink = vi.fn()

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({ onDeepLink })
      await manager.processPendingDeepLinks()

      manager.deferDeepLink('myapp://open', 'launch')
      await manager.processDeferredDeepLinks()

      expect(onDeepLink).toHaveBeenCalledWith(
        'myapp://open',
        expect.objectContaining({ intent: 'launch' })
      )
    })
  })
})
