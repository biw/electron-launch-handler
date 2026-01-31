# electron-launch-handler

**Single instance enforcement and deep link handling for Electron apps.**

Ensure only one instance of your app runs at a time, and handle deep links
(`myapp://`) across macOS, Windows, and Linux.

## Features

- **Single Instance Lock** - Prevent multiple instances of your app
- **Deep Link Handling** - Register and handle custom URL protocols
- **Intent-Aware Context** - Distinguish app launch vs in-app deep link delivery
- **Cross-Platform** - Works on macOS (Intel + Apple Silicon), Windows, and Linux
- **Squirrel.Windows Support** - Handles install/update/uninstall events automatically

## Installation

```bash
npm install electron-launch-handler
# or
pnpm add electron-launch-handler
```

## Quick Start

```typescript
import { setupInstance } from 'electron-launch-handler'
import { app, BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

const instance = setupInstance({
  protocols: ['myapp'],
  onDeepLink: (url, context) => {
    if (!mainWindow) {
      mainWindow = new BrowserWindow({ width: 1200, height: 800 })
    }

    console.log('Deep link:', url)
    console.log('Intent:', context.intent)
  },
})

if (instance.shouldQuit) {
  app.quit()
} else {
  app.whenReady().then(() => {
    // Mark the app as ready to handle deep links
    instance.processPendingDeepLinks()
  })
}
```

## How It Works

1. The library acquires a single-instance lock.
2. Deep links are collected until you call `processPendingDeepLinks()`.
3. After that call, deep links are delivered directly to `onDeepLink`.

If another instance is launched and includes a deep link URL, the running instance
receives it via `onDeepLink`.

`onDeepLink` is only called when a deep link URL is present.

### Lock Failure Handling

If another instance is already running, the new process will have
`instance.shouldQuit === true`. You can also hook `onInstanceLockFailed`
to record telemetry or perform cleanup before exiting.

```typescript
const instance = setupInstance({
  protocols: ['myapp'],
  onInstanceLockFailed: () => {
    console.log('Another instance is already running')
  },
})

if (instance.shouldQuit) {
  app.quit()
}
```

## Deep Link Intent

`DeepLinkContext.intent` tells you why the deep link was delivered:

- `launch`: the app was launched by a deep link
- `open-url`: the app was already running when the deep link was received

```typescript
onDeepLink: (url, context) => {
  if (context.intent === 'launch') {
    // App launched by this URL
  } else {
    // URL received while app was running
  }
}
```

## Queueing Behavior (Important)

Deep links are queued until you call `processPendingDeepLinks()`:

```typescript
// Before processPendingDeepLinks():
// - Deep links are queued
// - onDeepLink is NOT called

instance.processPendingDeepLinks()

// After processPendingDeepLinks():
// - Queued deep links are dispatched to onDeepLink
// - Future deep links go directly to onDeepLink
```

You can also re-queue a deep link manually:

```typescript
onDeepLink: (url, context) => {
  if (!appIsReady) {
    instance.queueDeepLink(url, context.intent)
    return
  }
  handleDeepLink(url)
}
```

Note: if `processPendingDeepLinks()` has already been called, `queueDeepLink()`
will dispatch on the next tick rather than re-queue.

## Common Patterns

### Onboarding Flows

```typescript
let isOnboardingComplete = false

const instance = setupInstance({
  protocols: ['myapp'],
  onDeepLink: (url, context) => {
    if (!isOnboardingComplete) {
      instance.queueDeepLink(url, context.intent)
      return
    }
    handleDeepLink(url)
  },
})

app.whenReady().then(() => {
  // Run onboarding, then:
  isOnboardingComplete = true
  instance.processPendingDeepLinks()
})
```

### Development Protocols

```typescript
const isDev = !app.isPackaged

const instance = setupInstance({
  protocols: isDev ? ['myapp-dev'] : ['myapp'],
  onDeepLink: (url) => {
    console.log('Deep link received:', url)
  },
})
```

### Logging

Provide a logger to capture lifecycle events such as lock acquisition,
protocol registration, queueing, dispatch, and errors.

```typescript
import log from 'electron-log'

const instance = setupInstance({
  protocols: ['myapp'],
  onDeepLink: (url) => {
    // ...
  },
  logger: {
    debug: (msg) => log.debug(msg),
    info: (msg) => log.info(msg),
    error: (msg) => log.error(msg),
  },
})
```

## Platform-Specific Options

```typescript
const instance = setupInstance({
  protocols: ['myapp'],
  onDeepLink: (url) => {
    // ...
  },

  // Windows: Handle Squirrel.Windows installer events
  windows: {
    handleSquirrelEvents: true,
    squirrelOptions: {
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'My App',
    },
  },

  // Linux: Specify desktop file name
  linux: {
    desktopFileName: 'my-app',
  },
})
```

### Squirrel.Windows Notes

When `windows.handleSquirrelEvents` is enabled, the library handles
`--squirrel-*` events for install/update/uninstall:

- `--squirrel-install`: Creates shortcuts
- `--squirrel-updated`: Updates shortcuts
- `--squirrel-uninstall`: Removes shortcuts
- `--squirrel-obsolete`: Exits cleanly during version replacement

Use `windows.squirrelOptions` to control shortcut behavior.

## API Reference

### `setupInstance(options)`

Main entry point. Returns an `InstanceManager` object.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `protocols` | `string[]` | `[]` | Protocol schemes to register |
| `onDeepLink` | `DeepLinkHandler` | - | Called when a deep link is received. Can be async. |
| `onInstanceLockFailed` | `() => void` | - | Called when lock acquisition fails |
| `logger` | `Logger` | no-op | Logger instance |
| `windows` | `WindowsOptions` | - | Windows-specific options |
| `linux` | `LinuxOptions` | - | Linux-specific options |
| `macos` | `MacOSOptions` | - | macOS-specific options |

#### Returns: `InstanceManager`

| Property/Method | Type | Description |
|-----------------|------|-------------|
| `shouldQuit` | `boolean` | Whether this instance should quit |
| `processPendingDeepLinks()` | `() => void` | Process queued deep links and mark handler as ready |
| `getPendingDeepLinks()` | `() => string[]` | Get pending deep links without processing |
| `clearPendingDeepLinks()` | `() => void` | Clear pending deep links without processing |
| `queueDeepLink(url)` | `(url: string, intent?: DeepLinkIntent) => void` | Queue a deep link for later processing |
| `unregisterProtocols()` | `() => void` | Unregister protocol handlers (typically only needed for testing) |

#### `DeepLinkContext`

| Property | Type | Description |
|----------|------|-------------|
| `url` | `string` | Original URL string |
| `parsed` | `URL` | Parsed URL object |
| `protocol` | `string` | Protocol without `://` |
| `path` | `string` | URL path |
| `params` | `URLSearchParams` | Query parameters |
| `intent` | `'launch' \| 'open-url'` | Why the deep link was delivered |

### `parseDeepLink(url)`

Parse a deep link URL manually.

```typescript
import { parseDeepLink } from 'electron-launch-handler'

const result = parseDeepLink('myapp://open/document?id=123')
// {
//   url: 'myapp://open/document?id=123',
//   parsed: URL { ... },
//   protocol: 'myapp',
//   host: 'open',
//   path: '/document',
//   params: URLSearchParams { 'id' => '123' },
//   hash: ''
// }
```

## Platform Notes

### macOS

- Deep links arrive via the `open-url` app event
- Protocol registration uses `app.setAsDefaultProtocolClient()`
- Works with both Intel and Apple Silicon

### Windows

- Deep links arrive via command-line arguments
- Protocol registration uses `app.setAsDefaultProtocolClient()`
- **Squirrel.Windows Support**: Installer events are handled automatically
- This library handles URL protocols, not OS-level file associations

### Linux

- Deep links arrive via command-line arguments
- Protocol registration may require a `.desktop` file
- Behavior varies by desktop environment

## Security

When handling deep links, validate and sanitize URL inputs before acting on them.

- **Never execute arbitrary code** from deep link URLs
- **Validate URL schemes** before processing
- **Sanitize user input** from URL parameters
- **Use HTTPS** for OAuth callbacks when possible

## License

MIT
