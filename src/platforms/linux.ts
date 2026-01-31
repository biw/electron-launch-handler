import { app } from 'electron'
import type { PlatformHandler, SetupOptions } from '../types.js'

/**
 * Create the Linux platform handler
 *
 * On Linux:
 * - Protocols are registered via app.setAsDefaultProtocolClient()
 * - This typically updates .desktop files and XDG mime handlers
 * - Deep links arrive via command line arguments
 * - Behavior varies by desktop environment (GNOME, KDE, etc.)
 */
export function createLinuxHandler(): PlatformHandler {
  return {
    /**
     * Register a protocol scheme on Linux
     * Uses app.setAsDefaultProtocolClient()
     *
     * Note: On Linux, this may require:
     * - A .desktop file with MimeType=x-scheme-handler/{scheme}
     * - The app to be installed (not run from a random location)
     * - xdg-utils to be available
     */
    registerProtocol(scheme: string, options: SetupOptions): boolean {
      if (app.isPackaged) {
        // In packaged mode, we might need to specify the desktop file name
        const desktopFileName = options.linux?.desktopFileName
        if (desktopFileName) {
          return app.setAsDefaultProtocolClient(scheme, undefined, [
            desktopFileName,
          ])
        }
        return app.setAsDefaultProtocolClient(scheme)
      }

      // Development mode: register with electron path and script args
      const execPath = process.execPath
      const args = process.argv.slice(1)

      // Remove any existing deep link from args
      const cleanArgs = args.filter((arg) => !arg.startsWith(`${scheme}://`))

      return app.setAsDefaultProtocolClient(scheme, execPath, cleanArgs)
    },

    /**
     * Unregister a protocol scheme on Linux
     */
    unregisterProtocol(scheme: string): boolean {
      return app.removeAsDefaultProtocolClient(scheme)
    },

    /**
     * Extract deep link URL from command line arguments
     * On Linux, deep links are passed as command line arguments
     */
    extractDeepLinkFromArgs(
      argv: string[],
      protocols: string[]
    ): string | undefined {
      // Check all args for a matching protocol URL
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
     * No special startup events on Linux
     */
    handleStartupEvents: undefined,
  }
}
