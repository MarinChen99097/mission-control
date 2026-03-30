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

// ─── Constants ───

const STATUS_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string; pulse?: boolean }> = {
  inbox:          { icon: '○', color: 'text-zinc-400', bg: 'bg-zinc-500/20', label: '待處理' },
  assigned:       { icon: '◔', color: 'text-cyan-400', bg: 'bg-cyan-500/20', label: '已分配' },
  in_progress:    { icon: '●', color: 'text-amber-400', bg: 'bg-amber-500/20', label: '執行中', pulse: true },
  review:         { icon: '◑', color: 'text-purple-400', bg: 'bg-purple-500/20', label: '審查中' },
  quality_review: { icon: '◕', color: 'text-purple-400', bg: 'bg-purple-500/20', label: '品質審查' },
  done:           { icon: '✓', color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: '完成' },
  failed:         { icon: '✕', color: 'text-red-400', bg: 'bg-red-500/20', label: '失敗' },
}

const PRIORITY_ACCENT: Record<string, string> = {
  critical: 'border-red-500', urgent: 'border-red-500',
  high: 'border-orange-400', medium: 'border-blue-400', low: 'border-zinc-500',
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

function isBlocked(t: Task): boolean {
  try { const ids = JSON.parse(t.blocked_by || '[]'); return Array.isArray(ids) && ids.length > 0 } catch { return false }
}

function getBlockedByIds(t: Task): number[] {
  try { return JSON.parse(t.blocked_by || '[]') } catch { return [] }
}

function countProgress(node: TreeNode): { done: number; total: number } {
  let d = 0, t = 0
  for (const c of node.children) {
    t++; if (c.task.status === 'done') d++
    const sub = countProgress(c); d += sub.done; t += sub.total
  }
  return { done: d, total: t }
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() / 1000) - ts)
  if (s < 60) return '剛剛'
  if (s < 3600) return Math.floor(s / 60) + '分前'
  if (s < 86400) return Math.floor(s / 3600) + '時前'
  return Math.floor(s / 86400) + '天前'
}

// ─── Status Badge ───

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.inbox
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>
      <span className={cfg.pulse ? 'animate-pulse' : ''}>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

// ─── Tree Node ───

function TaskNode({
  node, depth, agents, expanded, onToggle, onSelect, selectedId,
}: {
  node: TreeNode; depth: number; agents: AgentInfo[]
  expanded: Set<number>; onToggle: (id: number) => void
  onSelect: (t: Task) => void; selectedId: number | null
}) {
  const { task, children } = node
  const hasKids = children.length > 0
  const isOpen = expanded.has(task.id)
  const blocked = isBlocked(task)
  const agent = agents.find(a => a.name === task.assigned_to)
  const progress = hasKids ? countProgress(node) : null
  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.inbox
  const isSelected = selectedId === task.id

  return (
    <div>
      <div
        className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-all duration-150 border-l-2 ${
          isSelected ? 'bg-primary/8 border-l-primary' : `hover:bg-white/[0.03] ${PRIORITY_ACCENT[task.priority] || 'border-l-transparent'}`
        } ${blocked ? 'opacity-45' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => onSelect(task)}
      >
        {/* Expand toggle */}
        <button
          className={`w-4 h-4 flex items-center justify-center rounded transition-transform text-[10px] ${
            hasKids ? 'text-muted-foreground hover:text-foreground hover:bg-white/10' : 'text-transparent pointer-events-none'
          } ${isOpen ? 'rotate-90' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (hasKids) onToggle(task.id) }}
        >
          ▶
        </button>

        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.pulse ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: cfg.color.includes('emerald') ? '#34d399' : cfg.color.includes('amber') ? '#fbbf24' : cfg.color.includes('red') ? '#f87171' : cfg.color.includes('cyan') ? '#22d3ee' : cfg.color.includes('purple') ? '#a78bfa' : '#71717a' }}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm text-foreground font-medium truncate">{task.title}</span>
            {task.ticket_ref && (
              <span className="text-[9px] px-1 py-px rounded bg-primary/15 text-primary font-mono shrink-0">{task.ticket_ref}</span>
            )}
            {blocked && (
              <span className="text-[9px] px-1 py-px rounded bg-amber-500/20 text-amber-400 shrink-0">🔒 blocked</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.assigned_to && (
              <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  agent?.status === 'busy' ? 'bg-amber-400 animate-pulse' :
                  agent?.status === 'idle' || agent?.status === 'online' ? 'bg-emerald-400' : 'bg-zinc-500'
                }`} />
                {task.assigned_to}
              </span>
            )}
            {task.team && <span className="text-[10px] text-blue-400/60">{task.team}</span>}
            {agent?.runtime && <span className="text-[10px] text-muted-foreground/40 font-mono">{agent.runtime}</span>}
            {progress && progress.total > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-12 h-1 bg-zinc-700/50 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground/50">{progress.done}/{progress.total}</span>
              </div>
            )}
            <span className="text-[10px] text-muted-foreground/30">{timeAgo(task.updated_at)}</span>
          </div>
        </div>
      </div>

      {/* Children */}
      {isOpen && children.map(child => (
        <TaskNode key={child.task.id} node={child} depth={depth + 1} agents={agents}
          expanded={expanded} onToggle={onToggle} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </div>
  )
}

// ─── Task Detail Panel ───

function TaskDetail({ task, agents, onClose }: { task: Task; agents: AgentInfo[]; onClose: () => void }) {
  const [comments, setComments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const agent = agents.find(a => a.name === task.assigned_to)
  const blockedIds = getBlockedByIds(task)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/tasks/${task.id}/comments`)
      .then(r => r.json()).then(d => { setComments(d.comments || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [task.id])

  return (
    <div className="h-full flex flex-col bg-card/50">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border/20">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge status={task.status} />
            {task.ticket_ref && <span className="text-xs font-mono text-primary/70">{task.ticket_ref}</span>}
            {task.team && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{task.team}</span>}
          </div>
          <h3 className="text-base font-semibold text-foreground leading-tight">{task.title}</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground text-lg leading-none p-1">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><span className="text-muted-foreground/60 text-xs">Agent</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {agent && <span className={`w-2 h-2 rounded-full ${agent.status === 'busy' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />}
              <span className="text-foreground">{task.assigned_to || '—'}</span>
            </div>
          </div>
          <div><span className="text-muted-foreground/60 text-xs">Priority</span>
            <div className={`mt-0.5 ${task.priority === 'critical' || task.priority === 'urgent' ? 'text-red-400' : task.priority === 'high' ? 'text-orange-400' : 'text-foreground'}`}>
              {task.priority}
            </div>
          </div>
          {agent?.runtime && (
            <div><span className="text-muted-foreground/60 text-xs">Runtime</span>
              <div className="mt-0.5 font-mono text-xs text-foreground/70">{agent.runtime}</div>
            </div>
          )}
          {blockedIds.length > 0 && (
            <div className="col-span-2"><span className="text-muted-foreground/60 text-xs">Blocked by</span>
              <div className="mt-0.5 text-amber-400 text-xs">{blockedIds.map(id => `TASK-${id}`).join(', ')}</div>
            </div>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground/60 mb-1.5 uppercase tracking-wider">Description</h4>
            <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed bg-surface-1/50 rounded-lg p-3 border border-border/10">
              {task.description}
            </div>
          </div>
        )}

        {/* Result */}
        {(task.resolution || task.outcome) && (
          <div>
            <h4 className="text-xs font-semibold text-emerald-400/60 mb-1.5 uppercase tracking-wider">Result</h4>
            <div className="text-sm text-emerald-400/80 whitespace-pre-wrap leading-relaxed bg-emerald-500/5 rounded-lg p-3 border border-emerald-500/10">
              {task.resolution || task.outcome}
            </div>
          </div>
        )}

        {/* Error */}
        {task.error_message && (
          <div>
            <h4 className="text-xs font-semibold text-red-400/60 mb-1.5 uppercase tracking-wider">Error</h4>
            <div className="text-sm text-red-400/80 whitespace-pre-wrap bg-red-500/5 rounded-lg p-3 border border-red-500/10">
              {task.error_message}
            </div>
          </div>
        )}

        {/* Working Memory */}
        {agent?.working_memory && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground/60 mb-1.5 uppercase tracking-wider">Working Memory</h4>
            <div className="text-sm text-foreground/60 italic whitespace-pre-wrap bg-surface-1/30 rounded-lg p-3">
              {agent.working_memory}
            </div>
          </div>
        )}

        {/* Comments */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground/60 mb-2 uppercase tracking-wider">
            Comments {!loading && `(${comments.length})`}
          </h4>
          {loading ? (
            <div className="text-xs text-muted-foreground/40 py-2">Loading...</div>
          ) : comments.length === 0 ? (
            <div className="text-xs text-muted-foreground/30 py-2 italic">No comments yet</div>
          ) : (
            <div className="space-y-2">
              {comments.map((c: any) => (
                <div key={c.id} className="rounded-lg p-3 bg-surface-1/30 border border-border/10">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-medium text-foreground/80">{c.author}</span>
                    <span className="text-[10px] text-muted-foreground/40">{timeAgo(c.created_at)}</span>
                  </div>
                  <div className="text-xs text-foreground/60 whitespace-pre-wrap leading-relaxed break-words">{c.content}</div>
                </div>
              ))}
            </div>
          )}
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
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [tRes, aRes] = await Promise.all([fetch('/api/tasks?limit=200'), fetch('/api/agents?limit=100')])
      const tData = await tRes.json()
      const aData = await aRes.json()
      const taskList: Task[] = tData.tasks || []
      setTasks(taskList)
      setAgents((aData.agents || []).map((a: any) => ({ name: a.name, status: a.status, working_memory: a.working_memory, runtime: a.runtime || 'claude-mcp' })))

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
  const toggleExpand = (id: number) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Stats
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const runningTasks = tasks.filter(t => t.status === 'in_progress').length
  const blockedTasks = tasks.filter(t => isBlocked(t) && t.status !== 'done').length

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground/50 text-sm">Loading...</div>
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/50 gap-3">
        <div className="text-3xl opacity-50">🌳</div>
        <div className="text-sm">No tasks yet</div>
        <div className="text-xs text-muted-foreground/30">Create a task or send a message to Secretary</div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Tree panel */}
      <div className={`${selectedTask ? 'w-1/2 lg:w-3/5' : 'w-full'} flex flex-col overflow-hidden transition-all duration-200`}>
        {/* Stats bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border/15 bg-card/30 shrink-0">
          <span className="text-xs font-semibold text-foreground/80">Tasks</span>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground/50">{totalTasks} total</span>
            {runningTasks > 0 && <span className="text-amber-400 flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />{runningTasks} running</span>}
            {blockedTasks > 0 && <span className="text-amber-500/60">🔒 {blockedTasks} blocked</span>}
            {doneTasks > 0 && <span className="text-emerald-400/60">✓ {doneTasks} done</span>}
          </div>
        </div>

        {/* Tree list */}
        <div className="flex-1 overflow-y-auto">
          {forest.map(node => (
            <TaskNode key={node.task.id} node={node} depth={0} agents={agents}
              expanded={expanded} onToggle={toggleExpand} onSelect={setSelectedTask} selectedId={selectedTask?.id ?? null} />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedTask && (
        <div className="w-1/2 lg:w-2/5 border-l border-border/15 overflow-hidden">
          <TaskDetail task={selectedTask} agents={agents} onClose={() => setSelectedTask(null)} />
        </div>
      )}
    </div>
  )
}
