import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

/**
 * POST /api/memory/graph/ingest — Receive memory graph data from lobster-bridge.
 *
 * Body: { agents: Array<{ name, dbSize, totalChunks, totalFiles, files }> }
 *
 * Stores the payload in memory_graph_cache so the Graph tab can display
 * remote memory data when local filesystem is unavailable (e.g. GCP deploy).
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const body = await request.json()
    const agents = body?.agents

    if (!Array.isArray(agents)) {
      return NextResponse.json({ error: '"agents" array is required' }, { status: 400 })
    }

    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const now = Math.floor(Date.now() / 1000)

    // Upsert: keep only the latest entry per workspace + source
    const source = typeof body.source === 'string' ? body.source : 'bridge'

    db.prepare(`
      DELETE FROM memory_graph_cache WHERE workspace_id = ? AND source = ?
    `).run(workspaceId, source)

    db.prepare(`
      INSERT INTO memory_graph_cache (source, data, updated_at, workspace_id)
      VALUES (?, ?, ?, ?)
    `).run(source, JSON.stringify({ agents }), now, workspaceId)

    logger.info({ agentCount: agents.length, source }, 'Memory graph cache updated')

    return NextResponse.json({ ok: true, cached: agents.length, updatedAt: now })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/memory/graph/ingest error')
    return NextResponse.json({ error: 'Failed to ingest memory graph' }, { status: 500 })
  }
}
