import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import path from 'path'
import { app } from 'electron'
import type {
  PlatformHandler,
  SetupOptions,
  SquirrelOptions,
} from '../types.js'

/**
 * Squirrel.Windows event types
 */
type SquirrelEvent =
  | '--squirrel-install'
  | '--squirrel-updated'
  | '--squirrel-uninstall'
  | '--squirrel-obsolete'
  | '--squirrel-firstrun'

/**
 * Check if a Squirrel event is present in command line args
 */
export function getSquirrelEvent(argv: string[]): SquirrelEvent | undefined {
  const squirrelEvents: SquirrelEvent[] = [
    '--squirrel-install',
    '--squirrel-updated',
    '--squirrel-uninstall',
    '--squirrel-obsolete',
    '--squirrel-firstrun',
  ]

  for (const arg of argv) {
    if (squirrelEvents.includes(arg as SquirrelEvent)) {
      return arg as SquirrelEvent
    }
  }

  return undefined
}

/**
 * Get the path to Squirrel's Update.exe
 */
export function getUpdateExePath(): string {
  return path.resolve(path.dirname(process.execPath), '..', 'Update.exe')
}

/**
 * Get the target executable name (used for shortcut creation)
 */
export function getTargetExeName(): string {
  return path.basename(process.execPath)
}

/**
 * Check if the desktop shortcut exists
 */
export function desktopShortcutExists(shortcutName: string): boolean {
  const shortcutPath = path.join(homedir(), 'Desktop', `${shortcutName}.lnk`)
  return existsSync(shortcutPath)
}

/**
 * Run a Squirrel Update.exe command
 */
function runSquirrelCommand(args: string[], done: () => void): void {
  const updateExe = getUpdateExePath()

  spawn(updateExe, args, { detached: true }).on('close', done)
}

/**
 * Build the shortcut arguments for Update.exe
 */
export function buildShortcutArgs(
  action: 'create' | 'remove',
  target: string,
  options?: SquirrelOptions
): string[] {
  const args: string[] = []

  if (action === 'create') {
    // Default to creating both shortcuts unless explicitly disabled
    const createDesktop = options?.createDesktopShortcut !== false
    const createStartMenu = options?.createStartMenuShortcut !== false

    if (createDesktop && createStartMenu) {
      // Default behavior: create both
      args.push(`--createShortcut=${target}`)
    } else if (createDesktop) {
      args.push(`--createShortcut=${target}`, '--shortcut-locations=Desktop')
    } else if (createStartMenu) {
      args.push(`--createShortcut=${target}`, '--shortcut-locations=StartMenu')
    }
    // If both are false, no args (no shortcuts created)
  } else {
    args.push(`--removeShortcut=${target}`)
  }

  return args
}

/**
 * Create the Windows platform handler
 *
 * On Windows:
 * - Protocols are registered via app.setAsDefaultProtocolClient()
 * - Deep links arrive via command line arguments
 * - Squirrel.Windows installer events need special handling
 */
export function createWindowsHandler(): PlatformHandler {
  return {
    /**
     * Register a protocol scheme on Windows
     * Uses app.setAsDefaultProtocolClient()
     */
    registerProtocol(scheme: string, _options: SetupOptions): boolean {
      if (app.isPackaged) {
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
     * Unregister a protocol scheme on Windows
     */
    unregisterProtocol(scheme: string): boolean {
      return app.removeAsDefaultProtocolClient(scheme)
    },

    /**
     * Extract deep link URL from command line arguments
     * On Windows, deep links are passed as command line arguments
     */
    extractDeepLinkFromArgs(
      argv: string[],
      protocols: string[]
    ): string | undefined {
      // On Windows, the deep link URL is typically the last argument
      // Check all args in reverse order (most likely at the end)
      for (let i = argv.length - 1; i >= 0; i--) {
        const arg = argv[i]
        for (const protocol of protocols) {
          if (arg.startsWith(`${protocol}://`)) {
            return arg
          }
        }
      }
      return undefined
    },

    /**
     * Handle Squirrel.Windows installer events
     * Returns true if the app should quit
     */
    handleStartupEvents(options: SetupOptions): boolean {
      // Check if Squirrel handling is disabled
      if (options.windows?.handleSquirrelEvents === false) {
        return false
      }

      const squirrelEvent = getSquirrelEvent(process.argv)

      if (!squirrelEvent) {
        return false
      }

      const target = getTargetExeName()
      const squirrelOptions = options.windows?.squirrelOptions
      const shortcutName = squirrelOptions?.shortcutName ?? app.name

      switch (squirrelEvent) {
        case '--squirrel-install': {
          // Create shortcuts on install
          const args = buildShortcutArgs('create', target, squirrelOptions)
          if (args.length > 0) {
            runSquirrelCommand(args, () => app.quit())
          } else {
            app.quit()
          }
          return true
        }

        case '--squirrel-updated': {
          // Only recreate shortcuts on update if they already exist
          if (desktopShortcutExists(shortcutName)) {
            const args = buildShortcutArgs('create', target, squirrelOptions)
            if (args.length > 0) {
              runSquirrelCommand(args, () => app.quit())
            } else {
              app.quit()
            }
          } else {
            app.quit()
          }
          return true
        }

        case '--squirrel-uninstall': {
          // Remove shortcuts on uninstall
          const args = buildShortcutArgs('remove', target, squirrelOptions)
          runSquirrelCommand(args, () => app.quit())
          return true
        }

        case '--squirrel-obsolete':
          // Called on the old version being replaced
          app.quit()
          return true

        case '--squirrel-firstrun':
          // First run after install - don't quit, just continue
          return false

        default:
          return false
      }
    },
  }
}
