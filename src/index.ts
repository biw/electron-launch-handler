import type {
  SetupOptions,
  DeepLinkDeferral,
  InstanceManager,
  Logger,
  DeepLinkContext,
  DeepLinkIntent,
  DeepLinkHandler,
  DeepLinkHandlerResult,
  SecondInstanceContext,
  SecondInstanceHandler,
  WindowsOptions,
  SquirrelOptions,
  LinuxOptions,
  MacOSOptions,
  ParsedDeepLink,
} from './types.js'
import { acquireInstanceLock } from './instance-lock.js'
import { registerProtocols } from './protocol-registry.js'
import { createDeepLinkManager } from './deep-links.js'
import { parseDeepLink } from './url-parser.js'

export type {
  SetupOptions,
  DeepLinkDeferral,
  InstanceManager,
  Logger,
  DeepLinkContext,
  DeepLinkIntent,
  DeepLinkHandler,
  DeepLinkHandlerResult,
  SecondInstanceContext,
  SecondInstanceHandler,
  WindowsOptions,
  SquirrelOptions,
  LinuxOptions,
  MacOSOptions,
  ParsedDeepLink,
}

export { parseDeepLink }

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
    processPendingDeepLinks: () => {},
    getPendingDeepLinks: () => [],
    clearPendingDeepLinks: () => {},
    queueDeepLink: () => {},
    deferDeepLink: () => {},
    processDeferredDeepLinks: () => {},
    getDeferredDeepLinks: () => [],
    clearDeferredDeepLinks: () => {},
    unregisterProtocols: () => {},
    dispose: () => {},
  }
}

/** Set up single-instance handling and protocol deep links. */
export function setupInstance(options: SetupOptions): InstanceManager {
  const logger = options.logger ?? createNoOpLogger()

  logger.info('Setting up electron-launch-handler')

  let deepLinkManager: ReturnType<typeof createDeepLinkManager> | null = null
  logger.debug('Single instance mode enabled')

  const lockResult = acquireInstanceLock(
    options,
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
    options,
    logger,
    protocolResult.registered
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

    processPendingDeepLinks: () => {
      deepLinkManager.processPending()
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
      deepLinkManager.processDeferred()
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

export default setupInstance
