import type {
  ParsedDeepLink,
  DeepLinkContext,
  DeepLinkIntent,
} from './types.js'

/**
 * Parse a deep link URL into its components
 * @param url - The URL string to parse
 * @returns Parsed deep link components, or null if invalid
 */
export function parseDeepLink(url: string): ParsedDeepLink | null {
  try {
    const parsed = new URL(url)

    // Extract protocol without the trailing colon
    const protocol = parsed.protocol.replace(/:$/, '')

    return {
      url,
      parsed,
      protocol,
      host: parsed.host,
      path: parsed.pathname,
      params: parsed.searchParams,
      hash: parsed.hash,
    }
  } catch {
    return null
  }
}

/**
 * Create a DeepLinkContext from a URL string
 * @param url - The URL string
 * @param intent - Why the deep link was delivered
 * @returns DeepLinkContext object, or null if URL is invalid
 */
export function createDeepLinkContext(
  url: string,
  intent: DeepLinkIntent
): DeepLinkContext | null {
  const parsed = parseDeepLink(url)
  if (!parsed) return null

  return {
    url: parsed.url,
    parsed: parsed.parsed,
    protocol: parsed.protocol,
    path: parsed.path,
    params: parsed.params,
    intent,
  }
}

/**
 * Check if a URL matches any of the registered protocol schemes
 * @param url - The URL string to check
 * @param protocols - Array of registered protocol schemes (without ://)
 * @returns True if the URL matches a registered protocol
 */
export function isRegisteredProtocol(
  url: string,
  protocols: string[]
): boolean {
  const parsed = parseDeepLink(url)
  if (!parsed) return false

  return protocols.includes(parsed.protocol)
}
