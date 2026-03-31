'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark-dimmed.css'

interface FileNode {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
  children?: FileNode[]
}

// --- File type classification ---

const CODE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.cs',
  '.rb', '.php', '.swift', '.kt', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.r', '.lua',
  '.scala', '.ex', '.exs', '.erl', '.hs', '.ml', '.clj', '.dart', '.zig', '.v', '.nim',
])

const MARKUP_EXTENSIONS = new Set([
  '.xml', '.yaml', '.yml', '.toml', '.ini', '.env', '.cfg', '.conf',
  '.dockerfile', '.gitignore', '.dockerignore', '.editorconfig',
])

const DATA_EXTENSIONS = new Set(['.json', '.jsonl', '.csv', '.tsv'])
const TEXT_EXTENSIONS = new Set(['.txt', '.log', '.out', '.diff', '.patch'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a'])
const PDF_EXTENSIONS = new Set(['.pdf'])
const OFFICE_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt'])

const NAMES_AS_CODE = new Set([
  'Makefile', 'Dockerfile', 'Containerfile', 'Vagrantfile', 'Procfile',
  'Gemfile', 'Rakefile', 'Justfile', 'Brewfile',
])

type FileCategory = 'markdown' | 'code' | 'data' | 'text' | 'image' | 'video' | 'audio' | 'pdf' | 'html' | 'office' | 'unknown'

function getFileCategory(name: string): FileCategory {
  if (name.endsWith('.md') || name.endsWith('.mdx')) return 'markdown'
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html'

  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : ''

  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (MARKUP_EXTENSIONS.has(ext)) return 'code'
  if (DATA_EXTENSIONS.has(ext)) return 'data'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (PDF_EXTENSIONS.has(ext)) return 'pdf'
  if (OFFICE_EXTENSIONS.has(ext)) return 'office'
  if (NAMES_AS_CODE.has(name)) return 'code'

  // No extension — try as text
  if (!ext) return 'text'
  return 'unknown'
}

function fileIcon(name: string): string {
  const cat = getFileCategory(name)
  switch (cat) {
    case 'markdown': return '\u00b6'
    case 'code': return '>'
    case 'data': return '{}'
    case 'text': return '|'
    case 'image': return '\u25a3'
    case 'video': return '\u25b6'
    case 'audio': return '\u266b'
    case 'pdf': return '\u25a0'
    case 'html': return '<>'
    case 'office': return '\u25a1'
    default: return '~'
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce((acc, n) => n.type === 'file' ? acc + 1 : acc + countFiles(n.children || []), 0)
}

function totalSize(nodes: FileNode[]): number {
  return nodes.reduce((acc, n) => n.type === 'file' ? acc + (n.size || 0) : acc + totalSize(n.children || []), 0)
}

function langFromExt(name: string): string | undefined {
  const dotIdx = name.lastIndexOf('.')
  if (dotIdx < 0) return undefined
  const ext = name.slice(dotIdx + 1).toLowerCase()
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    go: 'go', rs: 'rust', java: 'java', c: 'c', cpp: 'cpp', h: 'c', cs: 'csharp',
    rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', sql: 'sql',
    sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    html: 'html', htm: 'html', css: 'css', scss: 'scss',
    r: 'r', lua: 'lua', scala: 'scala', dart: 'dart',
    dockerfile: 'dockerfile', makefile: 'makefile',
  }
  return map[ext]
}

// --- Components ---

function FileTree({
  nodes,
  selectedPath,
  onSelect,
  expandedDirs,
  toggleDir,
}: {
  nodes: FileNode[]
  selectedPath: string | null
  onSelect: (node: FileNode) => void
  expandedDirs: Set<string>
  toggleDir: (path: string) => void
}) {
  return (
    <ul className="text-xs font-mono">
      {nodes.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expandedDirs={expandedDirs}
          toggleDir={toggleDir}
        />
      ))}
    </ul>
  )
}

function FileTreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  expandedDirs,
  toggleDir,
}: {
  node: FileNode
  depth: number
  selectedPath: string | null
  onSelect: (node: FileNode) => void
  expandedDirs: Set<string>
  toggleDir: (path: string) => void
}) {
  const isDir = node.type === 'directory'
  const isExpanded = expandedDirs.has(node.path)
  const isSelected = selectedPath === node.path

  return (
    <li>
      <button
        className={`w-full text-left px-2 py-0.5 flex items-center gap-1.5 rounded-sm transition-colors duration-100 hover:bg-secondary/60 ${isSelected ? 'bg-primary/15 text-primary' : 'text-foreground/80'}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => {
          if (isDir) toggleDir(node.path)
          else onSelect(node)
        }}
      >
        {isDir ? (
          <span className="w-3 text-center text-muted-foreground text-[10px]">{isExpanded ? '\u25BE' : '\u25B8'}</span>
        ) : (
          <span className="w-3 text-center text-muted-foreground/60 text-[10px]">{fileIcon(node.name)}</span>
        )}
        <span className={`truncate ${isDir ? 'text-cyan-400/90' : ''}`}>{node.name}{isDir ? '/' : ''}</span>
        {!isDir && node.size != null && (
          <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums flex-shrink-0">{formatSize(node.size)}</span>
        )}
      </button>
      {isDir && isExpanded && node.children && (
        <ul>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedDirs={expandedDirs}
              toggleDir={toggleDir}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function CodePreview({ content, fileName }: { content: string; fileName: string }) {
  const lang = langFromExt(fileName)
  const lines = content.split('\n')
  return (
    <div className="relative">
      <div className="flex text-xs font-mono leading-relaxed">
        <div className="select-none pr-3 text-right text-muted-foreground/30 border-r border-border/30 flex-shrink-0">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="pl-3 overflow-x-auto flex-1">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >{`\`\`\`${lang || ''}\n${content}\n\`\`\``}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-base max-w-none px-6 py-6 leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:border-b [&_h2]:border-border/20 [&_h2]:pb-2 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:mb-3 [&_p]:leading-7 [&_li]:mb-1 [&_li]:leading-7 [&_ul]:mb-4 [&_ol]:mb-4 [&_pre]:bg-surface-1 [&_pre]:border [&_pre]:border-border/30 [&_pre]:rounded-md [&_pre]:my-4 [&_pre]:p-4 [&_code]:text-cyan-300/90 [&_:not(pre)>code]:bg-surface-1 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:text-sm [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_table]:text-sm [&_table]:my-4 [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_tr]:border-b [&_tr]:border-border/20 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_hr]:my-6 [&_hr]:border-border/30 [&_strong]:text-foreground [&_img]:rounded-md [&_img]:my-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function FilePreview({ file, workspacePath }: { file: FileNode; workspacePath: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [htmlMode, setHtmlMode] = useState<'source' | 'render'>('source')
  const t = useTranslations('workspaceExplorer')

  const category = getFileCategory(file.name)
  const isTextual = category === 'markdown' || category === 'code' || category === 'data' || category === 'text' || category === 'html'

  useEffect(() => {
    if (!isTextual) return
    setLoading(true)
    setError(null)
    setContent(null)
    fetch(`/api/workspace-files/content?path=${encodeURIComponent(file.path)}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then(data => setContent(data.content))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [file.path, isTextual])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader /></div>
  if (error) return <div className="text-red-400 text-sm p-4">{t('loadError')}: {error}</div>

  const previewUrl = `/api/workspace-files/preview?path=${encodeURIComponent(file.path)}`

  switch (category) {
    case 'markdown':
      return content != null ? <MarkdownPreview content={content} /> : null

    case 'code':
    case 'data':
    case 'text':
      return content != null ? (
        <div className="p-3 overflow-auto">
          <CodePreview content={content} fileName={file.name} />
        </div>
      ) : null

    case 'html':
      return content != null ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30">
            <button
              onClick={() => setHtmlMode('source')}
              className={`px-2 py-0.5 text-xs rounded ${htmlMode === 'source' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t('source')}
            </button>
            <button
              onClick={() => setHtmlMode('render')}
              className={`px-2 py-0.5 text-xs rounded ${htmlMode === 'render' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t('render')}
            </button>
          </div>
          {htmlMode === 'source' ? (
            <div className="p-3 overflow-auto flex-1">
              <CodePreview content={content} fileName={file.name} />
            </div>
          ) : (
            <iframe
              srcDoc={content}
              sandbox="allow-same-origin"
              className="flex-1 w-full bg-white rounded-b"
              title={file.name}
            />
          )}
        </div>
      ) : null

    case 'image':
      return (
        <div className="flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={file.name} className="max-w-full max-h-[70vh] rounded border border-border/20 object-contain" />
        </div>
      )

    case 'video':
      return (
        <div className="flex items-center justify-center p-4">
          <video src={previewUrl} controls className="max-w-full max-h-[70vh] rounded border border-border/20" />
        </div>
      )

    case 'audio':
      return (
        <div className="flex flex-col items-center justify-center p-8 gap-4">
          <div className="text-4xl text-muted-foreground">{'\u266b'}</div>
          <p className="text-sm text-foreground/80">{file.name}</p>
          <audio src={previewUrl} controls className="w-full max-w-md" />
        </div>
      )

    case 'pdf':
      return (
        <embed src={previewUrl} type="application/pdf" className="w-full h-full min-h-[70vh] rounded" />
      )

    case 'office':
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="text-3xl text-muted-foreground">{'\u25a1'}</div>
          <p className="text-sm text-foreground/80">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatSize(file.size || 0)}</p>
          <a href={previewUrl} download={file.name}>
            <Button variant="outline" size="sm">{t('download')}</Button>
          </a>
        </div>
      )

    default:
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="text-3xl text-muted-foreground">~</div>
          <p className="text-sm text-foreground/80">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatSize(file.size || 0)}</p>
          <a href={previewUrl} download={file.name}>
            <Button variant="outline" size="sm">{t('download')}</Button>
          </a>
        </div>
      )
  }
}

// --- Main Panel ---

export function WorkspaceExplorerPanel() {
  const t = useTranslations('workspaceExplorer')
  const [tree, setTree] = useState<FileNode[]>([])
  const [workspacePath, setWorkspacePath] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [lastSync, setLastSync] = useState<number>(Date.now())
  const [searchQuery, setSearchQuery] = useState('')
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace-files')
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setTree(data.tree)
      setWorkspacePath(data.workspacePath)
      setLastSync(Date.now())
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTree()
    // Auto-sync every 15 seconds
    syncIntervalRef.current = setInterval(fetchTree, 15_000)
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current) }
  }, [fetchTree])

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(workspacePath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard may fail in non-secure context */ }
  }, [workspacePath])

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleSelectFile = useCallback((node: FileNode) => {
    setSelectedFile(node)
  }, [])

  // Filter tree by search
  const filterTree = useCallback((nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes
    const q = query.toLowerCase()
    return nodes.reduce<FileNode[]>((acc, node) => {
      if (node.type === 'file') {
        if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
          acc.push(node)
        }
      } else {
        const filteredChildren = filterTree(node.children || [], query)
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
          acc.push({ ...node, children: filteredChildren })
        }
      }
      return acc
    }, [])
  }, [])

  const filteredTree = searchQuery ? filterTree(tree, searchQuery) : tree

  const timeSinceSync = Math.floor((Date.now() - lastSync) / 1000)
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const t = setInterval(() => forceUpdate(v => v + 1), 5000)
    return () => clearInterval(t)
  }, [])

  if (loading) return <div className="flex items-center justify-center py-24"><Loader /></div>

  if (error && tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-sm text-muted-foreground">{t('workspaceNotFound')}</p>
        <p className="text-xs text-muted-foreground/60">{workspacePath || t('notConfigured')}</p>
        <Button variant="outline" size="sm" onClick={fetchTree}>{t('retry')}</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 flex-shrink-0">
        <span className="text-xs text-muted-foreground/60 mr-1">{'\u{1F4C1}'}</span>
        <code className="text-xs text-foreground/70 font-mono truncate flex-1" title={workspacePath}>
          {workspacePath}
        </code>
        <button
          onClick={handleCopyPath}
          className="text-xs px-2 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          title={t('copyPath')}
        >
          {copied ? '\u2713' : t('copy')}
        </button>
        <button
          onClick={() => { setLoading(true); fetchTree() }}
          className="text-xs px-2 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          title={t('sync')}
        >
          {'\u21BB'}
        </button>
      </div>

      {/* Main content: split view */}
      <div className="flex flex-1 min-h-0">
        {/* Left: file tree */}
        <div className="w-64 xl:w-72 flex-shrink-0 border-r border-border/30 flex flex-col">
          {/* Search */}
          <div className="px-2 py-1.5 border-b border-border/20">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('searchFiles')}
              className="w-full bg-transparent border border-border/30 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
            />
          </div>
          {/* Tree */}
          <div className="flex-1 overflow-auto py-1">
            <FileTree
              nodes={filteredTree}
              selectedPath={selectedFile?.path || null}
              onSelect={handleSelectFile}
              expandedDirs={expandedDirs}
              toggleDir={toggleDir}
            />
          </div>
        </div>

        {/* Right: preview */}
        <div className="flex-1 min-w-0 overflow-auto">
          {selectedFile ? (
            <div className="flex flex-col h-full">
              {/* File header */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20 flex-shrink-0">
                <span className="text-xs text-muted-foreground/50">{fileIcon(selectedFile.name)}</span>
                <span className="text-xs font-mono text-foreground/80 truncate">{selectedFile.path}</span>
                {selectedFile.size != null && (
                  <span className="text-[10px] text-muted-foreground/40 ml-auto tabular-nums">{formatSize(selectedFile.size)}</span>
                )}
                <span className="text-[10px] bg-amber-500/10 text-amber-400/80 px-1.5 py-0.5 rounded">{t('readOnly')}</span>
              </div>
              {/* Preview content */}
              <div className="flex-1 overflow-auto">
                <FilePreview file={selectedFile} workspacePath={workspacePath} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
              <div className="text-3xl mb-3">{'\u{1F4C2}'}</div>
              <p className="text-sm">{t('selectFile')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border/30 text-[10px] text-muted-foreground/50 flex-shrink-0">
        <span>{countFiles(tree)} {t('files')}</span>
        <span>{'\u00b7'}</span>
        <span>{formatSize(totalSize(tree))}</span>
        <span>{'\u00b7'}</span>
        <span>{t('lastSync')} {timeSinceSync < 5 ? t('justNow') : `${timeSinceSync}s ${t('ago')}`}</span>
      </div>
    </div>
  )
}
