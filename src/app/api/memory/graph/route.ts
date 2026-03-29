import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readdirSync, statSync } from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { config } from '@/lib/config'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

interface AgentFileInfo {
  path: string
  chunks: number
  textSize: number
}

interface AgentGraphData {
  name: string
  dbSize: number
  totalChunks: number
  totalFiles: number
  files: AgentFileInfo[]
}

const memoryDbDir = config.openclawStateDir
  ? path.join(config.openclawStateDir, 'memory')
  : ''

function getAgentData(dbPath: string, agentName: string): AgentGraphData | null {
  try {
    const dbStat = statSync(dbPath)
    const db = new Database(dbPath, { readonly: true, fileMustExist: true })

    let files: AgentFileInfo[] = []
    let totalChunks = 0
    let totalFiles = 0

    try {
      // Check if chunks table exists
      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'")
        .get() as { name: string } | undefined

      if (tableCheck) {
        // Use COUNT only — skip SUM(LENGTH(text)) which forces a full data scan
        const rows = db
          .prepare(
            'SELECT path, COUNT(*) as chunks FROM chunks GROUP BY path ORDER BY chunks DESC'
          )
          .all() as Array<{ path: string; chunks: number }>

        files = rows.map((r) => ({
          path: r.path || '(unknown)',
          chunks: r.chunks,
          textSize: 0,
        }))

        totalChunks = files.reduce((sum, f) => sum + f.chunks, 0)
        totalFiles = files.length
      }
    } finally {
      db.close()
    }

    return {
      name: agentName,
      dbSize: dbStat.size,
      totalChunks,
      totalFiles,
      files,
    }
  } catch (err) {
    logger.warn(`Failed to read memory DB for agent "${agentName}": ${err}`)
    return null
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  if (!memoryDbDir || !existsSync(memoryDbDir)) {
    // Fallback: read from remote cache (pushed by lobster-bridge)
    try {
      const mcDb = getDatabase()
      const workspaceId = auth.user.workspace_id ?? 1
      const cached = mcDb.prepare(
        'SELECT data, updated_at FROM memory_graph_cache WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 1'
      ).get(workspaceId) as { data: string; updated_at: number } | undefined

      if (cached) {
        const parsed = JSON.parse(cached.data)
        return NextResponse.json({
          agents: parsed.agents || [],
          cached: true,
          cachedAt: cached.updated_at,
        })
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to read memory graph cache')
    }

    return NextResponse.json(
      { error: 'Memory directory not available', agents: [] },
      { status: 404 }
    )
  }

  const agentFilter = request.nextUrl.searchParams.get('agent') || 'all'

  try {
    const entries = readdirSync(memoryDbDir).filter((f) => f.endsWith('.sqlite'))
    const agents: AgentGraphData[] = []

    for (const entry of entries) {
      const agentName = entry.replace('.sqlite', '')

      if (agentFilter !== 'all' && agentName !== agentFilter) continue

      const dbPath = path.join(memoryDbDir, entry)
      const data = getAgentData(dbPath, agentName)
      if (data) agents.push(data)
    }

    // Sort by total chunks descending
    agents.sort((a, b) => b.totalChunks - a.totalChunks)

    return NextResponse.json({ agents })
  } catch (err) {
    logger.error(`Failed to build memory graph data: ${err}`)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
