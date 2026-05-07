import { app } from 'electron'
import type { SetupOptions, Logger, SecondInstanceContext } from './types.js'
import { getPlatformHandler } from './platforms/index.js'

export interface LockResult {
  hasLock: boolean
  cleanup: () => void
}

export function acquireInstanceLock(
  options: SetupOptions,
  logger: Logger,
  handleSecondInstanceDeepLink: (deepLinkUrl: string | undefined) => void
): LockResult {
  const platformHandler = getPlatformHandler()
  const protocols = options.protocols ?? []
  const logSecondInstanceError = (error: unknown) => {
    logger.error(`Error handling second instance: ${String(error)}`)
  }

  if (platformHandler.handleStartupEvents?.(options)) {
    logger.info('Handling platform startup event, app will quit')
    return {
      hasLock: false,
      cleanup: () => {},
    }
  }

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

  const secondInstanceHandler = (
    _event: Electron.Event,
    argv: string[],
    workingDirectory: string
  ) => {
    logger.debug(`Second instance launched with args: ${argv.join(' ')}`)

    const deepLinkUrl = platformHandler.extractDeepLinkFromArgs(argv, protocols)
    const context: SecondInstanceContext = {
      argv: [...argv],
      workingDirectory,
    }

    if (deepLinkUrl) {
      context.deepLinkUrl = deepLinkUrl
    }

    if (options.onSecondInstance) {
      try {
        void Promise.resolve(options.onSecondInstance(context)).catch(
          logSecondInstanceError
        )
      } catch (error) {
        logSecondInstanceError(error)
      }
    }

    handleSecondInstanceDeepLink(deepLinkUrl)
  }

  app.on('second-instance', secondInstanceHandler)

  return {
    hasLock: true,
    cleanup: () => {
      app.off('second-instance', secondInstanceHandler)
      app.releaseSingleInstanceLock()
    },
  }
}
