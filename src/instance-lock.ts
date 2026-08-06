import { app } from 'electron'
import type {
  CreateInstanceOptions,
  InstanceHandlers,
  Logger,
  SecondInstanceContext,
} from './types.js'
import { getPlatformHandler } from './platforms/index.js'

export interface LockResult {
  hasLock: boolean
  finishSecondInstanceBuffering: () => void
  cleanup: () => void
}

export function acquireInstanceLock(
  options: CreateInstanceOptions,
  handlers: InstanceHandlers,
  logger: Logger,
  handleSecondInstanceDeepLink: (deepLinkUrl: string | undefined) => void
): LockResult {
  const platformHandler = getPlatformHandler()
  const protocols = options.protocols ?? []
  const lockMode = options.singleInstanceLock ?? 'auto'
  const pendingSecondInstances: SecondInstanceContext[] = []
  let secondInstanceBuffering = true
  const logSecondInstanceError = (error: unknown) => {
    logger.error(`Error handling second instance: ${String(error)}`)
  }
  const invokeSecondInstanceHandler = (context: SecondInstanceContext) => {
    const handler = handlers.onSecondInstance

    if (handler) {
      try {
        void Promise.resolve(handler(context)).catch(logSecondInstanceError)
      } catch (error) {
        logSecondInstanceError(error)
      }
    }
  }
  const flushPendingSecondInstances = () => {
    const pending = pendingSecondInstances.splice(0)
    for (const context of pending) {
      invokeSecondInstanceHandler(context)
    }
  }
  const finishSecondInstanceBuffering = () => {
    secondInstanceBuffering = false
    flushPendingSecondInstances()
  }

  if (platformHandler.handleStartupEvents?.(options)) {
    logger.info('Handling platform startup event, app will quit')
    return {
      hasLock: false,
      finishSecondInstanceBuffering: () => {},
      cleanup: () => {},
    }
  }

  if (lockMode === 'disabled') {
    // Electron only emits 'second-instance' to the lock holder, so without a
    // lock there is nothing to listen for.
    logger.info('Single instance lock disabled')
    return {
      hasLock: true,
      finishSecondInstanceBuffering: () => {},
      cleanup: () => {},
    }
  }

  if (lockMode === 'external') {
    logger.info('Using externally acquired single instance lock')
  } else if (app.requestSingleInstanceLock()) {
    logger.info('Acquired single instance lock')
  } else {
    logger.info('Another instance is already running')
    options.onInstanceLockFailed?.()
    return {
      hasLock: false,
      finishSecondInstanceBuffering: () => {},
      cleanup: () => {},
    }
  }

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

    if (secondInstanceBuffering) {
      pendingSecondInstances.push(context)
      // The deep-link queue is still pending while second-instance buffering is
      // active. Queue the URL now for observability, but defer dispatch until
      // processPendingDeepLinks(), after any buffered second-instance callback
      // has been replayed.
      handleSecondInstanceDeepLink(deepLinkUrl)
      return
    }

    // Preserve the live-path ordering: onSecondInstance is invoked first, then
    // the paired deep link enters the serialized deep-link pipeline.
    invokeSecondInstanceHandler(context)
    handleSecondInstanceDeepLink(deepLinkUrl)
  }

  app.on('second-instance', secondInstanceHandler)

  return {
    hasLock: true,
    finishSecondInstanceBuffering,
    cleanup: () => {
      app.off('second-instance', secondInstanceHandler)
      pendingSecondInstances.length = 0

      // Never release a lock we did not take — the caller still owns it.
      if (lockMode === 'auto') {
        app.releaseSingleInstanceLock()
      }
    },
  }
}
