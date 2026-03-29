import { NextRequest, NextResponse } from 'next/server'
import { readdir, readFile, stat, writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import { join, dirname, posix } from 'path'
import { db_helpers, getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { validateSchema, extractWikiLinks } from '@/lib/memory-utils'
import { MEMORY_PATH, MEMORY_ALLOWED_PREFIXES, isPathAllowed, resolveSafeMemoryPath } from '@/lib/memory-path'
import { searchMemory, indexFile, removeFromIndex } from '@/lib/memory-search'

// Ensure memory directory exists on startup
if (MEMORY_PATH && !existsSync(MEMORY_PATH)) {
  try { mkdirSync(MEMORY_PATH, { recursive: true }) } catch { /* ignore */ }
}

/** Check if local memory directory is usable */
function hasLocalMemory(): boolean {
  return Boolean(MEMORY_PATH && existsSync(MEMORY_PATH))
}

// ---------------------------------------------------------------------------
// Cache fallback helpers (when local filesystem is unavailable, e.g. GCP)
// ---------------------------------------------------------------------------

interface CachedFile {
  file_path: string
  content: string
  size: number
  modified: number
}

function getCachedFileTree(workspaceId: number): MemoryFile[] {
  try {
    const db = getDatabase()
    const rows = db.prepare(
      'SELECT file_path, size, modified FROM memory_files_cache WHERE workspace_id = ? ORDER BY file_path'
    ).all(workspaceId) as Array<{ file_path: string; size: number; modified: number }>

    if (rows.length === 0) return []

    // Build tree from flat file paths
    const root: MemoryFile[] = []
    const dirs = new Map<string, MemoryFile>()

    for (const row of rows) {
      const parts = row.file_path.replace(/\\/g, '/').split('/')
      const fileName = parts[parts.length - 1]

      // Ensure parent directories exist
      let currentChildren = root
      for (let i = 0; i < parts.length - 1; i++) {
        const dirPath = parts.slice(0, i + 1).join('/')
        let dir = dirs.get(dirPath)
        if (!dir) {
          dir = { path: dirPath, name: parts[i], type: 'directory', children: [] }
          dirs.set(dirPath, dir)
          currentChildren.push(dir)
        }
        currentChildren = dir.children!
      }

      currentChildren.push({
        path: row.file_path.replace(/\\/g, '/'),
        name: fileName,
        type: 'file',
        size: row.size,
        modified: row.modified,
      })
    }

    return root
  } catch (err) {
    logger.warn({ err }, 'Failed to build cached file tree')
    return []
  }
}

function getCachedFileContent(workspaceId: number, filePath: string): CachedFile | null {
  try {
    const db = getDatabase()
    return db.prepare(
      'SELECT file_path, content, size, modified FROM memory_files_cache WHERE workspace_id = ? AND file_path = ?'
    ).get(workspaceId, filePath) as CachedFile | null
  } catch {
    return null
  }
}

function searchCachedFiles(workspaceId: number, query: string): any {
  try {
    const db = getDatabase()
    const queryLower = query.toLowerCase()
    const rows = db.prepare(
      'SELECT file_path, content, size, modified FROM memory_files_cache WHERE workspace_id = ?'
    ).all(workspaceId) as CachedFile[]

    const results = rows
      .filter(r => r.content.toLowerCase().includes(queryLower) || r.file_path.toLowerCase().includes(queryLower))
      .map(r => {
        const idx = r.content.toLowerCase().indexOf(queryLower)
        const snippetStart = Math.max(0, idx - 60)
        const snippetEnd = Math.min(r.content.length, idx + query.length + 60)
        return {
          path: r.file_path,
          snippet: r.content.slice(snippetStart, snippetEnd),
          score: idx >= 0 ? 1 : 0.5,
        }
      })
      .slice(0, 20)

    return { query, results, cached: true }
  } catch {
    return { query, results: [] }
  }
}

interface MemoryFile {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
  children?: MemoryFile[]
}

async function buildFileTree(
  dirPath: string,
  relativePath: string = '',
  maxDepth: number = Number.POSITIVE_INFINITY,
): Promise<MemoryFile[]> {
  try {
    const items = await readdir(dirPath, { withFileTypes: true })
    const files: MemoryFile[] = []

    for (const item of items) {
      if (item.isSymbolicLink()) {
        continue
      }
      const itemPath = join(dirPath, item.name)
      const itemRelativePath = join(relativePath, item.name)
      
      try {
        const stats = await stat(itemPath)
        
        if (item.isDirectory()) {
          const children =
            maxDepth > 0
              ? await buildFileTree(itemPath, itemRelativePath, maxDepth - 1)
              : undefined
          files.push({
            path: itemRelativePath,
            name: item.name,
            type: 'directory',
            modified: stats.mtime.getTime(),
            children
          })
        } else if (item.isFile()) {
          files.push({
            path: itemRelativePath,
            name: item.name,
            type: 'file',
            size: stats.size,
            modified: stats.mtime.getTime()
          })
        }
      } catch (error) {
        logger.error({ err: error, path: itemPath }, 'Error reading file')
      }
    }

    return files.sort((a, b) => {
      // Directories first, then files, alphabetical within each type
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  } catch (error) {
    logger.error({ err: error, path: dirPath }, 'Error reading directory')
    return []
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path')
    const action = searchParams.get('action')
    const depthParam = Number.parseInt(searchParams.get('depth') || '', 10)
    const maxDepth = Number.isFinite(depthParam) ? Math.max(0, Math.min(depthParam, 8)) : Number.POSITIVE_INFINITY

    if (action === 'tree') {
      // Fallback to cache when local memory is unavailable (e.g. GCP deploy)
      if (!hasLocalMemory()) {
        const workspaceId = auth.user.workspace_id ?? 1
        const tree = getCachedFileTree(workspaceId)
        return NextResponse.json({ tree, cached: true })
      }
      if (!MEMORY_PATH) {
        return NextResponse.json({ tree: [] })
      }
      if (path) {
        if (!isPathAllowed(path)) {
          return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
        }
        const fullPath = await resolveSafeMemoryPath(MEMORY_PATH, path)
        const stats = await stat(fullPath).catch(() => null)
        if (!stats?.isDirectory()) {
          return NextResponse.json({ error: 'Directory not found' }, { status: 404 })
        }
        const tree = await buildFileTree(fullPath, path, maxDepth)
        return NextResponse.json({ tree })
      }
      if (MEMORY_ALLOWED_PREFIXES.length) {
        const tree: MemoryFile[] = []
        for (const prefix of MEMORY_ALLOWED_PREFIXES) {
          const folder = prefix.replace(/\/$/, '')
          const fullPath = join(MEMORY_PATH, folder)
          if (!existsSync(fullPath)) continue
          try {
            const stats = await stat(fullPath)
            if (!stats.isDirectory()) continue
            tree.push({
              path: folder,
              name: folder,
              type: 'directory',
              modified: stats.mtime.getTime(),
              children: await buildFileTree(fullPath, folder, maxDepth),
            })
          } catch {
            // Skip unreadable roots
          }
        }
        return NextResponse.json({ tree })
      }
      const tree = await buildFileTree(MEMORY_PATH, '', maxDepth)
      return NextResponse.json({ tree })
    }

    if (action === 'content' && path) {
      // Fallback to cache when local memory is unavailable
      if (!hasLocalMemory()) {
        const workspaceId = auth.user.workspace_id ?? 1
        const cached = getCachedFileContent(workspaceId, path)
        if (cached) {
          const isMarkdown = path.endsWith('.md')
          const wikiLinks = isMarkdown ? extractWikiLinks(cached.content) : []
          const schemaResult = isMarkdown ? validateSchema(cached.content) : null
          return NextResponse.json({
            content: cached.content,
            size: cached.size,
            modified: cached.modified,
            path,
            wikiLinks,
            schema: schemaResult,
            cached: true,
          })
        }
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }

      // Return file content from local filesystem
      if (!isPathAllowed(path)) {
        return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
      }
      if (!MEMORY_PATH) {
        return NextResponse.json({ error: 'Memory directory not configured' }, { status: 500 })
      }
      const fullPath = await resolveSafeMemoryPath(MEMORY_PATH, path)

      try {
        const content = await readFile(fullPath, 'utf-8')
        const stats = await stat(fullPath)

        // Extract wiki-links and schema validation for .md files
        const isMarkdown = path.endsWith('.md')
        const wikiLinks = isMarkdown ? extractWikiLinks(content) : []
        const schemaResult = isMarkdown ? validateSchema(content) : null

        return NextResponse.json({
          content,
          size: stats.size,
          modified: stats.mtime.getTime(),
          path,
          wikiLinks,
          schema: schemaResult,
        })
      } catch (error) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
    }

    if (action === 'search') {
      const query = searchParams.get('query')
      if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 })
      }

      // Fallback to cache search
      if (!hasLocalMemory()) {
        const workspaceId = auth.user.workspace_id ?? 1
        return NextResponse.json(searchCachedFiles(workspaceId, query))
      }

      if (!MEMORY_PATH) {
        return NextResponse.json({ query, results: [] })
      }

      // FTS5-powered full-text search with BM25 ranking and snippets
      const response = await searchMemory(MEMORY_PATH, MEMORY_ALLOWED_PREFIXES, query)
      return NextResponse.json(response)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Memory API error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const body = await request.json()
    const { action, path, content } = body

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 })
    }
    if (!isPathAllowed(path)) {
      return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
    }

    if (!MEMORY_PATH) {
      return NextResponse.json({ error: 'Memory directory not configured' }, { status: 500 })
    }
    const fullPath = await resolveSafeMemoryPath(MEMORY_PATH, path)

    if (action === 'save') {
      // Save file content
      if (content === undefined) {
        return NextResponse.json({ error: 'Content is required for save action' }, { status: 400 })
      }

      // Validate schema if present (warn but don't block save)
      const schemaResult = path.endsWith('.md') ? validateSchema(content) : null
      const schemaWarnings = schemaResult?.errors ?? []

      await writeFile(fullPath, content, 'utf-8')
      // Incrementally update FTS index
      try { indexFile(getDatabase(), MEMORY_PATH, path) } catch { /* best-effort */ }
      try {
        db_helpers.logActivity('memory_file_saved', 'memory', 0, auth.user.username || 'unknown', `Updated ${path}`, { path, size: content.length })
      } catch { /* best-effort */ }
      return NextResponse.json({
        success: true,
        message: 'File saved successfully',
        schemaWarnings,
      })
    }

    if (action === 'create') {
      // Create new file
      const dirPath = dirname(fullPath)
      
      // Ensure directory exists
      try {
        await mkdir(dirPath, { recursive: true })
      } catch (error) {
        // Directory might already exist
      }

      // Check if file already exists
      try {
        await stat(fullPath)
        return NextResponse.json({ error: 'File already exists' }, { status: 409 })
      } catch (error) {
        // File doesn't exist, which is what we want
      }

      await writeFile(fullPath, content || '', 'utf-8')
      try { indexFile(getDatabase(), MEMORY_PATH, path) } catch { /* best-effort */ }
      try {
        db_helpers.logActivity('memory_file_created', 'memory', 0, auth.user.username || 'unknown', `Created ${path}`, { path })
      } catch { /* best-effort */ }
      return NextResponse.json({ success: true, message: 'File created successfully' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Memory POST API error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const body = await request.json()
    const { action, path } = body

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 })
    }
    if (!isPathAllowed(path)) {
      return NextResponse.json({ error: 'Path not allowed' }, { status: 403 })
    }

    if (!MEMORY_PATH) {
      return NextResponse.json({ error: 'Memory directory not configured' }, { status: 500 })
    }
    const fullPath = await resolveSafeMemoryPath(MEMORY_PATH, path)

    if (action === 'delete') {
      // Check if file exists
      try {
        await stat(fullPath)
      } catch (error) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }

      await unlink(fullPath)
      try { removeFromIndex(getDatabase(), path) } catch { /* best-effort */ }
      try {
        db_helpers.logActivity('memory_file_deleted', 'memory', 0, auth.user.username || 'unknown', `Deleted ${path}`, { path })
      } catch { /* best-effort */ }
      return NextResponse.json({ success: true, message: 'File deleted successfully' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Memory DELETE API error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
