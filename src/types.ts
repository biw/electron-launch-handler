/**
 * Intent of the deep link
 */
export type DeepLinkIntent = 'launch' | 'open-url'

/**
 * Context provided when a deep link is received
 */
export interface DeepLinkContext {
  /** Original URL string */
  url: string
  /** Parsed URL object */
  parsed: URL
  /** Protocol without :// */
  protocol: string
  /** URL path */
  path: string
  /** Query parameters */
  params: URLSearchParams
  /**
   * Why this deep link was delivered:
   * - 'launch': App was launched by the deep link
   * - 'open-url': App was already running when the deep link was received
   */
  intent: DeepLinkIntent
}

/**
 * Handler function for deep links.
 * Can be synchronous or asynchronous - async handlers will be awaited.
 */
export type DeepLinkHandler = (
  url: string,
  context: DeepLinkContext
) => void | Promise<void>

/**
 * Logger interface for debug output
 */
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
 * Main configuration options for setupInstance
 */
export interface SetupOptions {
  /** Protocol schemes to register */
  protocols?: string[]

  /** Called when a deep link is received */
  onDeepLink?: DeepLinkHandler

  /** Called when lock acquisition fails */
  onInstanceLockFailed?: () => void

  /** Logger instance */
  logger?: Logger

  /** Platform-specific options */
  windows?: WindowsOptions
  linux?: LinuxOptions
  macos?: MacOSOptions
}

/**
 * Return value from setupInstance
 */
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
   * Unregister all protocol handlers.
   * Typically only needed for testing or cleanup scenarios.
   */
  unregisterProtocols: () => void
}

/**
 * Platform-specific handler interface
 */
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

/**
 * Result of parsing a deep link URL
 */
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
