import type {
  SetupOptions,
  InstanceManager,
  Logger,
  DeepLinkContext,
  DeepLinkIntent,
  DeepLinkHandler,
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

// Re-export types
export type {
  SetupOptions,
  InstanceManager,
  Logger,
  DeepLinkContext,
  DeepLinkIntent,
  DeepLinkHandler,
  WindowsOptions,
  SquirrelOptions,
  LinuxOptions,
  MacOSOptions,
  ParsedDeepLink,
}

// Re-export utilities
export { parseDeepLink }

/**
 * Create a no-op logger
 */
function createNoOpLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    error: () => {},
  }
}

/**
 * Set up single instance handling and deep link support for an Electron app.
 *
 * This function should be called as early as possible in your app's startup,
 * typically at the top of your main process entry point.
 *
 * @example
 * ```typescript
 * import { setupInstance } from 'electron-launch-handler'
 * import { app, BrowserWindow } from 'electron'
 *
 * let mainWindow: BrowserWindow | null = null
 *
 * const instance = setupInstance({
 *   protocols: ['myapp'],
 *   onDeepLink: (url, context) => {
 *     if (!mainWindow) {
 *       mainWindow = new BrowserWindow({ ... })
 *     }
 *     console.log('Received deep link:', url)
 *   },
 * })
 *
 * if (instance.shouldQuit) {
 *   app.quit()
 * } else {
 *   app.whenReady().then(async () => {
 *     instance.processPendingDeepLinks()
 *   })
 * }
 * ```
 *
 * @param options - Configuration options
 * @returns Instance manager for controlling the app instance
 */
export function setupInstance(options: SetupOptions): InstanceManager {
  const logger = options.logger ?? createNoOpLogger()

  logger.info('Setting up electron-launch-handler')

  // Handle single instance locking
  let shouldQuit = false
  let deepLinkManager: ReturnType<typeof createDeepLinkManager> | null = null
  logger.debug('Single instance mode enabled')

  const lockResult = acquireInstanceLock(
    options,
    logger,
    (deepLinkUrl: string | undefined) => {
      if (deepLinkUrl) {
        deepLinkManager?.handleDeepLink(deepLinkUrl, 'open-url')
      }
    }
  )

  shouldQuit = !lockResult.hasLock

  // If we should quit, return early with minimal manager
  if (shouldQuit) {
    return {
      shouldQuit: true,
      processPendingDeepLinks: () => {},
      getPendingDeepLinks: () => [],
      clearPendingDeepLinks: () => {},
      queueDeepLink: (_url: string, _intent?: DeepLinkIntent) => {},
      unregisterProtocols: () => {},
    }
  }

  // Register protocols
  const protocolResult = registerProtocols(options, logger)

  // Create deep link manager
  deepLinkManager = createDeepLinkManager(
    options,
    logger,
    protocolResult.registered
  )

  // Return the instance manager
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

    unregisterProtocols: () => {
      protocolResult.unregisterAll()
    },
  }
}

export default setupInstance
