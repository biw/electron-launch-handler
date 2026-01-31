import { app } from 'electron'
import type { SetupOptions, Logger } from './types.js'
import { getPlatformHandler } from './platforms/index.js'

/**
 * Result of attempting to acquire the single instance lock
 */
export interface LockResult {
  /** Whether the lock was acquired */
  hasLock: boolean
  /** Cleanup function to release handlers */
  cleanup: () => void
}

/**
 * Attempt to acquire the single instance lock
 *
 * @param options - Setup options
 * @param logger - Logger instance
 * @param onSecondInstanceDeepLink - Callback with deep link URL from a second instance
 * @returns Lock result
 */
export function acquireInstanceLock(
  options: SetupOptions,
  logger: Logger,
  onSecondInstanceDeepLink: (deepLinkUrl: string | undefined) => void
): LockResult {
  const platformHandler = getPlatformHandler()
  const protocols = normalizeProtocols(options.protocols)

  // Check for platform-specific startup events (e.g., Squirrel on Windows)
  if (platformHandler.handleStartupEvents?.(options)) {
    logger.info('Handling platform startup event, app will quit')
    return {
      hasLock: false,
      cleanup: () => {},
    }
  }

  // Try to acquire the single instance lock
  const hasLock = app.requestSingleInstanceLock()

  if (!hasLock) {
    logger.info('Another instance is already running')
    options.onInstanceLockFailed?.()
    return {
      hasLock: false,
      cleanup: () => {},
    }
  }

  logger.info('Acquired single instance lock')

  // Set up handler for second instance
  const secondInstanceHandler = (
    _event: Electron.Event,
    argv: string[],
    _workingDirectory: string
  ) => {
    logger.debug(`Second instance launched with args: ${argv.join(' ')}`)

    // Extract deep link from command line args
    const deepLinkUrl = platformHandler.extractDeepLinkFromArgs(argv, protocols)

    onSecondInstanceDeepLink(deepLinkUrl)
  }

  app.on('second-instance', secondInstanceHandler)

  return {
    hasLock: true,
    cleanup: () => {
      app.off('second-instance', secondInstanceHandler)
    },
  }
}

/**
 * Normalize protocol configuration to an array of scheme strings
 */
function normalizeProtocols(protocols?: string[]): string[] {
  if (!protocols) return []
  return protocols
}
