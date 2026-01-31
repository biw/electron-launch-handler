import type { PlatformHandler } from '../types.js'
import { createMacOSHandler } from './macos.js'
import { createWindowsHandler } from './windows.js'
import { createLinuxHandler } from './linux.js'

/**
 * Get the platform handler for the current operating system
 */
export function getPlatformHandler(): PlatformHandler {
  switch (process.platform) {
    case 'darwin':
      return createMacOSHandler()
    case 'win32':
      return createWindowsHandler()
    case 'linux':
      return createLinuxHandler()
    default:
      // Fallback to Linux-like behavior for unknown platforms
      return createLinuxHandler()
  }
}

/**
 * Check if the current platform is macOS
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

/**
 * Check if the current platform is Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * Check if the current platform is Linux
 */
export function isLinux(): boolean {
  return process.platform === 'linux'
}

export { createMacOSHandler } from './macos.js'
export { createWindowsHandler } from './windows.js'
export { createLinuxHandler } from './linux.js'
