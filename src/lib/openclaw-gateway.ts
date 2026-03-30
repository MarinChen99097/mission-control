import { config } from './config'
import { logger } from './logger'
import { runOpenClaw } from './command'

export function parseGatewayJsonOutput(raw: string): unknown | null {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null

  const objectStart = trimmed.indexOf('{')
  const arrayStart = trimmed.indexOf('[')
  const hasObject = objectStart >= 0
  const hasArray = arrayStart >= 0

  let start = -1
  let end = -1

  if (hasObject && hasArray) {
    if (objectStart < arrayStart) {
      start = objectStart
      end = trimmed.lastIndexOf('}')
    } else {
      start = arrayStart
      end = trimmed.lastIndexOf(']')
    }
  } else if (hasObject) {
    start = objectStart
    end = trimmed.lastIndexOf('}')
  } else if (hasArray) {
    start = arrayStart
    end = trimmed.lastIndexOf(']')
  }

  if (start < 0 || end < start) return null

  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Call OpenClaw Gateway via HTTP JSON-RPC (Cloud Run compatible).
 * Falls back to local CLI spawn if HTTP fails and openclaw binary exists.
 */
export async function callOpenClawGateway<T = unknown>(
  method: string,
  params: unknown,
  timeoutMs = 10000,
): Promise<T> {
  const gatewayUrl = config.gatewayUrl
  const gwToken = (
    process.env.OPENCLAW_GATEWAY_TOKEN ||
    process.env.OPENCLAW_TOKEN ||
    process.env.GATEWAY_TOKEN ||
    ''
  ).trim()

  // Try HTTP JSON-RPC first (works in Cloud Run)
  try {
    const rpcBody = {
      type: 'req',
      method,
      id: `mc-rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      params: params ?? {},
    }

    const res = await fetch(`${gatewayUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(gwToken ? { Authorization: `Bearer ${gwToken}` } : {}),
      },
      body: JSON.stringify(rpcBody),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (res.ok) {
      const data = await res.json()
      if (data?.result !== undefined) return data.result as T
      if (data?.error) throw new Error(`Gateway RPC error: ${JSON.stringify(data.error)}`)
      return data as T
    }

    // If /rpc returns 404, try posting params directly as REST
    if (res.status === 404) {
      logger.debug('Gateway /rpc returned 404, trying CLI fallback')
    } else {
      throw new Error(`Gateway HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('Gateway HTTP')) {
      throw err
    }
    logger.debug({ err }, 'HTTP RPC failed, trying CLI fallback')
  }

  // Fallback: local CLI (works in local dev, fails in Cloud Run)
  const result = await runOpenClaw(
    [
      'gateway',
      'call',
      method,
      '--timeout',
      String(Math.max(1000, Math.floor(timeoutMs))),
      '--params',
      JSON.stringify(params ?? {}),
      '--json',
    ],
    { timeoutMs: timeoutMs + 2000 },
  )

  const payload = parseGatewayJsonOutput(result.stdout)
  if (payload == null) {
    throw new Error(`Invalid JSON response from gateway method ${method}`)
  }

  return payload as T
}
