/**
 * Lobster API — shared helper to fetch data from the lobster's skills-api.js
 * via Cloudflare Tunnel. MC Dashboard is a display layer; lobster is the source of truth.
 */

import { logger } from './logger'

export function getLobsterBaseUrl(): string {
  const gwUrl = (process.env.OPENCLAW_GATEWAY_URL || '').trim()
  const gwHost = (process.env.OPENCLAW_GATEWAY_HOST || '').trim()

  if (gwUrl) {
    return gwUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://')
      .replace(/\/ws\/?$/, '')
  }
  if (gwHost) {
    return gwHost.startsWith('http') ? gwHost : `https://${gwHost}`
  }
  return ''
}

export async function lobsterFetch(path: string, timeoutMs = 10_000): Promise<any> {
  const baseUrl = getLobsterBaseUrl()
  if (!baseUrl) {
    return { error: 'No gateway URL configured' }
  }

  const gwToken = (
    process.env.OPENCLAW_GATEWAY_TOKEN ||
    process.env.OPENCLAW_TOKEN ||
    process.env.GATEWAY_TOKEN ||
    ''
  ).trim()

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: gwToken ? `Bearer ${gwToken}` : '',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      logger.warn(`Lobster ${path} returned ${res.status}`)
      return { error: `Gateway returned ${res.status}` }
    }

    return await res.json()
  } catch (err: any) {
    logger.debug({ err }, `Failed to fetch ${path} from lobster`)
    return { error: err?.message || 'Gateway unreachable' }
  }
}
