'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ─── Types ───

interface Task {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to: string | null
  team: string | null
  parent_task_id: number | null
  blocked_by: string
  outcome: string | null
  resolution: string | null
  error_message: string | null
  created_at: number
  updated_at: number
  ticket_ref?: string
}

interface TreeNode {
  task: Task
  children: TreeNode[]
}

interface AgentInfo {
  name: string
  status: string
  working_memory: string | null
  runtime: string
}

// ─── Status config ───

const STATUS = {
  inbox:          { icon: '○', color: 'text-zinc-500',    bg: 'bg-zinc-500/10',    label: 'Inbox' },
  assigned:       { icon: '◔', color: 'text-cyan-400',    bg: 'bg-cyan-400/10',    label: 'Assigned' },
  in_progress:    { icon: '●', color: 'text-amber-400',   bg: 'bg-amber-400/15',   label: 'Running', pulse: true },
  review:         { icon: '◑', color: 'text-purple-400',  bg: 'bg-purple-400/10',  label: 'Review' },
  quality_review: { icon: '◕', color: 'text-purple-400',  bg: 'bg-purple-400/10',  label: 'QA Review' },
  awaiting_owner: { icon: '⏸', color: 'text-blue-400',    bg: 'bg-blue-400/10',    label: 'Awaiting' },
  done:           { icon: '✓', color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Done' },
  failed:         { icon: '✗', color: 'text-red-400',     bg: 'bg-red-400/10',     label: 'Failed' },
} as Record<string, { icon: string; color: string; bg: string; label: string; pulse?: boolean }>

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'border-l-red-500',
  urgent: 'border-l-red-500',
  high: 'border-l-orange-400',
  medium: 'border-l-blue-400',
  low: 'border-l-zinc-500',
}

const RUNTIME_BADGE: Record<string, { label: string; color: string }> = {
  'claude-code':   { label: 'CODE', color: 'bg-green-500/20 text-green-400' },
  'claude-mcp':    { label: 'MCP',  color: 'bg-blue-500/20 text-blue-400' },
  'claude-browse': { label: 'WEB',  color: 'bg-purple-500/20 text-purple-400' },
  'claude-write':  { label: 'WRITE', color: 'bg-amber-500/20 text-amber-400' },
  'gemini':        { label: 'GEM',  color: 'bg-zinc-500/20 text-zinc-400' },
}

// ─── Helpers ───

function buildForest(tasks: Task[]): TreeNode[] {
  const map = new Map<number, TreeNode>()
  const roots: TreeNode[] = []
  for (const t of tasks) map.set(t.id, { task: t, children: [] })
  for (const t of tasks) {
    const node = map.get(t.id)!
    if (t.parent_task_id && map.has(t.parent_task_id)) {
      map.get(t.parent_task_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  roots.sort((a, b) => b.task.created_at - a.task.created_at)
  const sortKids = (n: TreeNode) => { n.children.sort((a, b) => a.task.id - b.task.id); n.children.forEach(sortKids) }
  roots.forEach(sortKids)
  return roots
}

function isBlocked(task: Task, allTasks: Task[]): boolean {
  try {
    const ids: number[] = JSON.parse(task.blocked_by || '[]')
    if (ids.length === 0) return false
    return ids.some(id => {
      const dep = allTasks.find(t => t.id === id)
      return dep && dep.status !== 'done'
    })
  } catch { return false }
}

function getProgress(node: TreeNode): { done: number; total: number } {
  let d = 0, t = 0
  for (const c of node.children) {
    t++; if (c.task.status === 'done') d++
    const sub = getProgress(c); d += sub.done; t += sub.total
  }
  return { done: d, total: t }
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  return Math.floor(diff / 86400) + 'd ago'
}

// ─── Status Pill ───

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS[status] || STATUS.inbox
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
      <span className={cfg.pulse ? 'animate-pulse' : ''}>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

// ─── Progress Bar ───

function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return null
  const pct = Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-zinc-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-cyan-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{done}/{total}</span>
    </div>
  )
}

// ─── Tree Node ───

function TaskNode({
  node, agents, allTasks, expanded, onToggle, onSelect, selectedId, depth = 0,
}: {
  node: TreeNode; agents: AgentInfo[]; allTasks: Task[]
  expanded: Set<number>; onToggle: (id: number) => void
  onSelect: (t: Task) => void; selectedId: number | null; depth?: number
}) {
  const { task, children } = node
  const hasKids = children.length > 0
  const isOpen = expanded.has(task.id)
  const blocked = isBlocked(task, allTasks)
  const agent = agents.find(a => a.name === task.assigned_to)
  const progress = hasKids ? getProgress(node) : null
  const cfg = STATUS[task.status] || STATUS.inbox
  const rtBadge = agent?.runtime ? RUNTIME_BADGE[agent.runtime] : null
  const isSelected = selectedId === task.id

  return (
    <>
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 transition-all duration-150 ${
          PRIORITY_COLOR[task.priority] || 'border-l-zinc-600'
        } ${isSelected ? 'bg-primary/8 border-l-primary' : 'hover:bg-card/60'} ${
          blocked ? 'opacity-40' : ''
        }`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => onSelect(task)}
      >
        {/* Expand toggle */}
        <button
          className={`w-5 h-5 flex items-center justify-center rounded text-[11px] shrink-0 transition-transform ${
            hasKids ? 'text-muted-foreground hover:text-foreground hover:bg-card' : 'text-transparent'
          } ${isOpen ? 'rotate-0' : '-rotate-90'}`}
          onClick={(e) => { e.stopPropagation(); if (hasKids) onToggle(task.id) }}
        >
          {hasKids ? '▾' : '·'}
        </button>

        {/* Status indicator */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${cfg.bg} ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`}>
          {cfg.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium truncate ${task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {task.title}
            </span>
            {task.ticket_ref && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono shrink-0">{task.ticket_ref}</span>
            )}
            {blocked && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">blocked</span>
            )}
            {task.team && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/80 shrink-0">{task.team}</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {/* Agent + status dot */}
            {task.assigned_to && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  task.status === 'in_progress' ? 'bg-amber-400 animate-pulse' :
                  task.status === 'done' ? 'bg-emerald-400' :
                  agent?.status === 'idle' || agent?.status === 'online' ? 'bg-emerald-400' : 'bg-zinc-500'
                }`} />
                {task.assigned_to}
              </span>
            )}

            {/* Runtime badge */}
            {rtBadge && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${rtBadge.color}`}>{rtBadge.label}</span>
            )}

            {/* Progress */}
            {progress && progress.total > 0 && <ProgressBar done={progress.done} total={progress.total} />}

            {/* Time */}
            <span className="text-[10px] text-muted-foreground/50">{timeAgo(task.updated_at)}</span>
          </div>
        </div>
      </div>

      {/* Children */}
      {isOpen && children.map(c => (
        <TaskNode
          key={c.task.id} node={c} agents={agents} allTasks={allTasks}
          expanded={expanded} onToggle={onToggle} onSelect={onSelect}
          selectedId={selectedId} depth={depth + 1}
        />
      ))}
    </>
  )
}

// ─── Detail Panel ───

function TaskDetail({ task, agents, allTasks, onClose }: { task: Task; agents: AgentInfo[]; allTasks: Task[]; onClose: () => void }) {
  const [comments, setComments] = useState<any[]>([])
  const agent = agents.find(a => a.name === task.assigned_to)
  const cfg = STATUS[task.status] || STATUS.inbox
  const rtBadge = agent?.runtime ? RUNTIME_BADGE[agent.runtime] : null

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/comments`).then(r => r.json()).then(d => setComments(d.comments || [])).catch(() => {})
  }, [task.id])

  let blockedByNames: string[] = []
  try {
    const ids: number[] = JSON.parse(task.blocked_by || '[]')
    blockedByNames = ids.map(id => {
      const dep = allTasks.find(t => t.id === id)
      return dep ? `#${id} ${dep.title.slice(0, 25)}` : `#${id}`
    })
  } catch {}

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border/30 gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground leading-tight">{task.title}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusPill status={task.status} />
            {task.ticket_ref && <span className="text-[10px] font-mono text-primary">{task.ticket_ref}</span>}
            {task.team && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{task.team}</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none p-1">×</button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Agent</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${task.status === 'in_progress' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-500'}`} />
              <span className="text-foreground font-medium">{task.assigned_to || '—'}</span>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Priority</span>
            <div className={`mt-0.5 font-medium ${task.priority === 'high' || task.priority === 'critical' ? 'text-orange-400' : 'text-foreground'}`}>
              {task.priority}
            </div>
          </div>
          {rtBadge && (
            <div>
              <span className="text-muted-foreground text-xs">Runtime</span>
              <div className="mt-0.5"><span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${rtBadge.color}`}>{rtBadge.label} — {agent?.runtime}</span></div>
            </div>
          )}
          {blockedByNames.length > 0 && (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">Blocked by</span>
              <div className="mt-0.5 text-amber-400 text-xs">{blockedByNames.join(' → ')}</div>
            </div>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1">Description</h4>
            <div className="text-sm text-foreground/80 whitespace-pre-wrap bg-card/50 rounded-lg p-3 border border-border/20">{task.description}</div>
          </div>
        )}

        {/* Result */}
        {(task.resolution || task.outcome) && (
          <div>
            <h4 className="text-xs font-semibold text-emerald-400 mb-1">Result</h4>
            <div className="text-sm text-foreground/80 whitespace-pre-wrap bg-emerald-500/5 rounded-lg p-3 border border-emerald-500/20">{task.resolution || task.outcome}</div>
          </div>
        )}

        {/* Error */}
        {task.error_message && (
          <div>
            <h4 className="text-xs font-semibold text-red-400 mb-1">Error</h4>
            <div className="text-sm text-red-300/80 whitespace-pre-wrap bg-red-500/5 rounded-lg p-3 border border-red-500/20">{task.error_message}</div>
          </div>
        )}

        {/* Working Memory */}
        {agent?.working_memory && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1">Working Memory</h4>
            <div className="text-sm text-foreground/60 whitespace-pre-wrap bg-card/50 rounded-lg p-3 border border-border/20 italic">{agent.working_memory}</div>
          </div>
        )}

        {/* Comments */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Activity ({comments.length})</h4>
          <div className="space-y-2">
            {comments.length === 0 && <p className="text-xs text-muted-foreground/50 italic">No activity yet</p>}
            {comments.map((c: any) => (
              <div key={c.id} className="rounded-lg border border-border/20 overflow-hidden">
                <div className="flex justify-between items-center px-3 py-1.5 bg-card/30">
                  <span className="text-[11px] font-medium text-foreground">{c.author}</span>
                  <span className="text-[10px] text-muted-foreground/50">{timeAgo(c.created_at)}</span>
                </div>
                <div className="px-3 py-2 text-xs text-foreground/70 whitespace-pre-wrap break-words">{c.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main ───

export function TaskTreePanel() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [tr, ar] = await Promise.all([fetch('/api/tasks?limit=200'), fetch('/api/agents?limit=100')])
      const td = await tr.json(), ad = await ar.json()
      const taskList = td.tasks || []
      setTasks(taskList)
      setAgents((ad.agents || []).map((a: any) => ({ name: a.name, status: a.status, working_memory: a.working_memory, runtime: a.runtime || 'claude-mcp' })))

      // Auto-expand roots
      setExpanded(prev => {
        const next = new Set(prev)
        for (const t of taskList) { if (!t.parent_task_id) next.add(t.id) }
        return next
      })
      setLoading(false)
    } catch { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { const t = setInterval(fetchData, 5000); return () => clearInterval(t) }, [fetchData])

  const forest = useMemo(() => buildForest(tasks), [tasks])
  const roots = useMemo(() => forest.filter(n => n.children.length > 0 || !['done'].includes(n.task.status)), [forest])

  const toggle = (id: number) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Summary stats
  const stats = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter(t => t.status === 'done').length
    const running = tasks.filter(t => t.status === 'in_progress').length
    const blocked = tasks.filter(t => isBlocked(t, tasks)).length
    return { total, done, running, blocked }
  }, [tasks])

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
  if (tasks.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
      <span className="text-3xl">🌳</span>
      <span className="text-sm">No tasks yet</span>
      <span className="text-xs text-muted-foreground/50">Create a task to see the tree view</span>
    </div>
  )

  return (
    <div className="flex h-full">
      {/* Tree */}
      <div className={`${selected ? 'w-1/2 lg:w-3/5' : 'w-full'} flex flex-col overflow-hidden transition-all`}>
        {/* Stats bar */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border/30 bg-background/95 backdrop-blur-sm shrink-0">
          <h3 className="text-sm font-semibold text-foreground">Task Trees ({roots.length})</h3>
          <div className="flex items-center gap-3 text-[10px]">
            {stats.running > 0 && <span className="text-amber-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />{stats.running} running</span>}
            {stats.blocked > 0 && <span className="text-amber-500/70">{stats.blocked} blocked</span>}
            <span className="text-muted-foreground">{stats.done}/{stats.total} done</span>
          </div>
        </div>

        {/* Tree list */}
        <div className="flex-1 overflow-y-auto">
          {roots.map(node => (
            <TaskNode
              key={node.task.id} node={node} agents={agents} allTasks={tasks}
              expanded={expanded} onToggle={toggle} onSelect={setSelected}
              selectedId={selected?.id ?? null}
            />
          ))}
        </div>
      </div>

      {/* Detail sidebar */}
      {selected && (
        <div className="w-1/2 lg:w-2/5 border-l border-border/30 overflow-hidden">
          <TaskDetail task={selected} agents={agents} allTasks={tasks} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  )
}
