import type { SetupOptions, Logger } from './types.js'
import { getPlatformHandler } from './platforms/index.js'

/**
 * Result of protocol registration
 */
export interface ProtocolRegistryResult {
  /** Successfully registered protocol schemes */
  registered: string[]
  /** Failed protocol schemes */
  failed: string[]
  /** Unregister all registered protocols */
  unregisterAll: () => void
}

/**
 * Register protocol schemes for deep linking
 *
 * @param options - Setup options containing protocol configuration
 * @param logger - Logger instance
 * @returns Registration result
 */
export function registerProtocols(
  options: SetupOptions,
  logger: Logger
): ProtocolRegistryResult {
  const platformHandler = getPlatformHandler()
  const protocols = normalizeProtocols(options.protocols)

  const registered: string[] = []
  const failed: string[] = []

  for (const scheme of protocols) {
    logger.debug(`Registering protocol: ${scheme}`)

    const success = platformHandler.registerProtocol(scheme, options)

    if (success) {
      logger.info(`Registered protocol: ${scheme}`)
      registered.push(scheme)
    } else {
      logger.error(`Failed to register protocol: ${scheme}`)
      failed.push(scheme)
    }
  }

  return {
    registered,
    failed,
    unregisterAll: () => {
      for (const scheme of registered) {
        logger.debug(`Unregistering protocol: ${scheme}`)
        platformHandler.unregisterProtocol(scheme)
      }
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

/**
 * Get all protocol schemes from configuration
 */
export function getProtocolSchemes(protocols?: string[]): string[] {
  return normalizeProtocols(protocols)
}
