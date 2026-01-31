import { describe, it, expect } from 'vitest'
import {
  parseDeepLink,
  createDeepLinkContext,
  isRegisteredProtocol,
} from '../../src/url-parser.js'

describe('parseDeepLink', () => {
  it('should parse a simple deep link URL', () => {
    const result = parseDeepLink('myapp://open')

    expect(result).not.toBeNull()
    expect(result!.protocol).toBe('myapp')
    expect(result!.host).toBe('open')
    expect(result!.path).toBe('')
    expect(result!.params.toString()).toBe('')
  })

  it('should parse a deep link with path', () => {
    const result = parseDeepLink('myapp://open/document/123')

    expect(result).not.toBeNull()
    expect(result!.protocol).toBe('myapp')
    expect(result!.host).toBe('open')
    expect(result!.path).toBe('/document/123')
  })

  it('should parse a deep link with query parameters', () => {
    const result = parseDeepLink('myapp://auth/callback?code=abc123&state=xyz')

    expect(result).not.toBeNull()
    expect(result!.protocol).toBe('myapp')
    expect(result!.params.get('code')).toBe('abc123')
    expect(result!.params.get('state')).toBe('xyz')
  })

  it('should parse a deep link with hash', () => {
    const result = parseDeepLink('myapp://page#section')

    expect(result).not.toBeNull()
    expect(result!.hash).toBe('#section')
  })

  it('should return null for invalid URLs', () => {
    expect(parseDeepLink('not a url')).toBeNull()
    expect(parseDeepLink('')).toBeNull()
    expect(parseDeepLink('://missing-protocol')).toBeNull()
  })

  it('should handle URLs with special characters', () => {
    const result = parseDeepLink('myapp://search?q=hello%20world')

    expect(result).not.toBeNull()
    expect(result!.params.get('q')).toBe('hello world')
  })

  it('should preserve the original URL', () => {
    const url = 'myapp://test/path?param=value'
    const result = parseDeepLink(url)

    expect(result).not.toBeNull()
    expect(result!.url).toBe(url)
  })
})

describe('createDeepLinkContext', () => {
  it('should create context with intent launch', () => {
    const context = createDeepLinkContext('myapp://open', 'launch')

    expect(context).not.toBeNull()
    expect(context!.intent).toBe('launch')
  })

  it('should create context with intent open-url', () => {
    const context = createDeepLinkContext('myapp://open', 'open-url')

    expect(context).not.toBeNull()
    expect(context!.intent).toBe('open-url')
  })

  it('should return null for invalid URLs', () => {
    expect(createDeepLinkContext('invalid', 'launch')).toBeNull()
  })

  it('should extract protocol without colon', () => {
    const context = createDeepLinkContext('myapp://test', 'launch')

    expect(context).not.toBeNull()
    expect(context!.protocol).toBe('myapp')
  })
})

describe('isRegisteredProtocol', () => {
  it('should return true for registered protocol', () => {
    expect(isRegisteredProtocol('myapp://test', ['myapp'])).toBe(true)
    expect(isRegisteredProtocol('myapp://test', ['other', 'myapp'])).toBe(true)
  })

  it('should return false for unregistered protocol', () => {
    expect(isRegisteredProtocol('other://test', ['myapp'])).toBe(false)
    expect(isRegisteredProtocol('other://test', [])).toBe(false)
  })

  it('should return false for invalid URL', () => {
    expect(isRegisteredProtocol('not a url', ['myapp'])).toBe(false)
  })

  it('should handle multiple protocols', () => {
    const protocols = ['myapp', 'myapp-dev', 'myapp-beta']

    expect(isRegisteredProtocol('myapp://test', protocols)).toBe(true)
    expect(isRegisteredProtocol('myapp-dev://test', protocols)).toBe(true)
    expect(isRegisteredProtocol('myapp-beta://test', protocols)).toBe(true)
    expect(isRegisteredProtocol('other://test', protocols)).toBe(false)
  })
})
