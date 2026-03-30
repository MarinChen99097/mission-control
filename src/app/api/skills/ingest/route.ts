import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

/**
 * POST /api/skills/ingest — Bulk ingest skills from lobster-bridge.
 *
 * Body: { skills: Array<{ name, source, path, description, content }> }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const body = await request.json()
    const skills = body?.skills
    if (!Array.isArray(skills)) {
      return NextResponse.json({ error: '"skills" array is required' }, { status: 400 })
    }

    const db = getDatabase()
    const upsert = db.prepare(`
      INSERT INTO skills (name, source, path, description, content_hash, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, name) DO UPDATE SET
        path = excluded.path,
        description = excluded.description,
        content_hash = excluded.content_hash,
        updated_at = excluded.updated_at
    `)

    const now = new Date().toISOString()
    let ingested = 0

    const tx = db.transaction(() => {
      for (const skill of skills) {
        if (!skill.name) continue
        const content = skill.content || skill.description || ''
        const hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
        upsert.run(
          skill.name,
          skill.source || 'gateway-remote',
          skill.path || `gateway://${skill.name}`,
          (skill.description || '').slice(0, 500),
          hash,
          now,
          now,
        )
        ingested++
      }
    })
    tx()

    logger.info({ count: ingested }, 'Skills ingested from bridge')
    return NextResponse.json({ ok: true, ingested, updatedAt: now })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/skills/ingest error')
    return NextResponse.json({ error: 'Failed to ingest skills' }, { status: 500 })
  }
}
