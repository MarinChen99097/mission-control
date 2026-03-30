'use client'

import { useState, useEffect, useCallback } from 'react'

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
  project_ticket_no: number | null
  ticket_ref?: string
}

interface TreeNode {
  task: Task
  children: TreeNode[]
  depth: number
}

interface AgentInfo {
  name: string
  status: string
  working_memory: string | null
  runtime: string
}

// ─── Status helpers ───

const statusIcon: Record<string, string> = {
  inbox: '○',
  assigned: '◔',
  in_progress: '●',
  review: '◑',
  quality_review: '◕',
  done: '✅',
  failed: '❌',
}

const statusColor: Record<string, string> = {
  inbox: 'text-zinc-500',
  assigned: 'text-cyan-400',
  in_progress: 'text-amber-400',
  review: 'text-purple-400',
  quality_review: 'text-purple-400',
  done: 'text-emerald-400',
  failed: 'text-red-400',
}

const priorityBorder: Record<string, string> = {
  critical: 'border-l-red-500',
  urgent: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-blue-500',
  low: 'border-l-zinc-500',
}

// ─── Build tree ───

function buildForest(tasks: Task[]): TreeNode[] {
  const map = new Map<number, TreeNode>()
  const roots: TreeNode[] = []

  // Create nodes
  for (const task of tasks) {
    map.set(task.id, { task, children: [], depth: 0 })
  }

  // Link children
  for (const task of tasks) {
    const node = map.get(task.id)!
    if (task.parent_task_id && map.has(task.parent_task_id)) {
      const parent = map.get(task.parent_task_id)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort: roots by created_at desc, children by id asc
  roots.sort((a, b) => b.task.created_at - a.task.created_at)
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => a.task.id - b.task.id)
    node.children.forEach(sortChildren)
  }
  roots.forEach(sortChildren)

  return roots
}

function isBlocked(task: Task): boolean {
  try {
    const ids = JSON.parse(task.blocked_by || '[]')
    return Array.isArray(ids) && ids.length > 0
  } catch {
    return false
  }
}

function getProgress(node: TreeNode): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const child of node.children) {
    total++
    if (child.task.status === 'done') done++
    const sub = getProgress(child)
    done += sub.done
    total += sub.total
  }
  return { done, total }
}

// ─── Tree node component ───

function TaskTreeNode({
  node,
  agents,
  expanded,
  onToggle,
  onSelect,
  selectedId,
}: {
  node: TreeNode
  agents: AgentInfo[]
  expanded: Set<number>
  onToggle: (id: number) => void
  onSelect: (task: Task) => void
  selectedId: number | null
}) {
  const { task, children } = node
  const hasChildren = children.length > 0
  const isExpanded = expanded.has(task.id)
  const blocked = isBlocked(task)
  const agent = agents.find(a => a.name === task.assigned_to)
  const progress = hasChildren ? getProgress(node) : null

  return (
    <div>
      {/* Task row */}
      <div
        className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer border-l-3 transition-colors duration-150 ${
          priorityBorder[task.priority] || 'border-l-zinc-600'
        } ${
          selectedId === task.id ? 'bg-primary/10' : 'hover:bg-card/80'
        } ${
          blocked ? 'opacity-50' : ''
        }`}
        style={{ paddingLeft: `${(node.depth * 24) + 12}px` }}
        onClick={() => onSelect(task)}
      >
        {/* Expand/collapse */}
        <button
          className={`w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5 ${
            hasChildren ? 'text-muted-foreground hover:text-foreground' : 'text-transparent'
          }`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(task.id) }}
        >
          {hasChildren ? (isExpanded ? '▼' : '▶') : '·'}
        </button>

        {/* Status icon */}
        <span className={`text-sm mt-0.5 shrink-0 ${statusColor[task.status] || 'text-zinc-400'}`}>
          {statusIcon[task.status] || '○'}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {task.title}
            </span>
            {task.ticket_ref && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono shrink-0">
                {task.ticket_ref}
              </span>
            )}
            {blocked && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">
                blocked
              </span>
            )}
            {task.team && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 shrink-0">
                {task.team}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            {/* Agent */}
            {task.assigned_to && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  agent?.status === 'busy' ? 'bg-amber-400' :
                  agent?.status === 'idle' || agent?.status === 'online' ? 'bg-emerald-400' :
                  'bg-zinc-500'
                }`} />
                {task.assigned_to}
              </span>
            )}

            {/* Runtime badge */}
            {agent?.runtime && (
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                {agent.runtime}
              </span>
            )}

            {/* Progress bar */}
            {progress && progress.total > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {progress.done}/{progress.total}
                </span>
              </div>
            )}

            {/* Status text */}
            <span className={`text-[10px] ${statusColor[task.status] || 'text-zinc-400'}`}>
              {task.status}
            </span>
          </div>

          {/* Working memory */}
          {agent?.working_memory && (
            <div className="mt-1 text-xs text-muted-foreground/70 italic truncate">
              {agent.working_memory}
            </div>
          )}

          {/* Outcome (if done) */}
          {task.status === 'done' && (task.outcome || task.resolution) && (
            <div className="mt-1 text-xs text-emerald-400/70 truncate">
              {task.resolution || task.outcome}
            </div>
          )}

          {/* Error (if failed) */}
          {task.status === 'failed' && task.error_message && (
            <div className="mt-1 text-xs text-red-400/70 truncate">
              {task.error_message}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && children.map(child => (
        <TaskTreeNode
          key={child.task.id}
          node={child}
          agents={agents}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
    </div>
  )
}

// ─── Task detail sidebar ───

function TaskDetail({ task, agents }: { task: Task; agents: AgentInfo[] }) {
  const [comments, setComments] = useState<any[]>([])

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/comments`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .catch(() => {})
  }, [task.id])

  const agent = agents.find(a => a.name === task.assigned_to)
  let blockedByIds: number[] = []
  try { blockedByIds = JSON.parse(task.blocked_by || '[]') } catch {}

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{task.title}</h3>
        {task.ticket_ref && (
          <span className="text-xs font-mono text-primary">{task.ticket_ref}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Status:</span>
          <span className={`ml-2 ${statusColor[task.status]}`}>{task.status}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Priority:</span>
          <span className="ml-2 text-foreground">{task.priority}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Agent:</span>
          <span className="ml-2 text-foreground">{task.assigned_to || 'unassigned'}</span>
        </div>
        {task.team && (
          <div>
            <span className="text-muted-foreground">Team:</span>
            <span className="ml-2 text-foreground">{task.team}</span>
          </div>
        )}
        {agent?.runtime && (
          <div>
            <span className="text-muted-foreground">Runtime:</span>
            <span className="ml-2 text-foreground font-mono text-xs">{agent.runtime}</span>
          </div>
        )}
        {blockedByIds.length > 0 && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Blocked by:</span>
            <span className="ml-2 text-amber-400">{blockedByIds.map(id => `TASK-${id}`).join(', ')}</span>
          </div>
        )}
      </div>

      {task.description && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-1">Description</h4>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {(task.outcome || task.resolution) && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-1">Result</h4>
          <p className="text-sm text-emerald-400/80 whitespace-pre-wrap">{task.resolution || task.outcome}</p>
        </div>
      )}

      {agent?.working_memory && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-1">Working Memory</h4>
          <p className="text-sm text-foreground/60 whitespace-pre-wrap">{agent.working_memory}</p>
        </div>
      )}

      {/* Comments */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-2">
          Comments ({comments.length})
        </h4>
        <div className="space-y-2">
          {comments.map((c: any) => (
            <div key={c.id} className="bg-card/50 rounded p-2 border border-border/30">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-foreground">{c.author}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date((c.created_at || 0) * 1000).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-foreground/70 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No comments yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───

export function TaskTreePanel() {
  const [tasks, setLocalTasks] = useState<Task[]>([])
  const [agents, setLocalAgents] = useState<AgentInfo[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, agentsRes] = await Promise.all([
        fetch('/api/tasks?limit=200'),
        fetch('/api/agents?limit=100'),
      ])
      const tasksData = await tasksRes.json()
      const agentsData = await agentsRes.json()

      const taskList = tasksData.tasks || []
      setLocalTasks(taskList)
      setLocalAgents((agentsData.agents || []).map((a: any) => ({
        name: a.name,
        status: a.status,
        working_memory: a.working_memory,
        runtime: a.runtime || 'claude-mcp',
      })))

      // Auto-expand root tasks
      const roots = taskList.filter((t: Task) => !t.parent_task_id)
      setExpanded(prev => {
        const next = new Set(prev)
        for (const r of roots) next.add(r.id)
        return next
      })

      setLoading(false)
    } catch {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const timer = setInterval(fetchData, 5000)
    return () => clearInterval(timer)
  }, [fetchData])

  const forest = buildForest(tasks)
  const rootTasks = forest.filter(n => n.children.length > 0 || n.task.status !== 'done')

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading task tree...</div>
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <span className="text-2xl">🌳</span>
        <span>No tasks yet</span>
        <span className="text-xs">Create a task to see the tree view</span>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Tree list */}
      <div className={`${selectedTask ? 'w-1/2 border-r border-border/30' : 'w-full'} overflow-y-auto`}>
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 px-3 py-2 border-b border-border/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Task Trees ({rootTasks.length})
            </h3>
            <span className="text-xs text-muted-foreground">
              {tasks.filter(t => t.status === 'done').length}/{tasks.length} done
            </span>
          </div>
        </div>

        {rootTasks.map(node => (
          <TaskTreeNode
            key={node.task.id}
            node={node}
            agents={agents}
            expanded={expanded}
            onToggle={toggleExpand}
            onSelect={setSelectedTask}
            selectedId={selectedTask?.id ?? null}
          />
        ))}
      </div>

      {/* Detail panel */}
      {selectedTask && (
        <div className="w-1/2 border-l border-border/30">
          <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 px-3 py-2 border-b border-border/30 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-foreground">Task Detail</h3>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedTask(null)}
            >
              ✕
            </button>
          </div>
          <TaskDetail task={selectedTask} agents={agents} />
        </div>
      )}
    </div>
  )
}
