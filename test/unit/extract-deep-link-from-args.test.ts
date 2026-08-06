import { afterEach, describe, expect, it } from 'vitest'
import { extractDeepLinkFromArgs } from '../../src/index.js'

const PLATFORMS = ['darwin', 'win32', 'linux'] as const

const originalPlatform = process.platform

const setPlatform = (platform: string) => {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

afterEach(() => {
  setPlatform(originalPlatform)
})

/**
 * `extractDeepLinkFromArgs` resolves the platform handler on every call, so
 * each platform's implementation can be exercised from any host OS. Without
 * this the CI matrix only ever covers the file matching the runner, and the
 * three implementations are free to drift apart.
 */
describe('extractDeepLinkFromArgs', () => {
  describe.each(PLATFORMS)('on %s', (platform) => {
    it('returns the last match, not the first', () => {
      setPlatform(platform)

      expect(
        extractDeepLinkFromArgs(
          ['MyApp', 'myapp://first', '--flag', 'myapp://last'],
          ['myapp']
        )
      ).toBe('myapp://last')
    })

    it('finds a URL that is not the final argument', () => {
      setPlatform(platform)

      expect(
        extractDeepLinkFromArgs(['MyApp', 'myapp://open', '--flag'], ['myapp'])
      ).toBe('myapp://open')
    })

    it('matches any of the registered protocols', () => {
      setPlatform(platform)

      expect(
        extractDeepLinkFromArgs(
          ['MyApp', 'myapp-dev://open'],
          ['myapp', 'myapp-dev']
        )
      ).toBe('myapp-dev://open')
    })

    it('ignores unregistered protocols', () => {
      setPlatform(platform)

      expect(extractDeepLinkFromArgs(['other://thing'], ['myapp'])).toBe(
        undefined
      )
    })

    it('returns undefined when nothing matches', () => {
      setPlatform(platform)

      expect(extractDeepLinkFromArgs(['MyApp', '--flag'], ['myapp'])).toBe(
        undefined
      )
    })

    it('returns undefined for an empty protocol list', () => {
      setPlatform(platform)

      expect(extractDeepLinkFromArgs(['myapp://open'], [])).toBe(undefined)
    })

    it('does not match a bare scheme without a separator', () => {
      setPlatform(platform)

      expect(extractDeepLinkFromArgs(['myapp'], ['myapp'])).toBe(undefined)
    })
  })

  it('resolves identically on every platform', () => {
    const argv = ['MyApp', 'myapp://first', '--flag', 'myapp://last']

    const results = PLATFORMS.map((platform) => {
      setPlatform(platform)
      return extractDeepLinkFromArgs(argv, ['myapp'])
    })

    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('myapp://last')
  })
})
