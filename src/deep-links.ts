import { app } from 'electron'
import type {
  SetupOptions,
  DeepLinkContext,
  DeepLinkIntent,
  Logger,
} from './types.js'
import { DeepLinkQueue } from './queue.js'
import { createDeepLinkContext } from './url-parser.js'
import { getPlatformHandler, isMacOS } from './platforms/index.js'

/**
 * Deep link manager for handling incoming URLs
 */
export interface DeepLinkManager {
  /** Process a deep link URL with intent information */
  handleDeepLink: (url: string, intent: DeepLinkIntent) => void
  /** Process all pending deep links */
  processPending: () => void
  /** Get pending deep links without processing */
  getPending: () => string[]
  /** Clear pending deep links */
  clearPending: () => void
  /** Queue a deep link URL for later processing */
  queueDeepLink: (url: string, intent?: DeepLinkIntent) => void
  /** Cleanup handlers */
  cleanup: () => void
}

/**
 * Create a deep link manager
 *
 * @param options - Setup options
 * @param logger - Logger instance
 * @param protocols - Registered protocol schemes
 * @returns Deep link manager
 */
export function createDeepLinkManager(
  options: SetupOptions,
  logger: Logger,
  protocols: string[]
): DeepLinkManager {
  const queue = new DeepLinkQueue(logger)
  const deferDispatch = (fn: () => void) => {
    Promise.resolve()
      .then(fn)
      .catch((error) => {
        logger.error(`Error dispatching deferred deep link: ${String(error)}`)
      })
  }

  /**
   * Handle an incoming deep link URL
   */
  function handleDeepLink(url: string, intent: DeepLinkIntent): void {
    logger.debug(`Received deep link: ${url} (intent: ${intent})`)

    // Check if URL matches a registered protocol
    const context = createDeepLinkContext(url, intent)
    if (!context) {
      logger.error(`Failed to parse deep link URL: ${url}`)
      return
    }

    if (!protocols.includes(context.protocol)) {
      logger.debug(
        `Ignoring deep link with unregistered protocol: ${context.protocol}`
      )
      return
    }

    // If queue hasn't been processed yet, queue the URL
    if (!queue.isProcessed()) {
      logger.debug(`Queuing deep link for later processing: ${url}`)
      queue.enqueue(url, intent)
      return
    }

    // Process immediately
    void dispatchDeepLink(url, context)
  }

  /**
   * Dispatch a deep link to handlers.
   * Supports async handlers - will await if the handler returns a promise.
   */
  async function dispatchDeepLink(
    url: string,
    context: DeepLinkContext
  ): Promise<void> {
    try {
      logger.debug(`Dispatching deep link: ${url}`)

      if (options.onDeepLink) {
        await options.onDeepLink(url, context)
        return
      }

      logger.debug(`No handler for deep link: ${url}`)
    } catch (error) {
      logger.error(`Error dispatching deep link: ${url} (${String(error)})`)
    }
  }

  /**
   * Process all pending deep links.
   * Also marks the queue as "processed" - future deep links will be
   * dispatched immediately instead of being queued.
   */
  function processPending(): void {
    const pending = queue.drain()

    if (pending.length === 0) {
      logger.debug('No pending deep links to process')
      return
    }

    logger.info(`Processing ${pending.length} pending deep link(s)`)
    void (async () => {
      for (const entry of pending) {
        const context = createDeepLinkContext(entry.url, entry.intent)
        if (context) {
          await dispatchDeepLink(entry.url, context)
        }
      }
    })()
  }

  /**
   * Queue a deep link URL for later processing.
   * If the queue has already been processed, the URL will be
   * dispatched on the next tick instead.
   */
  function queueDeepLink(
    url: string,
    intent: DeepLinkIntent = 'open-url'
  ): void {
    if (queue.isProcessed()) {
      logger.debug(`Queue already processed, deferring dispatch: ${url}`)
      deferDispatch(() => handleDeepLink(url, intent))
      return
    }

    handleDeepLink(url, intent)
  }

  // Set up platform-specific deep link listeners
  const cleanupHandlers: (() => void)[] = []

  // On macOS, deep links come via the 'open-url' event
  if (isMacOS()) {
    const openUrlHandler = (event: Electron.Event, url: string) => {
      event.preventDefault()
      handleDeepLink(url, 'open-url')
    }

    app.on('open-url', openUrlHandler)
    cleanupHandlers.push(() => app.off('open-url', openUrlHandler))

    // Also check for deep link in launch args on macOS
    const platformHandler = getPlatformHandler()
    const launchUrl = platformHandler.extractDeepLinkFromArgs(
      process.argv,
      protocols
    )
    if (launchUrl) {
      handleDeepLink(launchUrl, 'launch')
    }
  } else {
    // On Windows/Linux, check command line args at startup
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
    cleanup: () => {
      for (const cleanup of cleanupHandlers) {
        cleanup()
      }
    },
  }
}
