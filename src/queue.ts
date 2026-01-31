import type { DeepLinkIntent, Logger } from './types.js'

export interface QueuedDeepLink {
  url: string
  intent: DeepLinkIntent
}

/**
 * A simple FIFO queue for storing deep links received before the window is ready
 */
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

  /**
   * Add a deep link URL to the queue
   * @param url - The deep link URL to queue
   * @param intent - Why the deep link was delivered
   */
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

  /**
   * Get all queued deep links and mark the queue as processed
   * Subsequent calls will return an empty array
   * @returns Array of queued deep link entries
   */
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

  /**
   * Get all queued deep links without marking as processed
   * @returns Array of queued deep link entries
   */
  peek(): QueuedDeepLink[] {
    return this.queue.map((item) => ({ ...item }))
  }

  /**
   * Clear all queued deep links without processing
   */
  clear(): void {
    this.logger.debug(`Clearing ${this.queue.length} deep link(s) from queue`)
    this.queue = []
  }

  /**
   * Check if the queue has been processed
   * @returns True if drain() has been called
   */
  isProcessed(): boolean {
    return this.processed
  }

  /**
   * Get the number of queued deep links
   * @returns Number of URLs in the queue
   */
  size(): number {
    return this.queue.length
  }

  /**
   * Check if there are any queued deep links
   * @returns True if the queue is not empty
   */
  hasItems(): boolean {
    return this.queue.length > 0
  }

  /**
   * Reset the queue to its initial state
   * Allows re-processing after a reset
   */
  reset(): void {
    this.logger.debug('Resetting deep link queue')
    this.queue = []
    this.processed = false
  }
}
