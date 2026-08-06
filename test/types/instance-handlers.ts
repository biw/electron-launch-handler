import type { InstanceHandlers, InstanceManager } from '../../src/index.js'

declare const instance: InstanceManager

const clearHandlers: InstanceHandlers = {
  onDeepLink: undefined,
  onSecondInstance: undefined,
}

instance.configure(clearHandlers)
instance.configure({ onDeepLink: undefined })
instance.configure({ onSecondInstance: undefined })
