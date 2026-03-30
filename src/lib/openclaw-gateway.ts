import { config } from './config'
import { logger } from './logger'

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

    const res = await fetch(`${gatewayUrl}/api/mc-task`, {
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
      logger.info({ method, status: data?.status || data?.ok }, 'Gateway HTTP forward successful')
      if (data?.result !== undefined) return data.result as T
      return data as T
    }

    throw new Error(`Gateway HTTP ${res.status}: ${await res.text().catch(() => '')}`)
  } catch (err: any) {
    logger.error({ err, method }, 'Gateway HTTP forward failed')
    throw err
  }
}
