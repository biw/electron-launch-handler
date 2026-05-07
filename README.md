# electron-launch-handler

[![CI](https://badgen.net/github/checks/biw/electron-launch-handler)](https://github.com/biw/electron-launch-handler/actions)
[![npm version](https://badgen.net/npm/v/electron-launch-handler)](https://www.npmjs.com/package/electron-launch-handler)
[![npm downloads](https://badgen.net/npm/dt/electron-launch-handler)](https://www.npmjs.com/package/electron-launch-handler)

**Single-instance and deep-link plumbing for Electron apps.**

Electron gives you deep links through different paths depending on the platform:
`open-url` on macOS, command-line arguments on Windows and Linux, and
`second-instance` when the app is already running. This package normalizes that
startup path so your app code can handle URLs and relaunches from one place.

## What It Handles

- Single-instance lock acquisition
- Custom protocol registration
- Launch-time and already-running deep links
- Plain relaunches without a deep link
- Readiness queues for startup, auth, onboarding, or workspace loading
- Squirrel.Windows installer events

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
    instance.processPendingDeepLinks()
  })
}
```

## How It Works

1. The library acquires a single-instance lock.
2. Deep links are collected until you call `processPendingDeepLinks()`.
3. Once processed, future deep links are delivered directly to `onDeepLink`.

When another instance launches with a deep link, the running app receives it via
`onDeepLink`. Relaunches without a deep link go to `onSecondInstance` instead.

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

## Readiness

Deep links are queued until your app opts in to handling them:

```typescript
app.whenReady().then(() => {
  instance.processPendingDeepLinks()
})
```

Use `queueDeepLink(url)` for URLs your own code receives before that point.
After readiness, return `{ action: 'defer' }` from `onDeepLink` when the URL is
valid but another app condition is not ready yet. Deferred links are held until
`processDeferredDeepLinks()`.

## Common Patterns

### Onboarding Flows

```typescript
let isOnboardingComplete = false

const instance = setupInstance({
  protocols: ['myapp'],
  onDeepLink: (url) => {
    if (!isOnboardingComplete) {
      return { action: 'defer' }
    }

    handleDeepLink(url)
  },
})

app.whenReady().then(() => {
  instance.processPendingDeepLinks()
})

const completeOnboarding = () => {
  isOnboardingComplete = true
  instance.processDeferredDeepLinks()
}
```

### Plain Relaunches

```typescript
setupInstance({
  protocols: ['myapp'],
  onDeepLink: handleDeepLink,
  onSecondInstance: ({ deepLinkUrl }) => {
    if (!deepLinkUrl) {
      focusMainWindow()
    }
  },
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
| `onDeepLink` | `DeepLinkHandler` | - | Called when a deep link is received. Can return a `DeepLinkDeferral`. |
| `onSecondInstance` | `SecondInstanceHandler` | - | Called when another instance launches |
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
| `deferDeepLink(url)` | `(url: string, intent?: DeepLinkIntent) => void` | Hold a deep link until `processDeferredDeepLinks()` |
| `processDeferredDeepLinks()` | `() => void` | Process deep links held by `deferDeepLink()` |
| `getDeferredDeepLinks()` | `() => string[]` | Get deferred deep links without processing |
| `clearDeferredDeepLinks()` | `() => void` | Clear deferred deep links without processing |
| `unregisterProtocols()` | `() => void` | Unregister protocol handlers (typically only needed for testing) |
| `dispose()` | `() => void` | Remove installed listeners and unregister protocols |

#### `DeepLinkContext`

| Property | Type | Description |
|----------|------|-------------|
| `url` | `string` | Original URL string |
| `parsed` | `URL` | Parsed URL object |
| `protocol` | `string` | Protocol without `://` |
| `host` | `string` | URL host |
| `path` | `string` | URL path |
| `params` | `URLSearchParams` | Query parameters |
| `hash` | `string` | URL hash/fragment |
| `intent` | `'launch' \| 'open-url'` | Why the deep link was delivered |

#### `DeepLinkDeferral`

Return `{ action: 'defer' }` from `onDeepLink` to redeliver the same URL on the
next `processDeferredDeepLinks()` call.

#### `SecondInstanceContext`

| Property | Type | Description |
|----------|------|-------------|
| `argv` | `string[]` | Command-line arguments from the second instance |
| `workingDirectory` | `string` | Working directory from the second instance |
| `deepLinkUrl` | `string \| undefined` | Deep link found in `argv`, if present |

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
