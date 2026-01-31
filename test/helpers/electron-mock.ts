import { vi } from 'vitest'

/**
 * Mock BrowserWindow for testing
 */
export function createMockBrowserWindow(
  overrides: Partial<MockBrowserWindowState> = {}
) {
  const state: MockBrowserWindowState = {
    destroyed: false,
    minimized: false,
    visible: true,
    focused: false,
    ...overrides,
  }

  return {
    isDestroyed: vi.fn(() => state.destroyed),
    isMinimized: vi.fn(() => state.minimized),
    isVisible: vi.fn(() => state.visible),
    isFocused: vi.fn(() => state.focused),
    restore: vi.fn(() => {
      state.minimized = false
    }),
    show: vi.fn(() => {
      state.visible = true
    }),
    focus: vi.fn(() => {
      state.focused = true
    }),
    hide: vi.fn(() => {
      state.visible = false
    }),
    minimize: vi.fn(() => {
      state.minimized = true
    }),
    destroy: vi.fn(() => {
      state.destroyed = true
    }),
    // Allow tests to manipulate state
    _state: state,
  }
}

export interface MockBrowserWindowState {
  destroyed: boolean
  minimized: boolean
  visible: boolean
  focused: boolean
}

export type MockBrowserWindow = ReturnType<typeof createMockBrowserWindow>

/**
 * Mock Electron app for testing
 */
export function createMockApp() {
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>()
  const registeredProtocols = new Set<string>()
  let singleInstanceLockHeld = false
  let secondInstanceCallback:
    | ((event: unknown, argv: string[], workingDirectory: string) => void)
    | null = null

  return {
    isPackaged: false,

    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set())
      }
      eventHandlers.get(event)!.add(handler)

      // Capture second-instance callback
      if (event === 'second-instance') {
        secondInstanceCallback = handler as typeof secondInstanceCallback
      }
    }),

    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const wrapper = (...args: unknown[]) => {
        eventHandlers.get(event)?.delete(wrapper)
        handler(...args)
      }
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set())
      }
      eventHandlers.get(event)!.add(wrapper)
    }),

    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers.get(event)?.delete(handler)
    }),

    emit: vi.fn((event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event)
      if (handlers) {
        for (const handler of handlers) {
          handler(...args)
        }
      }
    }),

    requestSingleInstanceLock: vi.fn(() => {
      if (singleInstanceLockHeld) {
        return false
      }
      singleInstanceLockHeld = true
      return true
    }),

    setAsDefaultProtocolClient: vi.fn((scheme: string) => {
      registeredProtocols.add(scheme)
      return true
    }),

    removeAsDefaultProtocolClient: vi.fn((scheme: string) => {
      registeredProtocols.delete(scheme)
      return true
    }),

    isDefaultProtocolClient: vi.fn((scheme: string) => {
      return registeredProtocols.has(scheme)
    }),

    quit: vi.fn(),

    whenReady: vi.fn(() => Promise.resolve()),

    // Test helpers
    _eventHandlers: eventHandlers,
    _registeredProtocols: registeredProtocols,
    _singleInstanceLockHeld: () => singleInstanceLockHeld,
    _resetSingleInstanceLock: () => {
      singleInstanceLockHeld = false
    },
    _simulateSecondInstance: (argv: string[], workingDirectory: string) => {
      if (secondInstanceCallback) {
        secondInstanceCallback({}, argv, workingDirectory)
      }
    },
    _simulateOpenUrl: (url: string) => {
      const handlers = eventHandlers.get('open-url')
      if (handlers) {
        const event = { preventDefault: vi.fn() }
        for (const handler of handlers) {
          handler(event, url)
        }
      }
    },
  }
}

export type MockApp = ReturnType<typeof createMockApp>

/**
 * Create a mock logger for testing
 */
export function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }
}

export type MockLogger = ReturnType<typeof createMockLogger>
