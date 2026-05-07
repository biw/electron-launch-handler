import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockApp,
  createMockLogger,
  type MockApp,
} from '../helpers/electron-mock.js'

const flushScheduledDispatch = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('setupInstance', () => {
  let appMock: MockApp
  let setupInstance: typeof import('../../src/index.js').setupInstance

  beforeEach(async () => {
    vi.resetModules()

    appMock = createMockApp()
    vi.doMock('electron', () => ({ app: appMock }))
    ;({ setupInstance } = await import('../../src/index.js'))
  })

  it('calls onSecondInstance for relaunches without deep links', async () => {
    const logger = createMockLogger()
    const onDeepLink = vi.fn()
    const onSecondInstance = vi.fn()
    const argv = ['MyApp']

    const manager = setupInstance({
      logger,
      onDeepLink,
      onSecondInstance,
      protocols: ['myapp'],
    })

    appMock._simulateSecondInstance(argv, '/tmp/project')
    await Promise.resolve()

    expect(onSecondInstance).toHaveBeenCalledWith({
      argv,
      workingDirectory: '/tmp/project',
    })
    expect(onDeepLink).not.toHaveBeenCalled()
    expect(manager.getPendingDeepLinks()).toEqual([])
  })

  it('queues second-instance deep links until readiness', async () => {
    const logger = createMockLogger()
    const onDeepLink = vi.fn()
    const onSecondInstance = vi.fn()
    const url = 'myapp://settings?tab=general'

    const manager = setupInstance({
      logger,
      onDeepLink,
      onSecondInstance,
      protocols: ['myapp'],
    })

    appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
    await Promise.resolve()

    expect(onSecondInstance).toHaveBeenCalledWith({
      argv: ['MyApp', url],
      deepLinkUrl: url,
      workingDirectory: '/tmp/project',
    })
    expect(manager.getPendingDeepLinks()).toEqual([url])
    expect(onDeepLink).not.toHaveBeenCalled()

    manager.processPendingDeepLinks()
    await flushScheduledDispatch()

    expect(onDeepLink).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        host: 'settings',
        intent: 'open-url',
        protocol: 'myapp',
      })
    )
  })

  it('still handles configured protocols when OS registration fails', async () => {
    appMock.setAsDefaultProtocolClient.mockReturnValue(false)

    const logger = createMockLogger()
    const onDeepLink = vi.fn()
    const url = 'myapp://settings?tab=general'

    const manager = setupInstance({
      logger,
      onDeepLink,
      protocols: ['myapp'],
    })

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to register protocol: myapp'
    )

    appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
    expect(manager.getPendingDeepLinks()).toEqual([url])

    manager.processPendingDeepLinks()
    await flushScheduledDispatch()

    expect(onDeepLink).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        intent: 'open-url',
        protocol: 'myapp',
      })
    )
  })

  it('keeps pending deep link processing idempotent', async () => {
    const onDeepLink = vi.fn()
    const url = 'myapp://settings?tab=general'

    const manager = setupInstance({
      onDeepLink,
      protocols: ['myapp'],
    })

    manager.queueDeepLink(url, 'launch')

    expect(manager.getPendingDeepLinks()).toEqual([url])

    manager.processPendingDeepLinks()
    await flushScheduledDispatch()
    manager.processPendingDeepLinks()
    await flushScheduledDispatch()

    expect(onDeepLink).toHaveBeenCalledTimes(1)
    expect(onDeepLink).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        intent: 'launch',
        protocol: 'myapp',
      })
    )
    expect(manager.getPendingDeepLinks()).toEqual([])
  })

  it('keeps routing deep links when onSecondInstance throws', async () => {
    const logger = createMockLogger()
    const onDeepLink = vi.fn()
    const onSecondInstance = vi.fn(() => {
      throw new Error('second-instance failed')
    })
    const url = 'myapp://settings?tab=general'

    const manager = setupInstance({
      logger,
      onDeepLink,
      onSecondInstance,
      protocols: ['myapp'],
    })

    appMock._simulateSecondInstance(['MyApp', url], '/tmp/project')
    await flushScheduledDispatch()

    expect(logger.error).toHaveBeenCalledWith(
      'Error handling second instance: Error: second-instance failed'
    )
    expect(manager.getPendingDeepLinks()).toEqual([url])

    manager.processPendingDeepLinks()
    await flushScheduledDispatch()

    expect(onDeepLink).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        intent: 'open-url',
        protocol: 'myapp',
      })
    )
  })

  it('holds manually deferred links until the deferred queue is processed', async () => {
    const onDeepLink = vi.fn()
    const url = 'myapp://settings?tab=shortcuts'

    const manager = setupInstance({
      onDeepLink,
      protocols: ['myapp'],
    })

    manager.processPendingDeepLinks()
    manager.deferDeepLink(url, 'open-url')

    expect(manager.getDeferredDeepLinks()).toEqual([url])
    expect(onDeepLink).not.toHaveBeenCalled()

    manager.processDeferredDeepLinks()
    await flushScheduledDispatch()

    expect(manager.getDeferredDeepLinks()).toEqual([])
    expect(onDeepLink).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        host: 'settings',
        intent: 'open-url',
        protocol: 'myapp',
      })
    )
  })

  it('does not immediately redispatch handler-deferred links', async () => {
    const url = 'myapp://onboarding'
    const onDeepLink = vi.fn(() => ({ action: 'defer' }) as const)

    const manager = setupInstance({
      onDeepLink,
      protocols: ['myapp'],
    })

    manager.processPendingDeepLinks()
    manager.queueDeepLink(url, 'open-url')
    await flushScheduledDispatch()

    expect(onDeepLink).toHaveBeenCalledTimes(1)
    expect(manager.getDeferredDeepLinks()).toEqual([url])
  })

  it('redelivers handler-deferred links when deferred queue is processed', async () => {
    let shouldDefer = true
    const url = 'myapp://onboarding'
    const onDeepLink = vi.fn(() => {
      if (!shouldDefer) {
        return
      }

      shouldDefer = false
      return { action: 'defer' } as const
    })

    const manager = setupInstance({
      onDeepLink,
      protocols: ['myapp'],
    })

    manager.processPendingDeepLinks()
    manager.queueDeepLink(url, 'open-url')
    await flushScheduledDispatch()

    expect(onDeepLink).toHaveBeenCalledTimes(1)
    expect(manager.getDeferredDeepLinks()).toEqual([url])

    manager.processDeferredDeepLinks()
    await flushScheduledDispatch()

    expect(onDeepLink).toHaveBeenCalledTimes(2)
    expect(manager.getDeferredDeepLinks()).toEqual([])
  })

  it('disposes listeners and registered protocols idempotently', () => {
    const manager = setupInstance({
      protocols: ['myapp'],
    })

    manager.dispose()
    manager.dispose()

    expect(appMock.off).toHaveBeenCalledWith(
      'second-instance',
      expect.any(Function)
    )
    expect(appMock.releaseSingleInstanceLock).toHaveBeenCalledTimes(1)
    expect(appMock.removeAsDefaultProtocolClient).toHaveBeenCalledTimes(1)
    expect(appMock.removeAsDefaultProtocolClient).toHaveBeenCalledWith('myapp')
  })
})
