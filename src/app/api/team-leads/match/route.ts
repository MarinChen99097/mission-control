import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

interface TeamLeadMatch {
  id: number
  name: string
  display_name: string
  icon: string
  score: number
  keywords_matched: string[]
}

/**
 * POST /api/team-leads/match — Find the best team lead for a task description.
 *
 * Body: { text: "修復 backend 500 error" }
 * Response: { matches: [{ name, score, keywords_matched }] }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()
    const text = String(body?.text || '').toLowerCase()

    if (!text.trim()) {
      return NextResponse.json({ error: '"text" is required' }, { status: 400 })
    }

    const rows = db.prepare(
      'SELECT id, name, display_name, icon, keywords, priority FROM team_leads WHERE workspace_id = ? AND enabled = 1 ORDER BY priority DESC'
    ).all(workspaceId) as Array<{ id: number; name: string; display_name: string; icon: string; keywords: string; priority: number }>

    const matches: TeamLeadMatch[] = []

    for (const row of rows) {
      let keywords: string[]
      try {
        keywords = JSON.parse(row.keywords)
      } catch {
        continue
      }

      const matched = keywords.filter(kw => text.includes(kw.toLowerCase()))
      if (matched.length > 0) {
        // Score = matched keywords count, weighted by priority
        const score = matched.length * (1 + row.priority / 100)
        matches.push({
          id: row.id,
          name: row.name,
          display_name: row.display_name,
          icon: row.icon,
          score: Math.round(score * 100) / 100,
          keywords_matched: matched,
        })
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score)

    return NextResponse.json({ matches })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/team-leads/match error')
    return NextResponse.json({ error: 'Failed to match team leads' }, { status: 500 })
  }
}
