/** How a deep link was delivered. */
export type DeepLinkIntent = 'launch' | 'open-url'

export interface DeepLinkContext {
  /** Original URL string */
  url: string
  /** Parsed WHATWG URL object */
  parsed: URL
  /** Protocol without the trailing colon */
  protocol: string
  /** URL host */
  host: string
  /** URL path */
  path: string
  /** Query parameters */
  params: URLSearchParams
  /** URL hash/fragment */
  hash: string
  /**
   * How this deep link was delivered:
   * - 'launch': Found in this process's startup arguments
   * - 'open-url': Received from an Electron runtime event
   *
   * macOS protocol links arrive through Electron's `open-url` event even when
   * they start the process. Electron does not expose enough information to
   * infer causality from that event.
   */
  intent: DeepLinkIntent
}

/**
 * Return this from `onDeepLink` when the URL is valid but the app cannot act on
 * it yet. The URL is delivered again on `processDeferredDeepLinks()`.
 */
export interface DeepLinkDeferral {
  action: 'defer'
}

export type DeepLinkHandlerResult = DeepLinkDeferral | void

/**
 * Handler function for deep links.
 * Can be synchronous or asynchronous - async handlers will be awaited.
 */
export type DeepLinkHandler = (
  url: string,
  context: DeepLinkContext
) => DeepLinkHandlerResult | Promise<DeepLinkHandlerResult>

export interface SecondInstanceContext {
  /** Command-line arguments from the second instance */
  argv: string[]
  /** Working directory from the second instance */
  workingDirectory: string
  /** Deep link URL found in argv, if the relaunch included one */
  deepLinkUrl?: string
}

/**
 * Handler function for second-instance launches.
 * Called for both plain relaunches and relaunches that include a deep link.
 */
export type SecondInstanceHandler = (
  context: SecondInstanceContext
) => void | Promise<void>

export interface Logger {
  debug: (message: string) => void
  info: (message: string) => void
  error: (message: string) => void
}

/**
 * Squirrel.Windows shortcut options
 */
export interface SquirrelOptions {
  /** Create desktop shortcut on install (default: true) */
  createDesktopShortcut?: boolean
  /** Create start menu shortcut on install (default: true) */
  createStartMenuShortcut?: boolean
  /** Custom shortcut name (default: app.name) */
  shortcutName?: string
}

/**
 * Windows-specific options
 */
export interface WindowsOptions {
  /** Handle --squirrel-* installer events (default: true) */
  handleSquirrelEvents?: boolean
  /** Squirrel shortcut options */
  squirrelOptions?: SquirrelOptions
}

/**
 * Linux-specific options
 */
export interface LinuxOptions {
  /** Desktop file name for .desktop file registration */
  desktopFileName?: string
}

/**
 * macOS-specific options
 *
 * Note: This interface exists for API consistency across platforms.
 * macOS-specific features may be added in future versions.
 */
export interface MacOSOptions {
  // Placeholder for future macOS-specific options
}

/**
 * How the single-instance lock is obtained.
 *
 * - `'auto'` (default): the library calls `app.requestSingleInstanceLock()`
 *   itself and releases it on `dispose()`.
 * - `'external'`: the caller already acquired the lock (typically at the very
 *   top of the main entry point, before any expensive bootstrap work). The
 *   library installs the `'second-instance'` listener but never acquires or
 *   releases the lock.
 * - `'disabled'`: no lock is taken and no `'second-instance'` listener is
 *   installed. Deep links still work.
 */
export type SingleInstanceLockMode = 'auto' | 'external' | 'disabled'

/**
 * The application callbacks the library dispatches into.
 *
 * These are separated from {@link CreateInstanceOptions} so they can be
 * supplied later via `configure()`, once the app has bootstrapped far enough
 * to build them. Second-instance events received before
 * `onSecondInstance` is supplied are replayed when it is configured, or
 * discarded when pending deep-link processing begins without one.
 */
export interface InstanceHandlers {
  /** Called when a deep link is received */
  onDeepLink?: DeepLinkHandler | undefined

  /** Called when another app instance is launched */
  onSecondInstance?: SecondInstanceHandler | undefined
}

/**
 * Options for `createInstance()`.
 *
 * Everything here is known at process start, before the app has bootstrapped.
 */
export interface CreateInstanceOptions {
  /** Protocol schemes to register */
  protocols?: string[]

  /** Called when lock acquisition fails */
  onInstanceLockFailed?: () => void

  /** Logger instance */
  logger?: Logger

  /** How the single-instance lock is obtained (default: `'auto'`) */
  singleInstanceLock?: SingleInstanceLockMode

  /** Platform-specific options */
  windows?: WindowsOptions
  linux?: LinuxOptions
  macos?: MacOSOptions
}

/**
 * Options for `setupInstance()` — creation options plus the handlers, supplied
 * together in a single call.
 */
export interface SetupOptions extends CreateInstanceOptions, InstanceHandlers {}

export interface InstanceManager {
  /** Whether this instance should quit (lock failed) */
  shouldQuit: boolean

  /**
   * Supply or replace the application handlers.
   *
   * Call this once your app has bootstrapped far enough to build them. Deep
   * links that arrive beforehand stay queued, so it is safe to call
   * `createInstance()` on the first line of your main entry point and
   * `configure()` much later.
   *
   * Only the keys present on `handlers` are updated, so you can set
   * `onDeepLink` and `onSecondInstance` from different places before calling
   * `processPendingDeepLinks()`. Explicitly setting `onSecondInstance` to
   * `undefined` discards buffered relaunch callbacks and opts out of buffering
   * future ones.
   */
  configure: (handlers: InstanceHandlers) => void

  /**
   * Process any pending deep links and mark the handler as "ready".
   *
   * **Important side effect**: After calling this method, future deep links
   * will be dispatched immediately to `onDeepLink` instead of being queued.
   * This is a one-time state transition that cannot be reversed.
   *
   * Call this after your app is ready to handle deep links (e.g., after
   * window creation or after onboarding completes).
   *
   * The returned promise resolves once every dispatched handler has settled,
   * so you can await it before revealing a window. This always transitions the
   * queue to processed. If no `onDeepLink` handler exists, queued links are
   * discarded and future links are not retained.
   */
  processPendingDeepLinks: () => Promise<void>

  /** Get pending deep links without processing */
  getPendingDeepLinks: () => string[]

  /** Clear pending deep links */
  clearPendingDeepLinks: () => void

  /**
   * Manually queue a deep link URL for later processing.
   * Useful when your app receives a deep link but isn't ready to handle it
   * (e.g., window doesn't exist, user is mid-onboarding).
   * Pass `intent` to preserve the original context intent when re-queuing.
   *
   * Note: If `processPendingDeepLinks()` has already been called, the URL is
   * dispatched asynchronously behind any in-flight handler rather than being
   * queued.
   */
  queueDeepLink: (url: string, intent?: DeepLinkIntent) => void

  /**
   * Hold a deep link until app-specific state is ready.
   *
   * Unlike `queueDeepLink()`, this always holds the URL for a future explicit
   * `processDeferredDeepLinks()` call, even after pending deep links have been
   * processed. This is useful for onboarding, auth, or workspace-loading flows.
   */
  deferDeepLink: (url: string, intent?: DeepLinkIntent) => void

  /**
   * Process deep links held by `deferDeepLink()`.
   *
   * The returned promise resolves once every dispatched handler has settled.
   * If called by an active `onDeepLink` handler, processing is scheduled behind
   * that handler and the promise resolves immediately to avoid a re-entrant
   * deadlock.
   */
  processDeferredDeepLinks: () => Promise<void>

  /** Get deferred deep links without processing */
  getDeferredDeepLinks: () => string[]

  /** Clear deferred deep links without processing */
  clearDeferredDeepLinks: () => void

  /**
   * Unregister all protocol handlers.
   * Typically only needed for testing or cleanup scenarios.
   */
  unregisterProtocols: () => void

  /**
   * Remove listeners installed by the library and unregister protocols.
   * Typically only needed for tests, hot reload, or explicit teardown.
   */
  dispose: () => void
}

export interface PlatformHandler {
  /** Register a protocol scheme */
  registerProtocol: (scheme: string, options: CreateInstanceOptions) => boolean
  /** Unregister a protocol scheme */
  unregisterProtocol: (scheme: string) => boolean
  /** Extract deep link URL from command line arguments */
  extractDeepLinkFromArgs: (
    argv: string[],
    protocols: string[]
  ) => string | undefined
  /** Handle platform-specific startup events (returns true if app should quit) */
  handleStartupEvents?: (options: CreateInstanceOptions) => boolean
}

export interface ParsedDeepLink {
  /** Original URL string */
  url: string
  /** Parsed URL object */
  parsed: URL
  /** Protocol without :// */
  protocol: string
  /** URL host */
  host: string
  /** URL path */
  path: string
  /** Query parameters */
  params: URLSearchParams
  /** URL hash/fragment */
  hash: string
}
