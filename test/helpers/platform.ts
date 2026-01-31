/**
 * Platform detection utilities for tests
 */

export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function isLinux(): boolean {
  return process.platform === 'linux'
}

export function getPlatformName(): string {
  switch (process.platform) {
    case 'darwin':
      return 'macOS'
    case 'win32':
      return 'Windows'
    case 'linux':
      return 'Linux'
    default:
      return process.platform
  }
}

/**
 * Skip test if not on the specified platform
 */
export function skipIfNotPlatform(platform: 'darwin' | 'win32' | 'linux') {
  if (process.platform !== platform) {
    return true
  }
  return false
}

/**
 * Get the expected executable path format for the current platform
 */
export function getExpectedExePath(): string {
  if (isWindows()) {
    return process.execPath.replace(/\\/g, '/')
  }
  return process.execPath
}
