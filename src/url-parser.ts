import type {
  ParsedDeepLink,
  DeepLinkContext,
  DeepLinkIntent,
} from './types.js'

export function parseDeepLink(url: string): ParsedDeepLink | null {
  try {
    const parsed = new URL(url)
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
    host: parsed.host,
    path: parsed.path,
    params: parsed.params,
    hash: parsed.hash,
    intent,
  }
}

export function isRegisteredProtocol(
  url: string,
  protocols: string[]
): boolean {
  const parsed = parseDeepLink(url)
  if (!parsed) return false

  return protocols.includes(parsed.protocol)
}
