import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { extname } from 'path'
import { config } from '@/lib/config'
import { resolveWithin } from '@/lib/paths'
import { requireRole } from '@/lib/auth'
import { getLobsterBaseUrl } from '@/lib/lobster-api'

const MAX_PREVIEW_SIZE = 50 * 1024 * 1024 // 50 MB

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf', '.html': 'text/html', '.htm': 'text/html',
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, 'viewer')
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  // Try Gateway proxy first (binary stream)
  const baseUrl = getLobsterBaseUrl()
  if (baseUrl) {
    const gwToken = (
      process.env.OPENCLAW_GATEWAY_TOKEN ||
      process.env.OPENCLAW_TOKEN ||
      process.env.GATEWAY_TOKEN ||
      ''
    ).trim()

    try {
      const gwRes = await fetch(`${baseUrl}/api/workspace-files/preview?path=${encodeURIComponent(filePath)}`, {
        headers: {
          Authorization: gwToken ? `Bearer ${gwToken}` : '',
        },
        signal: AbortSignal.timeout(30_000),
      })

      if (gwRes.ok && gwRes.body) {
        const contentType = gwRes.headers.get('content-type') || 'application/octet-stream'
        const contentLength = gwRes.headers.get('content-length')
        const headers: Record<string, string> = {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=30',
        }
        if (contentLength) headers['Content-Length'] = contentLength

        const buf = Buffer.from(await gwRes.arrayBuffer())
        return new NextResponse(buf, { headers })
      }
    } catch {
      // Fall through to local
    }
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

  if (info.size > MAX_PREVIEW_SIZE) {
    return NextResponse.json({ error: 'File too large for preview', size: info.size }, { status: 413 })
  }

  const ext = extname(safePath).toLowerCase()
  const contentType = MIME_MAP[ext] || 'application/octet-stream'
  const buffer = await readFile(safePath)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Content-Disposition': contentType === 'application/octet-stream' ? `attachment; filename="${encodeURIComponent(filePath.split('/').pop() || 'file')}"` : 'inline',
      'Cache-Control': 'private, max-age=30',
    },
  })
}
