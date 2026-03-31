import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { config } from '@/lib/config'
import { requireRole } from '@/lib/auth'
import { lobsterFetch, getLobsterBaseUrl } from '@/lib/lobster-api'

interface FileNode {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
  children?: FileNode[]
}

const MAX_DEPTH = 8
const MAX_FILES = 5000

let fileCount = 0

async function buildTree(dirPath: string, relativeBase: string, depth: number): Promise<FileNode[]> {
  if (depth > MAX_DEPTH || fileCount > MAX_FILES) return []

  let items
  try {
    items = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: FileNode[] = []

  for (const item of items) {
    if (fileCount > MAX_FILES) break
    if (item.name.startsWith('.') && item.name !== '.env.example') continue
    if (item.isSymbolicLink()) continue

    const fullPath = join(dirPath, item.name)
    const relativePath = relativeBase ? `${relativeBase}/${item.name}` : item.name

    try {
      const info = await stat(fullPath)
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === '.git' || item.name === '__pycache__' || item.name === '.next') continue
        const children = await buildTree(fullPath, relativePath, depth + 1)
        nodes.push({ path: relativePath, name: item.name, type: 'directory', modified: info.mtime.getTime(), children })
      } else if (item.isFile()) {
        fileCount++
        nodes.push({ path: relativePath, name: item.name, type: 'file', size: info.size, modified: info.mtime.getTime() })
      }
    } catch {
      // skip unreadable
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Try Gateway proxy first (for remote MC on GCP)
  if (getLobsterBaseUrl()) {
    const data = await lobsterFetch('/api/workspace-files', 30_000)
    if (!data.error) return NextResponse.json(data)
  }

  // Local fallback
  const workspaceDir = config.workspaceExplorerDir
  if (!workspaceDir || !existsSync(workspaceDir)) {
    return NextResponse.json({ error: 'OpenClaw workspace not found', workspacePath: workspaceDir || '' }, { status: 404 })
  }

  fileCount = 0
  const tree = await buildTree(workspaceDir, '', 0)

  return NextResponse.json({
    workspacePath: workspaceDir.replace(/\\/g, '/'),
    tree,
    fileCount,
    truncated: fileCount > MAX_FILES,
  })
}
