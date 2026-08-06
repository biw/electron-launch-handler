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
- Staged startup, where handlers only exist after the app has bootstrapped
- Squirrel.Windows installer events

## Installation

```bash
npm install electron-launch-handler
# or
pnpm add electron-launch-handler
```

Requires Node.js 24 or newer and Electron 41 or newer.

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
  app.whenReady().then(async () => {
    await instance.processPendingDeepLinks()
  })
}
```

Call `setupInstance()` at module scope, as above. If your handlers are not
available that early, use [`createInstance()`](#staged-startup) instead.

## How It Works

1. The library acquires a single-instance lock.
2. Deep links are collected until you call `processPendingDeepLinks()`.
3. Once processed, future deep links are delivered directly to `onDeepLink`.

When another instance launches with a deep link, the running app receives it via
`onDeepLink`. Relaunches without a deep link go to `onSecondInstance` instead.

## Staged Startup

`setupInstance()` assumes you can build your handlers immediately. Many real
apps cannot — the deep-link handler needs a window manager, a database, or a
signed-in user, none of which exist on the first line of `main`.

Waiting and calling `setupInstance()` later is the wrong fix. On macOS a cold
launch fires `open-url` **before** `app.whenReady()`, so a late `setupInstance()`
never sees the URL that started the app.

Use `createInstance()` + `configure()` instead. `createInstance()` takes the
lock and installs the listeners right away; `configure()` supplies the handlers
whenever you have them. Anything that arrives in between is queued.

```typescript
import { createInstance } from 'electron-launch-handler'
import { app } from 'electron'

// First line of main: listeners are live from here on.
const instance = createInstance({ protocols: ['myapp'] })

if (instance.shouldQuit) {
  app.quit()
  process.exit(0)
}

app.whenReady().then(async () => {
  const windowManager = await bootstrapApp() // migrations, auth, windows...

  instance.configure({
    onDeepLink: (url, context) => windowManager.open(url, context),
    onSecondInstance: ({ deepLinkUrl }) => {
      if (!deepLinkUrl) {
        windowManager.focus()
      }
    },
  })

  // Resolves once every queued link has been handled.
  await instance.processPendingDeepLinks()
  windowManager.reveal()
})
```

`configure()` only replaces the keys you pass, so `onDeepLink` and
`onSecondInstance` can be set from different places. Second-instance events
received before `onSecondInstance` exists are replayed when it is configured,
as long as that happens before `processPendingDeepLinks()`. Processing ends the
startup buffering window; without an `onSecondInstance` handler, buffered plain
relaunch callbacks are discarded while their deep links still flow through the
deep-link queue. Set `onSecondInstance: undefined` explicitly to opt out sooner.

`processPendingDeepLinks()` is the readiness boundary and always marks the
deep-link queue as processed. Configure `onDeepLink` before calling it if links
should be delivered. When no handler exists, queued links are discarded and
future links are not retained; this keeps apps that intentionally use only
`onSecondInstance` stable.

## Awaiting Dispatch

`processPendingDeepLinks()` and `processDeferredDeepLinks()` return promises
that resolve once every handler they dispatched has settled, including handlers
that queued more work while running. Await them when the next step depends on
the deep link having been applied — showing a window, for example.

There is one necessary re-entrant exception: when an active `onDeepLink`
handler calls `processDeferredDeepLinks()`, the deferred work is queued behind
that handler and the returned promise resolves once it is scheduled. Waiting
for the queued work from inside the handler would deadlock; it cannot start
until the current handler returns.

All dispatch runs through a single serialized chain, so handlers never overlap.
A deep link that arrives while the queue is draining lines up behind it instead
of racing it.

## Bring Your Own Lock

Apps that do expensive work before `whenReady()` usually want the single-instance
lock at the very top of `main`, before that work starts. Take it yourself and
tell the library with `singleInstanceLock: 'external'`:

```typescript
import { createInstance } from 'electron-launch-handler'
import { app } from 'electron'

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
  process.exit(0)
}

const instance = createInstance({
  protocols: ['myapp'],
  singleInstanceLock: 'external',
})

// The lock and listeners are now live, so relaunches during migrations queue.
await runDatabaseMigrations()
```

In `'external'` mode the library still installs the `'second-instance'`
listener, but never acquires the lock and never releases it on `dispose()` —
the lock stays yours. Use `'disabled'` to skip single-instance behavior
entirely and use the library only for deep links.

## Lock Failure Handling

In the default `'auto'` mode, if another instance is already running, the new
process will have `instance.shouldQuit === true`. You can also hook
`onInstanceLockFailed` to record telemetry or perform cleanup before exiting.
In `'external'` mode, handle failure when you acquire the lock yourself;
`'disabled'` mode never attempts lock acquisition.

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

`DeepLinkContext.intent` tells you how the deep link was delivered:

- `launch`: the URL was found in this process's startup arguments
- `open-url`: the URL arrived through an Electron runtime event (`open-url` or
  `second-instance`)

```typescript
onDeepLink: (url, context) => {
  if (context.intent === 'launch') {
    // URL found in this process's startup arguments
  } else {
    // URL delivered by an Electron event
  }
}
```

Electron exposes different delivery mechanisms across platforms:

| Delivery mechanism | macOS | Windows / Linux | Intent |
|--------------------|-------|-----------------|--------|
| URL in this process's startup arguments | Uncommon/manual | Normal cold-start path | `launch` |
| Electron runtime event | `open-url` | `second-instance` | `open-url` |

On macOS, `open-url` can fire before the app is ready, but Electron does not say
whether that event started the process. `app.isReady()` describes lifecycle
state, not causality: a normally started app can also receive one or more URLs
during slow startup. Native macOS protocol events are therefore reported as
`open-url` regardless of readiness.

The library must still be installed before `app.whenReady()` — see
[Staged Startup](#staged-startup). If you construct it later, macOS may already
have delivered the `open-url` event and the link is lost.

## Readiness

Deep links are queued until your app opts in to handling them:

```typescript
app.whenReady().then(async () => {
  await instance.processPendingDeepLinks()
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

app.whenReady().then(async () => {
  await instance.processPendingDeepLinks()
})

const completeOnboarding = async () => {
  isOnboardingComplete = true
  await instance.processDeferredDeepLinks()
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
| `singleInstanceLock` | `SingleInstanceLockMode` | `'auto'` | How the lock is obtained. See below. |
| `logger` | `Logger` | no-op | Logger instance |
| `windows` | `WindowsOptions` | - | Windows-specific options |
| `linux` | `LinuxOptions` | - | Linux-specific options |
| `macos` | `MacOSOptions` | - | macOS-specific options |

#### `SingleInstanceLockMode`

| Value | Behavior |
|-------|----------|
| `'auto'` | The library calls `app.requestSingleInstanceLock()` and releases it on `dispose()` |
| `'external'` | You already hold the lock. The library listens for `'second-instance'` but never acquires or releases |
| `'disabled'` | No lock and no `'second-instance'` listener. Deep links still work |

#### Returns: `InstanceManager`

| Property/Method | Type | Description |
|-----------------|------|-------------|
| `shouldQuit` | `boolean` | Whether this instance should quit |
| `configure(handlers)` | `(handlers: InstanceHandlers) => void` | Supply or replace `onDeepLink` / `onSecondInstance`. Only the keys present are updated |
| `processPendingDeepLinks()` | `() => Promise<void>` | Process queued deep links and mark handler as ready. Resolves once dispatched handlers settle |
| `getPendingDeepLinks()` | `() => string[]` | Get pending deep links without processing |
| `clearPendingDeepLinks()` | `() => void` | Clear pending deep links without processing |
| `queueDeepLink(url)` | `(url: string, intent?: DeepLinkIntent) => void` | Queue a deep link for later processing |
| `deferDeepLink(url)` | `(url: string, intent?: DeepLinkIntent) => void` | Hold a deep link until `processDeferredDeepLinks()` |
| `processDeferredDeepLinks()` | `() => Promise<void>` | Process deep links held by `deferDeepLink()`. Resolves once dispatched handlers settle, or once scheduled when called re-entrantly |
| `getDeferredDeepLinks()` | `() => string[]` | Get deferred deep links without processing |
| `clearDeferredDeepLinks()` | `() => void` | Clear deferred deep links without processing |
| `unregisterProtocols()` | `() => void` | Unregister protocol handlers (typically only needed for testing) |
| `dispose()` | `() => void` | Remove installed listeners and unregister protocols |

### `createInstance(options)`

Same as `setupInstance()` minus `onDeepLink` and `onSecondInstance`, which you
supply later via `configure()`. Returns the same `InstanceManager`. See
[Staged Startup](#staged-startup).

### `extractDeepLinkFromArgs(argv, protocols)`

Find the deep link in a list of command-line arguments, using the current
platform's rules. Useful if you buffer launch events yourself or need to
inspect a relaunch's `argv`.

```typescript
import { extractDeepLinkFromArgs } from 'electron-launch-handler'

extractDeepLinkFromArgs(['MyApp', '--flag', 'myapp://open'], ['myapp'])
// 'myapp://open'
```

Arguments are scanned in reverse on every platform, because the OS appends the
URL — the last match is the one that triggered the launch.

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
| `intent` | `'launch' \| 'open-url'` | How the deep link was delivered |

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
