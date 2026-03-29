import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

/**
 * GET /api/mcp-servers — Fetch MCP server list from the lobster box via gateway tunnel.
 *
 * Proxies the request to the OpenClaw Gateway's /api/mcp-servers endpoint
 * (served by skills-api.js on the desktop machine through Cloudflare Tunnel).
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const gwUrl = (process.env.OPENCLAW_GATEWAY_URL || '').trim()
  const gwHost = (process.env.OPENCLAW_GATEWAY_HOST || '').trim()

  let httpUrl = ''
  if (gwUrl) {
    httpUrl = gwUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://')
      .replace(/\/ws\/?$/, '')
  } else if (gwHost) {
    httpUrl = gwHost.startsWith('http') ? gwHost : `https://${gwHost}`
  }

  if (!httpUrl) {
    return NextResponse.json({ servers: [], total: 0, error: 'No gateway URL configured' })
  }

  const gwToken = (
    process.env.OPENCLAW_GATEWAY_TOKEN ||
    process.env.OPENCLAW_TOKEN ||
    process.env.GATEWAY_TOKEN ||
    ''
  ).trim()

  try {
    const res = await fetch(`${httpUrl}/api/mcp-servers`, {
      headers: {
        Authorization: gwToken ? `Bearer ${gwToken}` : '',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      logger.warn(`Gateway /api/mcp-servers returned ${res.status}`)
      return NextResponse.json({ servers: [], total: 0, error: `Gateway returned ${res.status}` })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    logger.warn({ err }, 'Failed to fetch MCP servers from gateway')
    return NextResponse.json({
      servers: [],
      total: 0,
      error: err?.message || 'Gateway unreachable',
    })
  }
}
