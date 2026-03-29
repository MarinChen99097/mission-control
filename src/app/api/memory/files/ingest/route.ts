import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

interface IngestFile {
  path: string
  content: string
  size: number
  modified: number
}

/**
 * POST /api/memory/files/ingest — Receive memory files from lobster-bridge.
 *
 * Body: { files: Array<{ path, content, size, modified }> }
 *
 * Stores file tree + content in memory_files_cache so the Files tab can
 * display remote memory files when local filesystem is unavailable.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const body = await request.json()
    const files = body?.files as IngestFile[] | undefined

    if (!Array.isArray(files)) {
      return NextResponse.json({ error: '"files" array is required' }, { status: 400 })
    }

    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const now = Math.floor(Date.now() / 1000)
    const source = typeof body.source === 'string' ? body.source : 'bridge'

    const upsert = db.prepare(`
      INSERT INTO memory_files_cache (file_path, content, size, modified, source, updated_at, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path, workspace_id) DO UPDATE SET
        content = excluded.content,
        size = excluded.size,
        modified = excluded.modified,
        source = excluded.source,
        updated_at = excluded.updated_at
    `)

    const ingestTx = db.transaction(() => {
      // Remove files that are no longer present on the lobster
      const incomingPaths = new Set(files.map(f => f.path))
      const existing = db.prepare(
        'SELECT file_path FROM memory_files_cache WHERE workspace_id = ? AND source = ?'
      ).all(workspaceId, source) as Array<{ file_path: string }>

      const deletePaths = existing.filter(e => !incomingPaths.has(e.file_path))
      if (deletePaths.length > 0) {
        const del = db.prepare('DELETE FROM memory_files_cache WHERE file_path = ? AND workspace_id = ?')
        for (const d of deletePaths) {
          del.run(d.file_path, workspaceId)
        }
      }

      // Upsert all incoming files
      for (const file of files) {
        upsert.run(file.path, file.content, file.size, file.modified, source, now, workspaceId)
      }
    })

    ingestTx()

    logger.info({ fileCount: files.length, source }, 'Memory files cache updated')
    return NextResponse.json({ ok: true, cached: files.length, updatedAt: now })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/memory/files/ingest error')
    return NextResponse.json({ error: 'Failed to ingest memory files' }, { status: 500 })
  }
}
