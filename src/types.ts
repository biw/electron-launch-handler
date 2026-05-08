/** Why a deep link was delivered. */
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
   * Why this deep link was delivered:
   * - 'launch': App was launched by the deep link
   * - 'open-url': App was already running when the deep link was received
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

export interface SetupOptions {
  /** Protocol schemes to register */
  protocols?: string[]

  /** Called when a deep link is received */
  onDeepLink?: DeepLinkHandler

  /** Called when another app instance is launched */
  onSecondInstance?: SecondInstanceHandler

  /** Called when lock acquisition fails */
  onInstanceLockFailed?: () => void

  /** Logger instance */
  logger?: Logger

  /** Platform-specific options */
  windows?: WindowsOptions
  linux?: LinuxOptions
  macos?: MacOSOptions
}

export interface InstanceManager {
  /** Whether this instance should quit (lock failed) */
  shouldQuit: boolean

  /**
   * Process any pending deep links and mark the handler as "ready".
   *
   * **Important side effect**: After calling this method, future deep links
   * will be dispatched immediately to `onDeepLink` instead of being queued.
   * This is a one-time state transition that cannot be reversed.
   *
   * Call this after your app is ready to handle deep links (e.g., after
   * window creation or after onboarding completes).
   */
  processPendingDeepLinks: () => void

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
   * Note: If `processPendingDeepLinks()` has already been called, the URL
   * will be dispatched on the next tick instead of being queued.
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

  /** Process deep links held by `deferDeepLink()` */
  processDeferredDeepLinks: () => void

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
  registerProtocol: (scheme: string, options: SetupOptions) => boolean
  /** Unregister a protocol scheme */
  unregisterProtocol: (scheme: string) => boolean
  /** Extract deep link URL from command line arguments */
  extractDeepLinkFromArgs: (
    argv: string[],
    protocols: string[]
  ) => string | undefined
  /** Handle platform-specific startup events (returns true if app should quit) */
  handleStartupEvents?: (options: SetupOptions) => boolean
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
