import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { config } from '@/lib/config'
import { resolveWithin } from '@/lib/paths'
import { requireRole } from '@/lib/auth'
import { lobsterFetch, getLobsterBaseUrl } from '@/lib/lobster-api'

const MAX_TEXT_SIZE = 2 * 1024 * 1024 // 2 MB

export async function GET(req: NextRequest) {
  const auth = requireRole(req, 'viewer')
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  // Try Gateway proxy first
  if (getLobsterBaseUrl()) {
    const data = await lobsterFetch(`/api/workspace-files/content?path=${encodeURIComponent(filePath)}`, 15_000)
    if (!data.error) return NextResponse.json(data)
  }

  // Local fallback
  const baseDir = config.workspaceExplorerDir
  if (!baseDir || !existsSync(baseDir)) {
    return NextResponse.json({ error: 'OpenClaw workspace not found' }, { status: 404 })
  }

  let safePath: string
  try {
    safePath = resolveWithin(baseDir, filePath)
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  if (!existsSync(safePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const info = await stat(safePath)
  if (!info.isFile()) {
    return NextResponse.json({ error: 'Not a file' }, { status: 400 })
  }

  if (info.size > MAX_TEXT_SIZE) {
    return NextResponse.json({ error: 'File too large for text preview', size: info.size, maxSize: MAX_TEXT_SIZE }, { status: 413 })
  }

  const content = await readFile(safePath, 'utf-8')
  return NextResponse.json({
    content,
    size: info.size,
    modified: info.mtime.getTime(),
    path: filePath,
  })
}
