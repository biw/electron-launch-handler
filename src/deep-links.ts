import { app } from 'electron'
import type {
  SetupOptions,
  DeepLinkContext,
  DeepLinkDeferral,
  DeepLinkHandlerResult,
  DeepLinkIntent,
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
  processPending: () => void
  getPending: () => string[]
  clearPending: () => void
  queueDeepLink: (url: string, intent?: DeepLinkIntent) => void
  deferDeepLink: (url: string, intent?: DeepLinkIntent) => void
  processDeferred: () => void
  getDeferred: () => string[]
  clearDeferred: () => void
  cleanup: () => void
}

export function createDeepLinkManager(
  options: SetupOptions,
  logger: Logger,
  protocols: string[]
): DeepLinkManager {
  const queue = new DeepLinkQueue(logger)
  const deferredDeepLinks: QueuedDeepLink[] = []
  const scheduleDispatch = (fn: () => void) => {
    Promise.resolve()
      .then(fn)
      .catch((error) => {
        logger.error(`Error dispatching deep link: ${String(error)}`)
      })
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

    void dispatchDeepLink(url, context)
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

      if (options.onDeepLink) {
        const result = await options.onDeepLink(url, context)
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

  function processPending(): void {
    const pending = queue.drain()

    if (pending.length === 0) {
      logger.debug('No pending deep links to process')
      return
    }

    logger.info(`Processing ${pending.length} pending deep link(s)`)
    void (async () => {
      for (const entry of pending) {
        const context = createRegisteredContext(entry.url, entry.intent)
        if (context) {
          await dispatchDeepLink(entry.url, context)
        }
      }
    })()
  }

  function processDeferred(): void {
    if (deferredDeepLinks.length === 0) {
      logger.debug('No deferred deep links to process')
      return
    }

    const pending = deferredDeepLinks.splice(0)

    logger.info(`Processing ${pending.length} deferred deep link(s)`)

    for (const entry of pending) {
      handleDeepLink(entry.url, entry.intent)
    }
  }

  function queueDeepLink(
    url: string,
    intent: DeepLinkIntent = 'open-url'
  ): void {
    if (queue.isProcessed()) {
      logger.debug(`Queue already processed, scheduling dispatch: ${url}`)
      scheduleDispatch(() => handleDeepLink(url, intent))
      return
    }

    handleDeepLink(url, intent)
  }

  const cleanupHandlers: (() => void)[] = []

  if (isMacOS()) {
    const openUrlHandler = (event: Electron.Event, url: string) => {
      event.preventDefault()
      handleDeepLink(url, 'open-url')
    }

    app.on('open-url', openUrlHandler)
    cleanupHandlers.push(() => app.off('open-url', openUrlHandler))

    const platformHandler = getPlatformHandler()
    const launchUrl = platformHandler.extractDeepLinkFromArgs(
      process.argv,
      protocols
    )
    if (launchUrl) {
      handleDeepLink(launchUrl, 'launch')
    }
  } else {
    const platformHandler = getPlatformHandler()
    const launchUrl = platformHandler.extractDeepLinkFromArgs(
      process.argv,
      protocols
    )
    if (launchUrl) {
      handleDeepLink(launchUrl, 'launch')
    }
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
    cleanup: () => {
      for (const cleanup of cleanupHandlers) {
        cleanup()
      }
    },
  }
}
