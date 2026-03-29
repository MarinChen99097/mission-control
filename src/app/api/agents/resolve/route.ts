import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

/**
 * GET /api/agents/resolve?alias=eng
 *
 * Resolve an @alias to an agent. Checks:
 * 1. Exact name match
 * 2. Alias match (from agents.aliases JSON array)
 *
 * Returns the matched agent or a list of available aliases.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const alias = request.nextUrl.searchParams.get('alias')?.trim().toLowerCase()

    if (!alias) {
      return NextResponse.json({ error: '"alias" query param is required' }, { status: 400 })
    }

    const agents = db.prepare(
      'SELECT id, name, role, runtime, aliases, status FROM agents WHERE workspace_id = ?'
    ).all(workspaceId) as Array<{ id: number; name: string; role: string; runtime: string; aliases: string; status: string }>

    // 1. Exact name match
    const exactMatch = agents.find(a => a.name.toLowerCase() === alias)
    if (exactMatch) {
      return NextResponse.json({ matched: true, agent: exactMatch })
    }

    // 2. Alias match
    for (const agent of agents) {
      try {
        const aliasList: string[] = JSON.parse(agent.aliases || '[]')
        if (aliasList.some(a => a.toLowerCase() === alias)) {
          return NextResponse.json({ matched: true, agent })
        }
      } catch { /* skip */ }
    }

    // 3. No match — return available aliases
    const available: Array<{ name: string; aliases: string[] }> = []
    for (const agent of agents) {
      try {
        const aliasList: string[] = JSON.parse(agent.aliases || '[]')
        if (aliasList.length > 0) {
          available.push({ name: agent.name, aliases: aliasList })
        }
      } catch { /* skip */ }
    }

    return NextResponse.json({
      matched: false,
      error: `No agent found for @${alias}`,
      available,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agents/resolve error')
    return NextResponse.json({ error: 'Failed to resolve agent' }, { status: 500 })
  }
}
