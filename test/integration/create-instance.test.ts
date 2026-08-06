import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockApp,
  createMockLogger,
  type MockApp,
} from '../helpers/electron-mock.js'

const flushScheduledDispatch = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * Force a platform for the duration of a test. The deep link manager reads
 * `process.platform` when it installs listeners, so this has to be set before
 * `createInstance()` runs.
 */
const forcePlatform = (platform: 'darwin' | 'linux' | 'win32') => {
  const original = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })

  return () => {
    Object.defineProperty(process, 'platform', {
      value: original,
      configurable: true,
    })
  }
}

describe('createInstance', () => {
  let appMock: MockApp
  let createInstance: typeof import('../../src/index.js').createInstance
  let extractDeepLinkFromArgs: typeof import('../../src/index.js').extractDeepLinkFromArgs
  let restorePlatform: (() => void) | null = null

  beforeEach(async () => {
    vi.resetModules()

    appMock = createMockApp()
    vi.doMock('electron', () => ({ app: appMock }))
    ;({ createInstance, extractDeepLinkFromArgs } =
      await import('../../src/index.js'))
  })

  afterEach(() => {
    restorePlatform?.()
    restorePlatform = null
  })

  describe('deferred handler configuration', () => {
    it('queues deep links received before configure()', async () => {
      const onDeepLink = vi.fn()
      const url = 'myapp://settings?tab=general'

      const manager = createInstance({ protocols: ['myapp'] })

      appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
      await flushScheduledDispatch()

      expect(manager.getPendingDeepLinks()).toEqual([url])
      expect(onDeepLink).not.toHaveBeenCalled()

      manager.configure({ onDeepLink })
      await manager.processPendingDeepLinks()

      expect(onDeepLink).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ host: 'settings', protocol: 'myapp' })
      )
      expect(manager.getPendingDeepLinks()).toEqual([])
    })

    it('catches a cold-launch open-url delivered before configure()', async () => {
      restorePlatform = forcePlatform('darwin')

      const onDeepLink = vi.fn()
      const url = 'myapp://open'

      const manager = createInstance({ protocols: ['myapp'] })

      // macOS fires this before 'ready', i.e. long before the app can build
      // its handlers.
      appMock._simulateOpenUrl(url)
      await flushScheduledDispatch()

      expect(manager.getPendingDeepLinks()).toEqual([url])

      manager.configure({ onDeepLink })
      await manager.processPendingDeepLinks()

      // Readiness cannot establish why Electron emitted open-url.
      expect(onDeepLink).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ intent: 'open-url', protocol: 'myapp' })
      )
    })

    it('discards pending links when processing without a handler', async () => {
      const logger = createMockLogger()
      const url = 'myapp://settings'

      const manager = createInstance({ logger, protocols: ['myapp'] })

      appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
      await manager.processPendingDeepLinks()

      expect(logger.info).toHaveBeenCalledWith(
        'Discarding 1 pending deep link(s): no onDeepLink handler configured'
      )
      expect(logger.info).not.toHaveBeenCalledWith(
        'Processing 1 pending deep link(s)'
      )
      expect(manager.getPendingDeepLinks()).toEqual([])
    })

    it('stays quiet with no handler when nothing is queued', async () => {
      const logger = createMockLogger()

      // An app using this only for single-instance behavior.
      const manager = createInstance({ logger })

      await manager.processPendingDeepLinks()

      expect(logger.error).not.toHaveBeenCalled()
    })

    it('does not retain future links after handler-less readiness', async () => {
      const onDeepLink = vi.fn()
      const url = 'myapp://settings'
      const manager = createInstance({ protocols: ['myapp'] })

      await manager.processPendingDeepLinks()
      appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
      await flushScheduledDispatch()

      expect(manager.getPendingDeepLinks()).toEqual([])
      expect(onDeepLink).not.toHaveBeenCalled()

      manager.configure({ onDeepLink })
      appMock._simulateSecondInstance(
        ['MyApp', 'myapp://after-configure'],
        '/tmp/project'
      )
      await flushScheduledDispatch()

      expect(onDeepLink).toHaveBeenCalledWith(
        'myapp://after-configure',
        expect.anything()
      )
    })

    it('replays second-instance events received before configure()', () => {
      const onSecondInstance = vi.fn()
      const firstArgv = ['MyApp']
      const secondArgv = ['MyApp', 'myapp://open']
      const manager = createInstance({ protocols: ['myapp'] })

      appMock._simulateSecondInstance(firstArgv, '/tmp/first')
      appMock._simulateSecondInstance(secondArgv, '/tmp/second')

      manager.configure({ onSecondInstance })

      expect(onSecondInstance).toHaveBeenNthCalledWith(1, {
        argv: firstArgv,
        workingDirectory: '/tmp/first',
      })
      expect(onSecondInstance).toHaveBeenNthCalledWith(2, {
        argv: secondArgv,
        deepLinkUrl: 'myapp://open',
        workingDirectory: '/tmp/second',
      })
    })

    it('preserves second-instance-before-deep-link ordering when buffered', async () => {
      const order: string[] = []
      const url = 'myapp://open'
      const manager = createInstance({ protocols: ['myapp'] })

      manager.configure({
        onDeepLink: () => {
          order.push('deep-link')
        },
      })
      appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')

      expect(manager.getPendingDeepLinks()).toEqual([url])
      expect(order).toEqual([])

      manager.configure({
        onSecondInstance: () => {
          order.push('second-instance')
        },
      })
      expect(order).toEqual(['second-instance'])

      await manager.processPendingDeepLinks()
      expect(order).toEqual(['second-instance', 'deep-link'])
    })

    it('stops buffering second-instance contexts when processing begins', async () => {
      const onDeepLink = vi.fn()
      const onSecondInstance = vi.fn()
      const url = 'myapp://open'
      const manager = createInstance({ protocols: ['myapp'] })

      manager.configure({ onDeepLink })
      await manager.processPendingDeepLinks()

      appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
      await flushScheduledDispatch()
      manager.configure({ onSecondInstance })

      expect(onDeepLink).toHaveBeenCalledWith(url, expect.anything())
      expect(onSecondInstance).not.toHaveBeenCalled()
      expect(manager.getPendingDeepLinks()).toEqual([])
    })

    it('discards buffered relaunches when onSecondInstance is explicitly omitted', () => {
      const onSecondInstance = vi.fn()
      const manager = createInstance()

      appMock._simulateSecondInstance(['MyApp'], '/tmp/buffered')
      manager.configure({ onSecondInstance: undefined })
      appMock._simulateSecondInstance(['MyApp'], '/tmp/future')
      manager.configure({ onSecondInstance })

      expect(onSecondInstance).not.toHaveBeenCalled()
    })

    it('only replaces the handler keys that are provided', async () => {
      const onDeepLink = vi.fn()
      const onSecondInstance = vi.fn()
      const url = 'myapp://open'

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({ onDeepLink })
      manager.configure({ onSecondInstance })

      appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
      await manager.processPendingDeepLinks()

      expect(onSecondInstance).toHaveBeenCalledTimes(1)
      expect(onDeepLink).toHaveBeenCalledTimes(1)
    })
  })

  describe('dispatch completion', () => {
    it('resolves processPendingDeepLinks after async handlers settle', async () => {
      const settled: string[] = []
      const onDeepLink = vi.fn(async (url: string) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        settled.push(url)
      })

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({ onDeepLink })
      manager.queueDeepLink('myapp://one', 'launch')
      manager.queueDeepLink('myapp://two', 'launch')

      await manager.processPendingDeepLinks()

      expect(settled).toEqual(['myapp://one', 'myapp://two'])
    })

    it('resolves processDeferredDeepLinks after async handlers settle', async () => {
      const settled: string[] = []
      const onDeepLink = vi.fn(async (url: string) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        settled.push(url)
      })

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({ onDeepLink })

      await manager.processPendingDeepLinks()
      manager.deferDeepLink('myapp://deferred', 'open-url')

      await manager.processDeferredDeepLinks()

      expect(settled).toEqual(['myapp://deferred'])
    })

    it('continues dispatching after an async deep-link handler rejects', async () => {
      const logger = createMockLogger()
      const delivered: string[] = []
      const onDeepLink = vi.fn(async (url: string) => {
        if (url === 'myapp://first') {
          throw new Error('first handler failed')
        }

        delivered.push(url)
      })

      const manager = createInstance({ logger, protocols: ['myapp'] })
      manager.configure({ onDeepLink })
      manager.queueDeepLink('myapp://first', 'launch')
      manager.queueDeepLink('myapp://second', 'open-url')

      await manager.processPendingDeepLinks()

      expect(logger.error).toHaveBeenCalledWith(
        'Error dispatching deep link: myapp://first (Error: first handler failed)'
      )
      expect(delivered).toEqual(['myapp://second'])
    })

    it('does not deadlock when a handler processes a deferred link', async () => {
      const events: string[] = []

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({
        onDeepLink: async (url) => {
          events.push(`start:${url}`)

          if (url === 'myapp://first') {
            manager.deferDeepLink('myapp://deferred', 'open-url')
            await manager.processDeferredDeepLinks()
            events.push(`scheduled:${url}`)
          }

          events.push(`end:${url}`)
        },
      })
      manager.queueDeepLink('myapp://first', 'launch')

      await manager.processPendingDeepLinks()

      expect(events).toEqual([
        'start:myapp://first',
        'scheduled:myapp://first',
        'end:myapp://first',
        'start:myapp://deferred',
        'end:myapp://deferred',
      ])
    })

    it('awaits deferred work started by a settled handler async descendant', async () => {
      let releaseDelayedCall: () => void = () => {}
      const delayedCallGate = new Promise<void>((resolve) => {
        releaseDelayedCall = resolve
      })
      let releaseDeferredHandler: () => void = () => {}
      const deferredHandlerGate = new Promise<void>((resolve) => {
        releaseDeferredHandler = resolve
      })
      let markDeferredStarted: () => void = () => {}
      const deferredStarted = new Promise<void>((resolve) => {
        markDeferredStarted = resolve
      })
      let processDeferredSettled = false
      let delayedCall: Promise<void> | undefined

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({
        onDeepLink: async (url) => {
          if (url === 'myapp://first') {
            manager.deferDeepLink('myapp://deferred', 'open-url')

            // This continuation inherits the handler's AsyncLocalStorage
            // context, but resumes only after the handler itself has settled.
            delayedCall = delayedCallGate.then(async () => {
              await manager.processDeferredDeepLinks()
              processDeferredSettled = true
            })
            return
          }

          markDeferredStarted()
          await deferredHandlerGate
        },
      })
      manager.queueDeepLink('myapp://first', 'launch')

      await manager.processPendingDeepLinks()
      releaseDelayedCall()
      await deferredStarted

      // A stale inherited async context must not be mistaken for an active,
      // genuinely re-entrant handler call.
      expect(processDeferredSettled).toBe(false)

      releaseDeferredHandler()
      await delayedCall

      expect(processDeferredSettled).toBe(true)
    })

    it('awaits deferred work started outside the active handler', async () => {
      let releaseFirst: () => void = () => {}
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      let markFirstStarted: () => void = () => {}
      const firstStarted = new Promise<void>((resolve) => {
        markFirstStarted = resolve
      })
      let releaseDeferred: () => void = () => {}
      const deferredGate = new Promise<void>((resolve) => {
        releaseDeferred = resolve
      })
      let markDeferredStarted: () => void = () => {}
      const deferredStarted = new Promise<void>((resolve) => {
        markDeferredStarted = resolve
      })
      let processDeferredSettled = false

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({
        onDeepLink: async (url) => {
          if (url === 'myapp://first') {
            markFirstStarted()
            await firstGate
            return
          }

          markDeferredStarted()
          await deferredGate
        },
      })
      manager.queueDeepLink('myapp://first', 'launch')

      const pending = manager.processPendingDeepLinks()
      await firstStarted

      manager.deferDeepLink('myapp://deferred', 'open-url')
      const processing = manager.processDeferredDeepLinks().then(() => {
        processDeferredSettled = true
      })

      await Promise.resolve()
      expect(processDeferredSettled).toBe(false)

      releaseFirst()
      await deferredStarted
      expect(processDeferredSettled).toBe(false)

      releaseDeferred()
      await Promise.all([pending, processing])

      expect(processDeferredSettled).toBe(true)
    })

    it('awaits work a handler queues while it is running', async () => {
      const seen: string[] = []
      const onDeepLink = vi.fn(async (url: string) => {
        // A handler that chains to another link. This is what whenIdle()'s
        // re-check loop exists for: the chain grows while it is being awaited.
        if (url === 'myapp://first') {
          manager.queueDeepLink('myapp://second', 'open-url')
          seen.push(url)
          return
        }

        // A real timer, not a microtask. Resolving whenIdle() one tick early
        // cannot span this, so the assertion isolates the re-check loop
        // instead of riding on incidental microtask scheduling.
        await new Promise((resolve) => setTimeout(resolve, 20))
        seen.push(url)
      })

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({ onDeepLink })
      manager.queueDeepLink('myapp://first', 'launch')

      await manager.processPendingDeepLinks()

      // Without the re-check loop this resolves after 'first' alone.
      expect(seen).toEqual(['myapp://first', 'myapp://second'])
    })

    it('dispatches to a handler swapped in after the drain', async () => {
      const first = vi.fn()
      const second = vi.fn()

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({ onDeepLink: first })

      await manager.processPendingDeepLinks()

      manager.configure({ onDeepLink: second })
      manager.queueDeepLink('myapp://open', 'open-url')
      await flushScheduledDispatch()

      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledWith('myapp://open', expect.anything())
    })

    it('serializes a deep link that arrives mid-drain', async () => {
      const events: string[] = []
      let releaseFirst: () => void = () => {}
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })

      const onDeepLink = vi.fn(async (url: string) => {
        events.push(`start:${url}`)
        if (url === 'myapp://first') {
          await firstGate
        }
        events.push(`end:${url}`)
      })

      const manager = createInstance({ protocols: ['myapp'] })
      manager.configure({ onDeepLink })
      manager.queueDeepLink('myapp://first', 'launch')

      const pending = manager.processPendingDeepLinks()
      await flushScheduledDispatch()

      // Arrives while the first handler is still suspended.
      appMock._simulateSecondInstance(
        ['MyApp', 'myapp://second'],
        '/tmp/project'
      )
      await flushScheduledDispatch()

      expect(events).toEqual(['start:myapp://first'])

      releaseFirst()
      await pending

      expect(events).toEqual([
        'start:myapp://first',
        'end:myapp://first',
        'start:myapp://second',
        'end:myapp://second',
      ])
    })
  })

  describe('single instance lock modes', () => {
    it('acquires and releases the lock in auto mode', () => {
      const manager = createInstance({ protocols: ['myapp'] })

      expect(appMock.requestSingleInstanceLock).toHaveBeenCalledTimes(1)
      expect(manager.shouldQuit).toBe(false)

      manager.dispose()

      expect(appMock.releaseSingleInstanceLock).toHaveBeenCalledTimes(1)
    })

    it('quits when the lock is unavailable in auto mode', () => {
      const onInstanceLockFailed = vi.fn()
      appMock.requestSingleInstanceLock.mockReturnValue(false)

      const manager = createInstance({
        onInstanceLockFailed,
        protocols: ['myapp'],
      })

      expect(manager.shouldQuit).toBe(true)
      expect(onInstanceLockFailed).toHaveBeenCalledTimes(1)
    })

    it('trusts a caller-acquired lock in external mode', async () => {
      const onDeepLink = vi.fn()
      const url = 'myapp://open'

      const manager = createInstance({
        protocols: ['myapp'],
        singleInstanceLock: 'external',
      })
      manager.configure({ onDeepLink })

      expect(appMock.requestSingleInstanceLock).not.toHaveBeenCalled()
      expect(manager.shouldQuit).toBe(false)

      // The second-instance listener must still be installed.
      appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
      await manager.processPendingDeepLinks()

      expect(onDeepLink).toHaveBeenCalledWith(url, expect.anything())
    })

    it('does not release a lock it did not acquire', () => {
      const manager = createInstance({
        protocols: ['myapp'],
        singleInstanceLock: 'external',
      })

      manager.dispose()

      expect(appMock.releaseSingleInstanceLock).not.toHaveBeenCalled()
    })

    it('skips the lock entirely in disabled mode', () => {
      const manager = createInstance({
        protocols: ['myapp'],
        singleInstanceLock: 'disabled',
      })

      expect(appMock.requestSingleInstanceLock).not.toHaveBeenCalled()
      expect(manager.shouldQuit).toBe(false)
      expect(appMock._eventHandlers.has('second-instance')).toBe(false)
    })
  })

  describe('extractDeepLinkFromArgs', () => {
    it('returns the last matching argument', () => {
      const argv = ['MyApp', 'myapp://first', '--flag', 'myapp://last']

      expect(extractDeepLinkFromArgs(argv, ['myapp'])).toBe('myapp://last')
    })

    it('returns undefined when no argument matches', () => {
      expect(extractDeepLinkFromArgs(['MyApp', '--flag'], ['myapp'])).toBe(
        undefined
      )
    })

    it('ignores unregistered protocols', () => {
      expect(extractDeepLinkFromArgs(['other://thing'], ['myapp'])).toBe(
        undefined
      )
    })
  })
})
