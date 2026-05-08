import type { SetupOptions, Logger } from './types.js'
import { getPlatformHandler } from './platforms/index.js'

export interface ProtocolRegistryResult {
  registered: string[]
  failed: string[]
  unregisterAll: () => void
}

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

function normalizeProtocols(protocols?: string[]): string[] {
  if (!protocols) return []

  return protocols
}

export function getProtocolSchemes(protocols?: string[]): string[] {
  return normalizeProtocols(protocols)
}
