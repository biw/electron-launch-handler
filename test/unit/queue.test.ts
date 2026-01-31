import { describe, it, expect, beforeEach } from 'vitest'
import { DeepLinkQueue } from '../../src/queue.js'
import { createMockLogger } from '../helpers/electron-mock.js'

describe('DeepLinkQueue', () => {
  let queue: DeepLinkQueue

  beforeEach(() => {
    queue = new DeepLinkQueue()
  })

  describe('enqueue', () => {
    it('should add URLs to the queue', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.enqueue('myapp://test2', 'launch')

      expect(queue.size()).toBe(2)
    })

    it('should not add URLs after queue is processed', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.drain()
      queue.enqueue('myapp://test2', 'launch')

      expect(queue.size()).toBe(0)
    })
  })

  describe('drain', () => {
    it('should return all queued URLs', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.enqueue('myapp://test2', 'launch')

      const urls = queue.drain()

      expect(urls).toEqual([
        { url: 'myapp://test1', intent: 'launch' },
        { url: 'myapp://test2', intent: 'launch' },
      ])
    })

    it('should clear the queue after draining', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.drain()

      expect(queue.size()).toBe(0)
    })

    it('should return empty array on subsequent drains', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.drain()

      expect(queue.drain()).toEqual([])
    })

    it('should preserve order (FIFO)', () => {
      queue.enqueue('myapp://first', 'launch')
      queue.enqueue('myapp://second', 'launch')
      queue.enqueue('myapp://third', 'launch')

      const urls = queue.drain()

      expect(urls).toEqual([
        { url: 'myapp://first', intent: 'launch' },
        { url: 'myapp://second', intent: 'launch' },
        { url: 'myapp://third', intent: 'launch' },
      ])
    })
  })

  describe('peek', () => {
    it('should return queued URLs without draining', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.enqueue('myapp://test2', 'launch')

      const urls = queue.peek()

      expect(urls).toEqual([
        { url: 'myapp://test1', intent: 'launch' },
        { url: 'myapp://test2', intent: 'launch' },
      ])
      expect(queue.size()).toBe(2)
    })

    it('should return a copy of the queue', () => {
      queue.enqueue('myapp://test1', 'launch')

      const urls = queue.peek()
      urls.push({ url: 'myapp://modified', intent: 'launch' })

      expect(queue.peek()).toEqual([{ url: 'myapp://test1', intent: 'launch' }])
    })
  })

  describe('clear', () => {
    it('should remove all URLs from the queue', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.enqueue('myapp://test2', 'launch')
      queue.clear()

      expect(queue.size()).toBe(0)
    })

    it('should not affect isProcessed state', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.clear()

      expect(queue.isProcessed()).toBe(false)
    })
  })

  describe('isProcessed', () => {
    it('should return false initially', () => {
      expect(queue.isProcessed()).toBe(false)
    })

    it('should return true after drain', () => {
      queue.drain()

      expect(queue.isProcessed()).toBe(true)
    })

    it('should return false after reset', () => {
      queue.drain()
      queue.reset()

      expect(queue.isProcessed()).toBe(false)
    })
  })

  describe('size', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.size()).toBe(0)
    })

    it('should return correct count', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.enqueue('myapp://test2', 'launch')
      queue.enqueue('myapp://test3', 'launch')

      expect(queue.size()).toBe(3)
    })
  })

  describe('hasItems', () => {
    it('should return false for empty queue', () => {
      expect(queue.hasItems()).toBe(false)
    })

    it('should return true when queue has items', () => {
      queue.enqueue('myapp://test1', 'launch')

      expect(queue.hasItems()).toBe(true)
    })
  })

  describe('reset', () => {
    it('should clear queue and allow re-processing', () => {
      queue.enqueue('myapp://test1', 'launch')
      queue.drain()
      queue.reset()
      queue.enqueue('myapp://test2', 'launch')

      const urls = queue.drain()

      expect(urls).toEqual([{ url: 'myapp://test2', intent: 'launch' }])
    })
  })

  describe('with logger', () => {
    it('should log operations when logger is provided', () => {
      const logger = createMockLogger()
      const loggedQueue = new DeepLinkQueue(logger)

      loggedQueue.enqueue('myapp://test', 'launch')
      loggedQueue.drain()

      expect(logger.debug).toHaveBeenCalled()
    })
  })
})
