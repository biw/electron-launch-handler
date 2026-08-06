import type {
  CreateInstanceOptions,
  SetupOptions,
  DeepLinkDeferral,
  InstanceHandlers,
  InstanceManager,
  Logger,
  DeepLinkContext,
  DeepLinkIntent,
  DeepLinkHandler,
  DeepLinkHandlerResult,
  SecondInstanceContext,
  SecondInstanceHandler,
  SingleInstanceLockMode,
  WindowsOptions,
  SquirrelOptions,
  LinuxOptions,
  MacOSOptions,
  ParsedDeepLink,
} from './types.js'
import { acquireInstanceLock } from './instance-lock.js'
import { getProtocolSchemes, registerProtocols } from './protocol-registry.js'
import { createDeepLinkManager } from './deep-links.js'
import { getPlatformHandler } from './platforms/index.js'
import { parseDeepLink } from './url-parser.js'

export type {
  CreateInstanceOptions,
  SetupOptions,
  DeepLinkDeferral,
  InstanceHandlers,
  InstanceManager,
  Logger,
  DeepLinkContext,
  DeepLinkIntent,
  DeepLinkHandler,
  DeepLinkHandlerResult,
  SecondInstanceContext,
  SecondInstanceHandler,
  SingleInstanceLockMode,
  WindowsOptions,
  SquirrelOptions,
  LinuxOptions,
  MacOSOptions,
  ParsedDeepLink,
}

export { parseDeepLink }

/**
 * Find the last deep link in a list of command-line arguments.
 *
 * Exposed because apps that buffer their own launch events (or parse a
 * relaunch's `argv` themselves) otherwise have to reimplement it.
 */
export function extractDeepLinkFromArgs(
  argv: string[],
  protocols: string[]
): string | undefined {
  return getPlatformHandler().extractDeepLinkFromArgs(argv, protocols)
}

function createNoOpLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    error: () => {},
  }
}

function createInactiveManager(): InstanceManager {
  return {
    shouldQuit: true,
    configure: () => {},
    processPendingDeepLinks: () => Promise.resolve(),
    getPendingDeepLinks: () => [],
    clearPendingDeepLinks: () => {},
    queueDeepLink: () => {},
    deferDeepLink: () => {},
    processDeferredDeepLinks: () => Promise.resolve(),
    getDeferredDeepLinks: () => [],
    clearDeferredDeepLinks: () => {},
    unregisterProtocols: () => {},
    dispose: () => {},
  }
}

/**
 * Install single-instance handling and protocol deep links without supplying
 * the app handlers yet.
 *
 * Call this as early as possible — ideally the first statement of your main
 * entry point — so the `'open-url'` listener is installed before macOS can
 * deliver a cold-launch deep link. Deep links received before
 * `configure()` + `processPendingDeepLinks()` stay queued.
 *
 * If your app can build its handlers immediately, use `setupInstance()`.
 */
export function createInstance(
  options: CreateInstanceOptions = {}
): InstanceManager {
  const logger = options.logger ?? createNoOpLogger()

  logger.info('Setting up electron-launch-handler')

  // Mutated by configure(); read at dispatch time so handlers can arrive after
  // the listeners are installed.
  const handlers: InstanceHandlers = {}

  let deepLinkManager: ReturnType<typeof createDeepLinkManager> | null = null

  const lockResult = acquireInstanceLock(
    options,
    handlers,
    logger,
    (deepLinkUrl: string | undefined) => {
      if (!deepLinkUrl) {
        return
      }

      deepLinkManager?.handleDeepLink(deepLinkUrl, 'open-url')
    }
  )

  if (!lockResult.hasLock) {
    return createInactiveManager()
  }

  const protocolResult = registerProtocols(options, logger)
  deepLinkManager = createDeepLinkManager(
    handlers,
    logger,
    getProtocolSchemes(options.protocols)
  )

  let disposed = false
  let protocolsUnregistered = false

  const unregisterProtocols = () => {
    if (protocolsUnregistered) {
      return
    }

    protocolsUnregistered = true
    protocolResult.unregisterAll()
  }

  const dispose = () => {
    if (disposed) {
      return
    }

    disposed = true
    deepLinkManager.cleanup()
    lockResult.cleanup()
    unregisterProtocols()
  }

  return {
    shouldQuit: false,

    configure: (next: InstanceHandlers) => {
      if ('onDeepLink' in next) {
        handlers.onDeepLink = next.onDeepLink
      }

      if ('onSecondInstance' in next) {
        handlers.onSecondInstance = next.onSecondInstance
        lockResult.finishSecondInstanceBuffering()
      }
    },

    processPendingDeepLinks: () => {
      lockResult.finishSecondInstanceBuffering()
      return deepLinkManager.processPending()
    },

    getPendingDeepLinks: () => {
      return deepLinkManager.getPending()
    },

    clearPendingDeepLinks: () => {
      deepLinkManager.clearPending()
    },

    queueDeepLink: (url: string, intent?: DeepLinkIntent) => {
      deepLinkManager.queueDeepLink(url, intent)
    },

    deferDeepLink: (url: string, intent?: DeepLinkIntent) => {
      deepLinkManager.deferDeepLink(url, intent)
    },

    processDeferredDeepLinks: () => {
      return deepLinkManager.processDeferred()
    },

    getDeferredDeepLinks: () => {
      return deepLinkManager.getDeferred()
    },

    clearDeferredDeepLinks: () => {
      deepLinkManager.clearDeferred()
    },

    unregisterProtocols,

    dispose,
  }
}

/**
 * Set up single-instance handling and protocol deep links in one call.
 *
 * Equivalent to `createInstance()` followed immediately by `configure()`. Use
 * `createInstance()` instead when your handlers depend on work that happens
 * after startup (database, auth, window manager), so the listeners are still
 * installed early enough to catch a cold-launch deep link.
 */
export function setupInstance(options: SetupOptions = {}): InstanceManager {
  const manager = createInstance(options)

  manager.configure({
    onDeepLink: options.onDeepLink,
    onSecondInstance: options.onSecondInstance,
  })

  return manager
}

export default setupInstance
