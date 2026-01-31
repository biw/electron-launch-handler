import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLogger } from '../helpers/electron-mock.js'
import { DeepLinkQueue } from '../../src/queue.js'
import { parseDeepLink, createDeepLinkContext } from '../../src/url-parser.js'

describe('Deep Link Processing Pipeline', () => {
  const logger = createMockLogger()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('URL parsing and context creation', () => {
    it('should parse deep link and create context', () => {
      const url = 'myapp://auth/callback?code=abc123&state=xyz'

      const parsed = parseDeepLink(url)
      expect(parsed).not.toBeNull()

      const context = createDeepLinkContext(url, 'launch')
      expect(context).not.toBeNull()
      expect(context!.protocol).toBe('myapp')
      expect(context!.path).toBe('/callback')
      expect(context!.params.get('code')).toBe('abc123')
      expect(context!.intent).toBe('launch')
    })
  })

  describe('Queue and dispatch flow', () => {
    it('should queue deep links before processing', () => {
      const queue = new DeepLinkQueue(logger)

      queue.enqueue('myapp://link1', 'launch')
      queue.enqueue('myapp://link2', 'launch')
      queue.enqueue('myapp://link3', 'launch')

      expect(queue.size()).toBe(3)
      expect(queue.isProcessed()).toBe(false)
    })

    it('should drain queue in order', () => {
      const queue = new DeepLinkQueue(logger)

      queue.enqueue('myapp://first', 'launch')
      queue.enqueue('myapp://second', 'launch')
      queue.enqueue('myapp://third', 'launch')

      const urls = queue.drain()

      expect(urls).toEqual([
        { url: 'myapp://first', intent: 'launch' },
        { url: 'myapp://second', intent: 'launch' },
        { url: 'myapp://third', intent: 'launch' },
      ])
      expect(queue.isProcessed()).toBe(true)
    })

    it('should not queue after drain', () => {
      const queue = new DeepLinkQueue(logger)

      queue.enqueue('myapp://before', 'launch')
      queue.drain()
      queue.enqueue('myapp://after', 'launch')

      expect(queue.size()).toBe(0)
    })
  })

  describe('Complete deep link handling', () => {
    it('should process launch deep link correctly', () => {
      const handler = vi.fn()
      const url = 'myapp://auth/callback?code=test123'

      const context = createDeepLinkContext(url, 'launch')
      expect(context).not.toBeNull()

      handler(url, context)

      expect(handler).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          protocol: 'myapp',
          path: '/callback',
          intent: 'launch',
        })
      )
      expect(handler.mock.calls[0][1].params.get('code')).toBe('test123')
    })

    it('should handle runtime deep link correctly', () => {
      const handler = vi.fn()
      const url = 'myapp://open/file?path=/test/file.txt'

      const context = createDeepLinkContext(url, 'open-url')
      expect(context).not.toBeNull()

      handler(url, context)

      expect(handler).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          intent: 'open-url',
        })
      )
    })
  })
})
