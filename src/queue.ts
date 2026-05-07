import type { DeepLinkIntent, Logger } from './types.js'

export interface QueuedDeepLink {
  url: string
  intent: DeepLinkIntent
}

export class DeepLinkQueue {
  private queue: QueuedDeepLink[] = []
  private processed = false
  private logger: Logger

  constructor(logger?: Logger) {
    this.logger = logger ?? {
      debug: () => {},
      info: () => {},
      error: () => {},
    }
  }

  enqueue(url: string, intent: DeepLinkIntent): void {
    if (this.processed) {
      this.logger.debug(
        `Deep link queue already processed, not queuing: ${url}`
      )
      return
    }

    this.logger.debug(`Queuing deep link: ${url}`)
    this.queue.push({ url, intent })
  }

  drain(): QueuedDeepLink[] {
    if (this.processed) {
      this.logger.debug('Deep link queue already drained')
      return []
    }

    this.processed = true
    const urls = this.queue.map((item) => ({ ...item }))
    this.queue = []

    this.logger.debug(`Draining ${urls.length} deep link(s) from queue`)
    return urls
  }

  peek(): QueuedDeepLink[] {
    return this.queue.map((item) => ({ ...item }))
  }

  clear(): void {
    this.logger.debug(`Clearing ${this.queue.length} deep link(s) from queue`)
    this.queue = []
  }

  isProcessed(): boolean {
    return this.processed
  }

  size(): number {
    return this.queue.length
  }

  hasItems(): boolean {
    return this.queue.length > 0
  }

  reset(): void {
    this.logger.debug('Resetting deep link queue')
    this.queue = []
    this.processed = false
  }
}
