import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function formatRow(row: any) {
  return {
    ...row,
    keywords: safeJsonParse(row.keywords) || [],
    skills: safeJsonParse(row.skills) || [],
    agent_types: safeJsonParse(row.agent_types) || [],
    mcp_scopes: safeJsonParse(row.mcp_scopes) || [],
  }
}

/**
 * GET /api/team-leads — List all team leads
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1

    const rows = db.prepare(
      'SELECT * FROM team_leads WHERE workspace_id = ? ORDER BY priority DESC, name ASC'
    ).all(workspaceId) as any[]

    return NextResponse.json({ team_leads: rows.map(formatRow) })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/team-leads error')
    return NextResponse.json({ error: 'Failed to fetch team leads' }, { status: 500 })
  }
}

/**
 * POST /api/team-leads — Create a new team lead (expansion interface)
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    const { name, display_name, description, icon, keywords, skills, agent_types, mcp_scopes, soul_template, sop_content, task_creation_instructions, priority } = body

    if (!name || !display_name) {
      return NextResponse.json({ error: 'name and display_name are required' }, { status: 400 })
    }

    const result = db.prepare(`
      INSERT INTO team_leads (name, display_name, description, icon, keywords, skills, agent_types, mcp_scopes, soul_template, sop_content, task_creation_instructions, priority, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      display_name,
      description || null,
      icon || '',
      JSON.stringify(keywords || []),
      JSON.stringify(skills || []),
      JSON.stringify(agent_types || []),
      JSON.stringify(mcp_scopes || []),
      soul_template || null,
      sop_content || null,
      task_creation_instructions || null,
      priority ?? 50,
      workspaceId,
    )

    const created = db.prepare('SELECT * FROM team_leads WHERE id = ?').get(result.lastInsertRowid) as any
    return NextResponse.json({ team_lead: formatRow(created) }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'Team lead with this name already exists' }, { status: 409 })
    }
    logger.error({ err: error }, 'POST /api/team-leads error')
    return NextResponse.json({ error: 'Failed to create team lead' }, { status: 500 })
  }
}
