import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
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

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/team-leads/[id] — Update a team lead
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  const { id } = await params

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    const existing = db.prepare(
      'SELECT * FROM team_leads WHERE id = ? AND workspace_id = ?'
    ).get(Number(id), workspaceId)

    if (!existing) {
      return NextResponse.json({ error: 'Team lead not found' }, { status: 404 })
    }

    const fields: string[] = []
    const values: any[] = []

    const updatable = ['display_name', 'description', 'icon', 'soul_template', 'sop_content', 'task_creation_instructions', 'enabled', 'priority'] as const
    for (const key of updatable) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(body[key])
      }
    }

    const jsonFields = ['keywords', 'skills', 'agent_types', 'mcp_scopes'] as const
    for (const key of jsonFields) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(JSON.stringify(body[key]))
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(Number(id), workspaceId)
    db.prepare(`UPDATE team_leads SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...values)

    const updated = db.prepare('SELECT * FROM team_leads WHERE id = ?').get(Number(id)) as any
    return NextResponse.json({ team_lead: formatRow(updated) })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/team-leads/[id] error')
    return NextResponse.json({ error: 'Failed to update team lead' }, { status: 500 })
  }
}

/**
 * DELETE /api/team-leads/[id] — Delete a team lead
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  const { id } = await params

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1

    const result = db.prepare(
      'DELETE FROM team_leads WHERE id = ? AND workspace_id = ?'
    ).run(Number(id), workspaceId)

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Team lead not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'DELETE /api/team-leads/[id] error')
    return NextResponse.json({ error: 'Failed to delete team lead' }, { status: 500 })
  }
}
