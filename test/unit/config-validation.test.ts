import { describe, it, expect } from 'vitest'
import type { SetupOptions } from '../../src/types.js'
import { getProtocolSchemes } from '../../src/protocol-registry.js'

describe('Protocol Configuration', () => {
  describe('getProtocolSchemes', () => {
    it('should handle undefined protocols', () => {
      expect(getProtocolSchemes(undefined)).toEqual([])
    })

    it('should handle empty array', () => {
      expect(getProtocolSchemes([])).toEqual([])
    })

    it('should extract schemes from string array', () => {
      const schemes = getProtocolSchemes(['myapp', 'myapp-dev'])

      expect(schemes).toEqual(['myapp', 'myapp-dev'])
    })
  })
})

describe('SetupOptions Type', () => {
  it('should accept minimal configuration', () => {
    const options: SetupOptions = {}

    expect(options).toBeDefined()
    expect(options.protocols).toBeUndefined()
  })

  it('should accept full configuration', () => {
    const options: SetupOptions = {
      protocols: ['myapp'],
      onDeepLink: () => {},
      onInstanceLockFailed: () => {},
      logger: {
        debug: () => {},
        info: () => {},
        error: () => {},
      },
      windows: {
        handleSquirrelEvents: true,
      },
      linux: {
        desktopFileName: 'my-app',
      },
      macos: {},
    }

    expect(options).toBeDefined()
    expect(options.protocols).toEqual(['myapp'])
  })
})
