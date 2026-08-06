import { AsyncLocalStorage } from 'node:async_hooks'
import { app } from 'electron'
import type {
  DeepLinkContext,
  DeepLinkDeferral,
  DeepLinkHandlerResult,
  DeepLinkIntent,
  InstanceHandlers,
  Logger,
} from './types.js'
import { DeepLinkQueue, type QueuedDeepLink } from './queue.js'
import { createDeepLinkContext } from './url-parser.js'
import { getPlatformHandler, isMacOS } from './platforms/index.js'

const isDeepLinkDeferral = (
  result: DeepLinkHandlerResult
): result is DeepLinkDeferral => {
  return result?.action === 'defer'
}

export interface DeepLinkManager {
  handleDeepLink: (url: string, intent: DeepLinkIntent) => void
  processPending: () => Promise<void>
  getPending: () => string[]
  clearPending: () => void
  queueDeepLink: (url: string, intent?: DeepLinkIntent) => void
  deferDeepLink: (url: string, intent?: DeepLinkIntent) => void
  processDeferred: () => Promise<void>
  getDeferred: () => string[]
  clearDeferred: () => void
  whenIdle: () => Promise<void>
  cleanup: () => void
}

export function createDeepLinkManager(
  handlers: InstanceHandlers,
  logger: Logger,
  protocols: string[]
): DeepLinkManager {
  const queue = new DeepLinkQueue(logger)
  const deferredDeepLinks: QueuedDeepLink[] = []

  /**
   * Every dispatch runs through this chain, so handlers never interleave —
   * an `open-url` that lands mid-drain queues up behind the drain instead of
   * racing it.
   */
  let dispatchChain: Promise<void> = Promise.resolve()
  const dispatchContext = new AsyncLocalStorage<symbol>()
  const activeDispatches = new Set<symbol>()

  function enqueueDispatch(task: () => Promise<void> | void): Promise<void> {
    const dispatchToken = Symbol('deep-link-dispatch')

    dispatchChain = dispatchChain
      .then(() =>
        dispatchContext.run(dispatchToken, async () => {
          activeDispatches.add(dispatchToken)

          try {
            await task()
          } finally {
            activeDispatches.delete(dispatchToken)
          }
        })
      )
      .catch((error) => {
        logger.error(`Error dispatching deep link: ${String(error)}`)
      })

    return dispatchChain
  }

  /**
   * Resolve once the dispatch chain has drained. Re-checks after each await
   * because a handler (or an OS event) can append more work while we wait.
   */
  async function whenIdle(): Promise<void> {
    let awaited = dispatchChain

    for (;;) {
      await awaited

      if (awaited === dispatchChain) {
        return
      }

      awaited = dispatchChain
    }
  }

  function createRegisteredContext(
    url: string,
    intent: DeepLinkIntent
  ): DeepLinkContext | null {
    const context = createDeepLinkContext(url, intent)
    if (!context) {
      logger.error(`Failed to parse deep link URL: ${url}`)
      return null
    }

    if (!protocols.includes(context.protocol)) {
      logger.debug(
        `Ignoring deep link with unregistered protocol: ${context.protocol}`
      )
      return null
    }

    return context
  }

  function handleDeepLink(url: string, intent: DeepLinkIntent): void {
    logger.debug(`Received deep link: ${url} (intent: ${intent})`)

    const context = createRegisteredContext(url, intent)
    if (!context) {
      return
    }

    if (!queue.isProcessed()) {
      logger.debug(`Queuing deep link for later processing: ${url}`)
      queue.enqueue(url, intent)
      return
    }

    void enqueueDispatch(() => dispatchDeepLink(url, context))
  }

  function deferDeepLink(
    url: string,
    intent: DeepLinkIntent = 'open-url'
  ): void {
    const context = createRegisteredContext(url, intent)
    if (!context) {
      return
    }

    logger.debug(`Deferring deep link until later processing: ${url}`)
    deferredDeepLinks.push({ url, intent })
  }

  async function dispatchDeepLink(
    url: string,
    context: DeepLinkContext
  ): Promise<void> {
    try {
      logger.debug(`Dispatching deep link: ${url}`)

      if (handlers.onDeepLink) {
        const result = await handlers.onDeepLink(url, context)
        if (isDeepLinkDeferral(result)) {
          logger.debug(`Handler deferred deep link: ${url}`)
          deferDeepLink(url, context.intent)
        }
        return
      }

      logger.debug(`No handler for deep link: ${url}`)
    } catch (error) {
      logger.error(`Error dispatching deep link: ${url} (${String(error)})`)
    }
  }

  async function processPending(): Promise<void> {
    const pending = queue.drain()

    if (pending.length === 0) {
      logger.debug('No pending deep links to process')
      return
    }

    if (!handlers.onDeepLink) {
      logger.info(
        `Discarding ${pending.length} pending deep link(s): no onDeepLink handler configured`
      )
      return
    }

    logger.info(`Processing ${pending.length} pending deep link(s)`)

    for (const entry of pending) {
      const context = createRegisteredContext(entry.url, entry.intent)
      if (context) {
        void enqueueDispatch(() => dispatchDeepLink(entry.url, context))
      }
    }

    await whenIdle()
  }

  async function processDeferred(): Promise<void> {
    if (deferredDeepLinks.length === 0) {
      logger.debug('No deferred deep links to process')
      return
    }

    const pending = deferredDeepLinks.splice(0)

    logger.info(`Processing ${pending.length} deferred deep link(s)`)

    for (const entry of pending) {
      handleDeepLink(entry.url, entry.intent)
    }

    // A handler may defer a URL and immediately ask to process it. The new
    // dispatch is serialized behind that handler, so awaiting the global chain
    // from inside the handler would create a cycle. In that re-entrant case,
    // processing has been scheduled but cannot settle until the caller returns.
    const currentDispatch = dispatchContext.getStore()
    if (currentDispatch && activeDispatches.has(currentDispatch)) {
      logger.debug(
        'Deferred deep links queued behind the active handler; skipping re-entrant wait'
      )
      return
    }

    await whenIdle()
  }

  function queueDeepLink(
    url: string,
    intent: DeepLinkIntent = 'open-url'
  ): void {
    handleDeepLink(url, intent)
  }

  const cleanupHandlers: (() => void)[] = []

  // macOS delivers deep links through 'open-url'. Install the listener as
  // early as possible: for a cold launch the event fires before 'ready', so a
  // late listener misses it entirely.
  if (isMacOS()) {
    const openUrlHandler = (event: Electron.Event, url: string) => {
      event.preventDefault()

      // Electron does not say whether an open-url event started the process.
      // app.isReady() is only lifecycle state, so it cannot safely distinguish
      // a cold launch from a URL received during slow startup.
      handleDeepLink(url, 'open-url')
    }

    app.on('open-url', openUrlHandler)
    cleanupHandlers.push(() => app.off('open-url', openUrlHandler))
  }

  // Windows and Linux pass the URL in argv. macOS normally does not, but check
  // anyway so a manually-passed URL still works.
  const launchUrl = getPlatformHandler().extractDeepLinkFromArgs(
    process.argv,
    protocols
  )
  if (launchUrl) {
    handleDeepLink(launchUrl, 'launch')
  }

  return {
    handleDeepLink,
    processPending,
    getPending: () => queue.peek().map((entry) => entry.url),
    clearPending: () => queue.clear(),
    queueDeepLink,
    deferDeepLink,
    processDeferred,
    getDeferred: () => deferredDeepLinks.map((entry) => entry.url),
    clearDeferred: () => {
      logger.debug(`Clearing ${deferredDeepLinks.length} deferred deep link(s)`)
      deferredDeepLinks.length = 0
    },
    whenIdle,
    cleanup: () => {
      for (const cleanup of cleanupHandlers) {
        cleanup()
      }
    },
  }
}
