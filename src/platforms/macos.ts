import { app } from 'electron'
import type { PlatformHandler, SetupOptions } from '../types.js'

/**
 * Create the macOS platform handler
 *
 * On macOS:
 * - Protocols are registered via app.setAsDefaultProtocolClient()
 * - Deep links arrive via the 'open-url' app event
 * - No special startup events to handle
 */
export function createMacOSHandler(): PlatformHandler {
  return {
    /**
     * Register a protocol scheme on macOS
     * Uses app.setAsDefaultProtocolClient()
     */
    registerProtocol(scheme: string, _options: SetupOptions): boolean {
      // In development, we need to pass the path to the script
      // In production, the app is bundled and this isn't needed
      if (app.isPackaged) {
        return app.setAsDefaultProtocolClient(scheme)
      }

      // Development mode: need to pass electron path and script
      // The first arg is the path to electron, subsequent args are passed to the app
      const execPath = process.execPath
      const args = process.argv.slice(1)

      // Remove any existing deep link from args (e.g., if launched via protocol)
      const cleanArgs = args.filter((arg) => !arg.startsWith(`${scheme}://`))

      return app.setAsDefaultProtocolClient(scheme, execPath, cleanArgs)
    },

    /**
     * Unregister a protocol scheme on macOS
     */
    unregisterProtocol(scheme: string): boolean {
      return app.removeAsDefaultProtocolClient(scheme)
    },

    /**
     * Extract deep link URL from command line arguments
     * On macOS, deep links typically come via the 'open-url' event,
     * not command line args. However, check args as fallback.
     */
    extractDeepLinkFromArgs(
      argv: string[],
      protocols: string[]
    ): string | undefined {
      // Look for any argument that matches a registered protocol
      for (const arg of argv) {
        for (const protocol of protocols) {
          if (arg.startsWith(`${protocol}://`)) {
            return arg
          }
        }
      }
      return undefined
    },

    /**
     * No special startup events on macOS
     */
    handleStartupEvents: undefined,
  }
}
