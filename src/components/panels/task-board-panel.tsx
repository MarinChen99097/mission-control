'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'

import { createClientLogger } from '@/lib/client-logger'

import { useFocusTrap } from '@/lib/use-focus-trap'

import { AgentAvatar } from '@/components/ui/agent-avatar'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { Button } from '@/components/ui/button'
import { ProjectManagerModal } from '@/components/modals/project-manager-modal'
import { SessionMessage, shouldShowTimestamp, type SessionTranscriptMessage } from '@/components/chat/session-message'

const log = createClientLogger('TaskBoard')

interface Task {
  id: number
  title: string
  description?: string
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'quality_review' | 'done' | 'awaiting_owner'
  priority: 'low' | 'medium' | 'high' | 'critical' | 'urgent'
  assigned_to?: string
  created_by: string
  created_at: number
  updated_at: number
  due_date?: number
  estimated_hours?: number
  actual_hours?: number
  tags?: string[]
  metadata?: any
  aegisApproved?: boolean
  project_id?: number
  project_ticket_no?: number
  project_name?: string
  project_prefix?: string
  ticket_ref?: string
  github_issue_number?: number
  github_repo?: string
  github_branch?: string
  github_pr_number?: number
  github_pr_state?: string
}

interface Agent {
  id: number
  name: string
  role: string
  status: 'offline' | 'idle' | 'busy' | 'error'
  taskStats?: {
    total: number
    assigned: number
    in_progress: number
    completed: number
  }
}

interface Comment {
  id: number
  task_id: number
  author: string
  content: string
  created_at: number
  parent_id?: number
  mentions?: string[]
  replies?: Comment[]
}

interface Project {
  id: number
  name: string
  slug: string
  ticket_prefix: string
  status: 'active' | 'archived'
}

interface MentionOption {
  handle: string
  recipient: string
  type: 'user' | 'agent'
  display: string
  role?: string
}

const STATUS_COLUMN_KEYS = [
  { key: 'inbox', titleKey: 'colInbox', color: 'bg-secondary text-foreground' },
  { key: 'assigned', titleKey: 'colAssigned', color: 'bg-blue-500/20 text-blue-400' },
  { key: 'awaiting_owner', titleKey: 'colAwaitingOwner', color: 'bg-orange-500/20 text-orange-400' },
  { key: 'in_progress', titleKey: 'colInProgress', color: 'bg-yellow-500/20 text-yellow-400' },
  { key: 'review', titleKey: 'colReview', color: 'bg-purple-500/20 text-purple-400' },
  { key: 'quality_review', titleKey: 'colQualityReview', color: 'bg-indigo-500/20 text-indigo-400' },
  { key: 'done', titleKey: 'colDone', color: 'bg-green-500/20 text-green-400' },
]

const AWAITING_OWNER_KEYWORDS = [
  'waiting for', 'waiting on', 'needs human', 'manual action',
  'account creation', 'browser login', 'approval needed',
  'owner action', 'human required', 'blocked on owner',
  'awaiting owner', 'awaiting human', 'needs owner',
]

function detectAwaitingOwner(task: Task): boolean {
  if (task.status === 'awaiting_owner') return true
  if (task.status !== 'assigned' && task.status !== 'in_progress') return false
  const text = `${task.title} ${task.description || ''}`.toLowerCase()
  return AWAITING_OWNER_KEYWORDS.some(kw => text.includes(kw))
}

/** Build a human-readable label for a session key like "agent:nefes:telegram-group-123" */
function formatSessionLabel(s: { key: string; channel?: string; kind?: string; label?: string }): string {
  if (s.label) return s.label
  // Extract the identifier part after the last colon: "agent:name:main" → "main"
  const parts = (s.key || '').split(':')
  const identifier = parts.length > 2 ? parts.slice(2).join(':') : s.key
  const channel = s.channel || ''
  if (channel && identifier !== 'main') {
    return `${channel} (${identifier})`
  }
  if (channel) return `${channel} (${s.kind || 'default'})`
  return identifier || s.key
}

/** Fetch active gateway sessions for a given agent name. */
function useAgentSessions(agentName: string | undefined) {
  const [sessions, setSessions] = useState<Array<{ key: string; id: string; channel?: string; kind?: string; label?: string; displayLabel: string }>>([])
  useEffect(() => {
    if (!agentName) { setSessions([]); return }
    let cancelled = false
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const all = (data.sessions || []) as Array<{ key: string; id: string; agent?: string; channel?: string; kind?: string; label?: string; active?: boolean }>
        const filtered = all.filter(s =>
          s.agent?.toLowerCase() === agentName.toLowerCase() ||
          s.key?.toLowerCase().includes(agentName.toLowerCase())
        )
        setSessions(filtered.map(s => ({
          key: s.key,
          id: s.id,
          channel: s.channel,
          kind: s.kind,
          label: s.label,
          displayLabel: formatSessionLabel(s),
        })))
      })
      .catch(() => { if (!cancelled) setSessions([]) })
    return () => { cancelled = true }
  }, [agentName])
  return sessions
}

const priorityColors: Record<string, string> = {
  low: 'border-l-green-500',
  medium: 'border-l-yellow-500',
  high: 'border-l-orange-500',
  critical: 'border-l-red-500',
}

function useMentionTargets() {
  const [mentionTargets, setMentionTargets] = useState<MentionOption[]>([])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const response = await fetch('/api/mentions?limit=200')
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) setMentionTargets(data.mentions || [])
      } catch {
        // mention autocomplete is non-critical
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  return mentionTargets
}

function MentionTextarea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
  className,
  mentionTargets,
}: {
  id?: string
  value: string
  onChange: (next: string) => void
  rows?: number
  placeholder?: string
  className?: string
  mentionTargets: MentionOption[]
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  const [openUpwards, setOpenUpwards] = useState(false)

  const filtered = mentionTargets
    .filter((target) => {
      if (!query) return true
      const q = query.toLowerCase()
      return target.handle.includes(q) || target.display.toLowerCase().includes(q)
    })
    .slice(0, 8)

  const detectMentionQuery = (nextValue: string, caret: number) => {
    const left = nextValue.slice(0, caret)
    const match = left.match(/(?:^|[^\w.-])@([A-Za-z0-9._-]{0,63})$/)
    if (!match) {
      setOpen(false)
      setQuery('')
      setRange(null)
      return
    }
    const matched = match[1] || ''
    const start = caret - matched.length - 1
    setQuery(matched)
    setRange({ start, end: caret })
    setActiveIndex(0)
    setOpen(true)
  }

  const insertMention = (option: MentionOption) => {
    if (!range) return
    const next = `${value.slice(0, range.start)}@${option.handle} ${value.slice(range.end)}`
    onChange(next)
    setOpen(false)
    setQuery('')
    const cursor = range.start + option.handle.length + 2
    requestAnimationFrame(() => {
      const node = textareaRef.current
      if (!node) return
      node.focus()
      node.setSelectionRange(cursor, cursor)
    })
  }

  useEffect(() => {
    if (!open) return
    const node = textareaRef.current
    if (!node) return

    const rect = node.getBoundingClientRect()
    const estimatedMenuHeight = Math.min(Math.max(filtered.length, 1) * 46 + 12, 224)
    const availableBelow = window.innerHeight - rect.bottom
    const availableAbove = rect.top
    setOpenUpwards(availableBelow < estimatedMenuHeight && availableAbove > availableBelow)
  }, [open, filtered.length])

  return (
    <div className="relative">
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          const nextValue = e.target.value
          onChange(nextValue)
          detectMentionQuery(nextValue, e.target.selectionStart || 0)
        }}
        onClick={(e) => detectMentionQuery(value, (e.target as HTMLTextAreaElement).selectionStart || 0)}
        onKeyUp={(e) => detectMentionQuery(value, (e.target as HTMLTextAreaElement).selectionStart || 0)}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((prev) => (prev + 1) % filtered.length)
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
            return
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            insertMention(filtered[activeIndex])
            return
          }
          if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className={`absolute z-[60] w-full bg-surface-1 border border-border rounded-md shadow-xl max-h-56 overflow-y-auto ${
          openUpwards ? 'bottom-full mb-1' : 'mt-1'
        }`}>
          {filtered.map((option, index) => (
            <button
              key={`${option.type}-${option.handle}-${option.recipient}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                insertMention(option)
              }}
              className={`w-full text-left px-3 py-2 text-xs border-b last:border-b-0 border-border/40 ${
                index === activeIndex ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-surface-2'
              }`}
            >
              <div className="font-mono">@{option.handle}</div>
              <div className="text-muted-foreground">
                {option.display} • {option.type}{option.role ? ` • ${option.role}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type DunkPhase = 'idle' | 'success' | 'error' | 'dismissing'

function DunkItButton({ taskId, onDunked }: { taskId: number; onDunked: (id: number) => void }) {
  const t = useTranslations('taskBoard')
  const [phase, setPhase] = useState<DunkPhase>('idle')

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (phase !== 'idle') return
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      if (!res.ok) throw new Error('Failed')
      setPhase('success')
      setTimeout(() => {
        setPhase('dismissing')
        setTimeout(() => onDunked(taskId), 400)
      }, 600)
    } catch {
      setPhase('error')
      setTimeout(() => setPhase('idle'), 1500)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={phase !== 'idle' && phase !== 'error'}
      title={t('dunkIt')}
      style={{
        padding: '2px 8px',
        fontSize: '11px',
        borderRadius: '4px',
        border: '1px solid',
        cursor: phase === 'idle' ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
        transform: phase === 'success' ? 'scale(1.15)' : phase === 'dismissing' ? 'scale(0.8) translateY(-10px)' : 'scale(1)',
        opacity: phase === 'dismissing' ? 0 : 1,
        borderColor: phase === 'success' ? 'rgb(34 197 94 / 0.5)' : phase === 'error' ? 'rgb(239 68 68 / 0.5)' : 'hsl(var(--border))',
        backgroundColor: phase === 'success' ? 'rgb(34 197 94 / 0.15)' : phase === 'error' ? 'rgb(239 68 68 / 0.15)' : 'transparent',
        color: phase === 'success' ? 'rgb(34 197 94)' : phase === 'error' ? 'rgb(239 68 68)' : 'inherit',
      }}
    >
      {phase === 'success' ? '!' : phase === 'error' ? '!!' : phase === 'dismissing' ? '!' : 'Dunk'}
    </button>
  )
}

interface SpawnFormData {
  task: string
  model: string
  label: string
  timeoutSeconds: number
}

import { TaskTreePanel } from './task-tree-panel'

export function TaskBoardPanel() {
  const t = useTranslations('taskBoard')
  const statusColumns = STATUS_COLUMN_KEYS.map(col => ({ ...col, title: t(col.titleKey as any) }))
  const { tasks: storeTasks, setTasks: storeSetTasks, selectedTask, setSelectedTask, activeProject, availableModels, spawnRequests, addSpawnRequest, updateSpawnRequest, dashboardMode } = useMissionControl()
  const [viewMode, setViewMode] = useState<'board' | 'tree'>('board')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectFilter, setProjectFilter] = useState<string>(
    activeProject ? String(activeProject.id) : 'all'
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aegisMap, setAegisMap] = useState<Record<number, boolean>>({})
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showProjectManager, setShowProjectManager] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showSpawnForm, setShowSpawnForm] = useState(false)
  const [spawnFormData, setSpawnFormData] = useState<SpawnFormData>({
    task: '',
    model: 'sonnet',
    label: '',
    timeoutSeconds: 300
  })
  const [isSpawning, setIsSpawning] = useState(false)
  const [gnapStatus, setGnapStatus] = useState<{ enabled: boolean; taskCount?: number; lastSync?: string } | null>(null)
  const [gnapSyncing, setGnapSyncing] = useState(false)
  const isLocal = dashboardMode === 'local'
  const dragCounter = useRef(0)
  const selectedTaskIdFromUrl = Number.parseInt(searchParams.get('taskId') || '', 10)
  const parentIdFromUrl = searchParams.get('parentId')
  const [selectedParentId, setSelectedParentId] = useState<number | null>(
    parentIdFromUrl ? Number.parseInt(parentIdFromUrl, 10) || null : null
  )

  const updateTaskUrl = useCallback((taskId: number | null, mode: 'push' | 'replace' = 'push') => {
    const params = new URLSearchParams(searchParams.toString())
    if (typeof taskId === 'number' && Number.isFinite(taskId)) {
      params.set('taskId', String(taskId))
    } else {
      params.delete('taskId')
    }
    const query = params.toString()
    const href = query ? `${pathname}?${query}` : pathname
    if (mode === 'replace') {
      router.replace(href)
      return
    }
    router.push(href)
  }, [pathname, router, searchParams])

  const updateParentUrl = useCallback((parentId: number | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (typeof parentId === 'number' && Number.isFinite(parentId)) {
      params.set('parentId', String(parentId))
    } else {
      params.delete('parentId')
    }
    params.delete('taskId')
    const query = params.toString()
    const href = query ? `${pathname}?${query}` : pathname
    router.push(href)
  }, [pathname, router, searchParams])

  const handleSelectParent = useCallback((parentId: number | null) => {
    setSelectedParentId(parentId)
    updateParentUrl(parentId)
  }, [updateParentUrl])

  // Sync parentId from URL on navigation
  useEffect(() => {
    const urlParentId = searchParams.get('parentId')
    const parsed = urlParentId ? Number.parseInt(urlParentId, 10) : null
    if (parsed !== selectedParentId) {
      setSelectedParentId(parsed && Number.isFinite(parsed) ? parsed : null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Augment store tasks with aegisApproved flag (computed, not stored)
  const tasks: Task[] = storeTasks.map(t => ({
    ...t,
    aegisApproved: Boolean(aegisMap[t.id])
  }))

  // Fetch tasks, agents, and projects
  const fetchData = useCallback(async () => {
    try {
      setError(null)

      const tasksQuery = new URLSearchParams()
      if (projectFilter !== 'all') {
        tasksQuery.set('project_id', projectFilter)
      }
      const tasksUrl = tasksQuery.toString() ? `/api/tasks?${tasksQuery.toString()}` : '/api/tasks'

      const [tasksResponse, agentsResponse, projectsResponse] = await Promise.all([
        fetch(tasksUrl),
        fetch('/api/agents'),
        fetch('/api/projects')
      ])

      if (!tasksResponse.ok || !agentsResponse.ok || !projectsResponse.ok) {
        throw new Error('Failed to fetch data')
      }

      const tasksData = await tasksResponse.json()
      const agentsData = await agentsResponse.json()
      const projectsData = await projectsResponse.json()

      const tasksList = tasksData.tasks || []
      const taskIds = tasksList.map((task: Task) => task.id)

      // Render primary board data first; hydrate Aegis approvals in background.
      storeSetTasks(tasksList)
      setAgents(agentsData.agents || [])
      setProjects(projectsData.projects || [])

      if (taskIds.length > 0) {
        fetch(`/api/quality-review?taskIds=${taskIds.join(',')}`)
          .then((reviewResponse) => reviewResponse.ok ? reviewResponse.json() : null)
          .then((reviewData) => {
            const latest = reviewData?.latest || {}
            const newAegisMap: Record<number, boolean> = Object.fromEntries(
              Object.entries(latest).map(([id, row]: [string, any]) => [
                Number(id),
                row?.reviewer === 'aegis' && row?.status === 'approved'
              ])
            )
            setAegisMap(newAegisMap)
          })
          .catch(() => {
            setAegisMap({})
          })
      } else {
        setAegisMap({})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [projectFilter, storeSetTasks])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch GNAP status
  useEffect(() => {
    fetch('/api/gnap')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setGnapStatus(data) })
      .catch(() => {})
  }, [])

  const handleGnapSync = useCallback(async () => {
    setGnapSyncing(true)
    try {
      const res = await fetch('/api/gnap?action=sync', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setGnapStatus(prev => prev ? { ...prev, taskCount: data.pushed, lastSync: data.lastSync } : prev)
      }
    } catch { /* ignore */ }
    finally { setGnapSyncing(false) }
  }, [])

  // Sync global activeProject into local projectFilter
  useEffect(() => {
    const newFilter = activeProject ? String(activeProject.id) : 'all'
    setProjectFilter(newFilter)
  }, [activeProject])

  useEffect(() => {
    if (!Number.isFinite(selectedTaskIdFromUrl)) {
      if (selectedTask) setSelectedTask(null)
      return
    }

    const match = tasks.find((task) => task.id === selectedTaskIdFromUrl)
    if (match) {
      if (selectedTask?.id !== match.id) {
        setSelectedTask(match)
      }
      return
    }

    if (!loading) {
      setError(`Task #${selectedTaskIdFromUrl} not found in current workspace`)
      setSelectedTask(null)
    }
  }, [loading, selectedTask, selectedTaskIdFromUrl, setSelectedTask, tasks])

  // Poll as SSE fallback — pauses when SSE is delivering events
  useSmartPoll(fetchData, 30000, { pauseWhenSseConnected: true })

  // ── Mission Groups (Layer 1) computation ──
  // Group subtasks by parent_task_id
  const subtasksByParent = tasks.reduce<Record<number, Task[]>>((acc, task) => {
    const pid = (task as any).parent_task_id
    if (pid) {
      (acc[pid] ||= []).push(task)
    }
    return acc
  }, {})

  // Identify parent tasks (have children) and standalone tasks (no parent, no children)
  const parentTasks = tasks.filter(task => {
    const pid = (task as any).parent_task_id
    return !pid && subtasksByParent[task.id]?.length > 0
  })

  const standaloneTasks = tasks.filter(task => {
    const pid = (task as any).parent_task_id
    return !pid && !subtasksByParent[task.id]?.length
  })

  // Compute aggregated status for a parent task based on its subtasks
  const computeParentStatus = (parentId: number): 'not_started' | 'in_progress' | 'awaiting_review' | 'completed' => {
    const subs = subtasksByParent[parentId] || []
    if (subs.length === 0) return 'not_started'

    const statuses = subs.map(s => detectAwaitingOwner(s) ? 'awaiting_owner' : s.status)
    const allDone = statuses.every(s => s === 'done')
    if (allDone) return 'completed'

    // Only awaiting_owner means "needs YOUR review" — internal review/quality_review is "in progress"
    const anyAwaitingOwner = statuses.some(s => s === 'awaiting_owner')
    if (anyAwaitingOwner) return 'awaiting_review'

    const anyInProgress = statuses.some(s => s === 'in_progress' || s === 'review' || s === 'quality_review')
    if (anyInProgress) return 'in_progress'

    return 'not_started'
  }

  // Compute standalone task aggregated status (treat as single-subtask group)
  const computeStandaloneStatus = (task: Task): 'not_started' | 'in_progress' | 'awaiting_review' | 'completed' => {
    const effectiveStatus = detectAwaitingOwner(task) ? 'awaiting_owner' : task.status
    if (effectiveStatus === 'done') return 'completed'
    // Only awaiting_owner = needs YOUR review. Internal review/quality_review = in progress.
    if (effectiveStatus === 'awaiting_owner') return 'awaiting_review'
    if (effectiveStatus === 'in_progress' || effectiveStatus === 'review' || effectiveStatus === 'quality_review') return 'in_progress'
    return 'not_started'
  }

  const MISSION_COLUMNS = [
    { key: 'not_started', titleKey: 'notStarted', color: 'bg-secondary text-foreground' },
    { key: 'in_progress', titleKey: 'inProgress', color: 'bg-yellow-500/20 text-yellow-400' },
    { key: 'awaiting_review', titleKey: 'awaitingReview', color: 'bg-orange-500/20 text-orange-400' },
    { key: 'completed', titleKey: 'completed', color: 'bg-green-500/20 text-green-400' },
  ] as const

  type MissionCard = { task: Task; status: string; isStandalone: boolean; subtaskCount: number; doneCount: number }

  const missionCards: MissionCard[] = [
    ...parentTasks.map(task => {
      const subs = subtasksByParent[task.id] || []
      return {
        task,
        status: computeParentStatus(task.id),
        isStandalone: false,
        subtaskCount: subs.length,
        doneCount: subs.filter(s => s.status === 'done').length,
      }
    }),
    ...standaloneTasks.map(task => ({
      task,
      status: computeStandaloneStatus(task),
      isStandalone: true,
      subtaskCount: 0,
      doneCount: 0,
    })),
  ]

  const missionsByColumn = MISSION_COLUMNS.reduce<Record<string, MissionCard[]>>((acc, col) => {
    acc[col.key] = missionCards.filter(mc => mc.status === col.key)
    return acc
  }, {})

  // ── Layer 2: filtered tasks for selected parent ──
  const layer2Tasks = selectedParentId !== null
    ? tasks.filter(task => (task as any).parent_task_id === selectedParentId)
    : []

  const selectedParentTask = selectedParentId !== null
    ? tasks.find(task => task.id === selectedParentId) || null
    : null

  // Group tasks by status, overriding for awaiting_owner detection
  // In Layer 2 mode, only show subtasks of the selected parent
  const filteredTasksForBoard = selectedParentId !== null ? layer2Tasks : tasks
  const tasksByStatus = statusColumns.reduce((acc, column) => {
    acc[column.key] = filteredTasksForBoard.filter(task => {
      const effectiveStatus = detectAwaitingOwner(task) ? 'awaiting_owner' : task.status
      return effectiveStatus === column.key
    })
    return acc
  }, {} as Record<string, Task[]>)

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.currentTarget.outerHTML)
  }

  const handleDragEnter = (e: React.DragEvent, status: string) => {
    e.preventDefault()
    dragCounter.current++
    e.currentTarget.classList.add('drag-over')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    dragCounter.current--
    if (dragCounter.current === 0) {
      e.currentTarget.classList.remove('drag-over')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const { updateTask } = useMissionControl()

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    dragCounter.current = 0
    e.currentTarget.classList.remove('drag-over')

    if (!draggedTask || draggedTask.status === newStatus) {
      setDraggedTask(null)
      return
    }

    const previousStatus = draggedTask.status

    try {
      if (newStatus === 'done') {
        const reviewResponse = await fetch(`/api/quality-review?taskId=${draggedTask.id}`)
        if (!reviewResponse.ok) {
          throw new Error('Unable to verify Aegis approval')
        }
        const reviewData = await reviewResponse.json()
        const latest = reviewData.reviews?.find((review: any) => review.reviewer === 'aegis')
        if (!latest || latest.status !== 'approved') {
          throw new Error('Aegis approval is required before moving to done')
        }
      }

      // Optimistically update via Zustand store
      updateTask(draggedTask.id, {
        status: newStatus as Task['status'],
        updated_at: Math.floor(Date.now() / 1000)
      })

      // Update on server
      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: [{ id: draggedTask.id, status: newStatus }]
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update task status')
      }
    } catch (err) {
      // Revert optimistic update via Zustand store
      updateTask(draggedTask.id, { status: previousStatus })
      setError(err instanceof Error ? err.message : 'Failed to update task status')
    } finally {
      setDraggedTask(null)
    }
  }

  // Format relative time for tasks
  const formatTaskTimestamp = (timestamp: number) => {
    const now = new Date().getTime()
    const time = new Date(timestamp * 1000).getTime()
    const diff = now - time

    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return t('timeAgoDays', { count: days })
    if (hours > 0) return t('timeAgoHours', { count: hours })
    if (minutes > 0) return t('timeAgoMinutes', { count: minutes })
    return t('timeAgoJustNow')
  }

  const handleSpawn = async () => {
    if (!spawnFormData.task.trim() || !spawnFormData.label.trim()) return

    setIsSpawning(true)
    const spawnId = `spawn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    addSpawnRequest({
      id: spawnId,
      task: spawnFormData.task,
      model: spawnFormData.model,
      label: spawnFormData.label,
      timeoutSeconds: spawnFormData.timeoutSeconds,
      status: 'pending',
      createdAt: Date.now()
    })

    try {
      const response = await fetch('/api/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spawnFormData),
      })
      const result = await response.json()

      if (result.success) {
        updateSpawnRequest(spawnId, {
          status: 'running',
          result: result.sessionInfo || 'Agent spawned successfully'
        })
        setSpawnFormData({ task: '', model: 'sonnet', label: '', timeoutSeconds: 300 })
        setShowSpawnForm(false)
      } else {
        updateSpawnRequest(spawnId, {
          status: 'failed',
          error: result.error || 'Unknown error'
        })
      }
    } catch (error) {
      log.error('Spawn error:', error)
      updateSpawnRequest(spawnId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Network error'
      })
    } finally {
      setIsSpawning(false)
    }
  }

  const getTagColor = (tag: string) => {
    const lowerTag = tag.toLowerCase()
    if (lowerTag.includes('urgent') || lowerTag.includes('critical')) {
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    }
    if (lowerTag.includes('bug') || lowerTag.includes('fix')) {
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    }
    if (lowerTag.includes('feature') || lowerTag.includes('enhancement')) {
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
    if (lowerTag.includes('research') || lowerTag.includes('analysis')) {
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    }
    if (lowerTag.includes('deploy') || lowerTag.includes('release')) {
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    }
    return 'bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20'
  }

  // Get agent name by session key
  const getAgentName = (sessionKey?: string) => {
    const agent = agents.find(a => a.name === sessionKey)
    return agent?.name || sessionKey || 'Unassigned'
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col" role="status" aria-live="polite">
        <div className="flex justify-between items-center p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-7 w-28 bg-surface-1 rounded-md animate-pulse" />
            <div className="h-9 w-36 bg-surface-1 rounded-md animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-surface-1 rounded-md animate-pulse" />
            <div className="h-9 w-24 bg-surface-1 rounded-md animate-pulse" />
          </div>
        </div>
        <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, colIdx) => (
            <div key={colIdx} className="flex-1 min-w-80 bg-card border border-border rounded-lg flex flex-col">
              <div className="p-3 rounded-t-lg bg-surface-1 animate-pulse">
                <div className="h-5 w-24 bg-surface-2 rounded" />
              </div>
              <div className="flex-1 p-3 space-y-3">
                {Array.from({ length: 3 - colIdx }).map((_, cardIdx) => (
                  <div key={cardIdx} className="bg-surface-1 rounded-lg p-3 border-l-4 border-border space-y-2 animate-pulse">
                    <div className="h-4 w-3/4 bg-surface-2 rounded" />
                    <div className="h-3 w-full bg-surface-2/60 rounded" />
                    <div className="h-3 w-1/2 bg-surface-2/40 rounded" />
                    <div className="flex justify-between items-center pt-1">
                      <div className="h-3 w-20 bg-surface-2/50 rounded" />
                      <div className="h-3 w-16 bg-surface-2/50 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">{t('loadingTasks')}</span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          {selectedParentId !== null ? (
            <>
              <button
                onClick={() => handleSelectParent(null)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 12L6 8l4-4" />
                </svg>
                {t('backToMissions')}
              </button>
              <h2 className="text-xl font-bold text-foreground">
                {selectedParentTask ? t('subtasksOf', { title: selectedParentTask.title }) : t('title')}
              </h2>
              <div className="flex rounded-lg border border-border/50 overflow-hidden">
                <button
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === 'board' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setViewMode('board')}
                >Board</button>
                <button
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === 'tree' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setViewMode('tree')}
                >Tree</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground">{t('missionGroups')}</h2>
            </>
          )}
          {gnapStatus?.enabled && (
            <button
              onClick={handleGnapSync}
              disabled={gnapSyncing}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              title={gnapStatus.lastSync ? `Last sync: ${gnapStatus.lastSync}` : 'Click to sync'}
            >
              GNAP
              {gnapStatus.taskCount != null && (
                <span className="text-emerald-400/70">{gnapStatus.taskCount}</span>
              )}
              {gnapSyncing && (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 1.5a6.5 6.5 0 1 1-4.5 2" />
                </svg>
              )}
            </button>
          )}
          <div className="relative">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-9 px-3 pr-8 bg-surface-1 text-foreground border border-border rounded-md text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">{t('allProjects')}</option>
              {projects.map((project) => (
                <option key={project.id} value={String(project.id)}>
                  {project.name} ({project.ticket_prefix})
                </option>
              ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowProjectManager(true)}>
            {t('projects')}
          </Button>
          {!isLocal && (
            <Button variant="outline" onClick={() => setShowSpawnForm(!showSpawnForm)}>
              {showSpawnForm ? t('close') : t('spawnSubAgent')}
            </Button>
          )}
          <Button onClick={() => setShowCreateModal(true)}>
            {t('newTask')}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={fetchData} title={t('refresh')}>
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 8a6.5 6.5 0 0 1 11.25-4.5M14.5 8a6.5 6.5 0 0 1-11.25 4.5" />
              <path d="M13.5 2v3h-3M2.5 14v-3h3" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Spawn Form (collapsible) */}
      {showSpawnForm && (
        <div className="border-b border-border bg-surface-0 p-4">
          <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
            <div className="space-y-3">
              <textarea
                value={spawnFormData.task}
                onChange={(e) => setSpawnFormData(prev => ({ ...prev, task: e.target.value }))}
                placeholder={t('spawnTaskPlaceholder')}
                className="w-full h-20 px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isSpawning}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={spawnFormData.label}
                  onChange={(e) => setSpawnFormData(prev => ({ ...prev, label: e.target.value }))}
                  placeholder={t('spawnLabelPlaceholder')}
                  className="flex-1 px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={isSpawning}
                />
                <select
                  value={spawnFormData.model}
                  onChange={(e) => setSpawnFormData(prev => ({ ...prev, model: e.target.value }))}
                  className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={isSpawning}
                >
                  {availableModels.map((model) => (
                    <option key={model.alias} value={model.alias}>{model.alias}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="10"
                  max="3600"
                  value={spawnFormData.timeoutSeconds}
                  onChange={(e) => setSpawnFormData(prev => ({ ...prev, timeoutSeconds: parseInt(e.target.value) || 300 }))}
                  className="w-20 px-2 py-1.5 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  title={t('timeoutSeconds')}
                  disabled={isSpawning}
                />
                <Button
                  onClick={handleSpawn}
                  disabled={isSpawning || !spawnFormData.task.trim() || !spawnFormData.label.trim()}
                  size="sm"
                >
                  {isSpawning ? t('spawning') : t('spawn')}
                </Button>
              </div>
            </div>
            {/* Active spawn requests */}
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {spawnRequests.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">{t('noActiveSpawnRequests')}</div>
              ) : (
                spawnRequests.slice(0, 5).map((request) => (
                  <div key={request.id} className="flex items-center justify-between px-3 py-2 border border-border rounded-md text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-foreground truncate">{request.label}</span>
                      <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                        request.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        request.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                        request.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {request.status}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{request.model}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 m-4 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setError(null)}
            className="text-red-400/60 hover:text-red-400 ml-2"
            aria-label={t('dismissError')}
          >
            ×
          </Button>
        </div>
      )}

      {/* Team Filter (Layer 2 only) */}
      {selectedParentId !== null && (() => {
        const allTeams = new Set<string>()
        for (const col of Object.values(tasksByStatus)) {
          if (Array.isArray(col)) col.forEach((t: any) => { if (t.team) allTeams.add(t.team) })
        }
        if (allTeams.size === 0) return null
        return (
          <div className="flex items-center gap-1.5 px-4 pb-1 overflow-x-auto">
            <span className="text-xs text-muted-foreground mr-1">Team:</span>
            <button
              className={`text-xs px-2 py-0.5 rounded ${!(window as any).__mcTeamFilter ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => { (window as any).__mcTeamFilter = ''; window.dispatchEvent(new Event('mc-team-filter')) }}
            >All</button>
            {Array.from(allTeams).sort().map(team => (
              <button
                key={team}
                className={`text-xs px-2 py-0.5 rounded ${(window as any).__mcTeamFilter === team ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => { (window as any).__mcTeamFilter = team; window.dispatchEvent(new Event('mc-team-filter')) }}
              >{team}</button>
            ))}
          </div>
        )
      })()}

      {/* ── Layer 1: Mission Groups ── */}
      {selectedParentId === null && (
        <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-x-auto" role="region" aria-label={t('missionGroups')}>
          {MISSION_COLUMNS.map(col => {
            const cards = missionsByColumn[col.key] || []
            return (
              <div key={col.key} className="flex-1 min-w-72 min-h-0 bg-surface-0 border border-border/60 rounded-xl flex flex-col">
                <div className={`${col.color} px-4 py-3 rounded-t-xl flex justify-between items-center border-b border-border/30`}>
                  <h3 className="font-semibold text-sm tracking-wide">{t(col.titleKey as any)}</h3>
                  <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded-md min-w-[1.75rem] text-center">
                    {cards.length}
                  </span>
                </div>
                <div className="flex-1 p-2.5 space-y-2.5 min-h-32 h-full overflow-y-auto">
                  {cards.map(({ task, isStandalone, subtaskCount, doneCount }) => (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (isStandalone) {
                          setSelectedTask(task)
                          updateTaskUrl(task.id)
                        } else {
                          handleSelectParent(task.id)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (isStandalone) {
                            setSelectedTask(task)
                            updateTaskUrl(task.id)
                          } else {
                            handleSelectParent(task.id)
                          }
                        }
                      }}
                      className={`group bg-card rounded-lg p-3 cursor-pointer border border-border/40 shadow-sm hover:shadow-md hover:shadow-black/10 hover:border-border/70 transition-all duration-200 ease-out border-l-4 ${priorityColors[task.priority]} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
                    >
                      {/* Title row */}
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="text-foreground font-medium text-sm leading-tight line-clamp-2">
                              {task.title}
                            </h4>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {task.ticket_ref && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono">
                                  {task.ticket_ref}
                                </span>
                              )}
                              {isStandalone && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted-foreground/10 text-muted-foreground font-mono">
                                  {t('standalone')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Progress bar for parent tasks */}
                      {!isStandalone && subtaskCount > 0 && (
                        <div className="mb-2">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span>{t('progress', { done: doneCount, total: subtaskCount })} {t('subtasks')}</span>
                            <span>{Math.round((doneCount / subtaskCount) * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all duration-300"
                              style={{ width: `${(doneCount / subtaskCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Footer: assignee + timestamp */}
                      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border/20">
                        <span className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
                          {task.assigned_to ? (
                            <>
                              <AgentAvatar name={getAgentName(task.assigned_to)} size="xs" />
                              <span className="truncate max-w-[8rem]">{getAgentName(task.assigned_to)}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50 italic">{t('unassigned')}</span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">{formatTaskTimestamp(task.created_at)}</span>
                      </div>
                    </div>
                  ))}

                  {/* Empty State */}
                  {cards.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/30">
                      <svg className="w-8 h-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M9 12h6M12 9v6" strokeLinecap="round" />
                      </svg>
                      <span className="text-xs">{t('dropTasksHere')}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Layer 2: Mission Report (shown when parent task has results) ── */}
      {selectedParentId !== null && selectedParentTask && (() => {
        // Find report content: check parent comments for Mission Report, or use sub-task results
        const parentDone = selectedParentTask.status === 'done' || selectedParentTask.status === 'review'
        if (!parentDone || layer2Tasks.length === 0) return null

        // Get the latest substantial comment from any completed subtask
        const completedSubs = layer2Tasks.filter(t => t.status === 'done' || t.status === 'review')
        if (completedSubs.length === 0) return null

        return (
          <MissionReportPanel parentTaskId={selectedParentId} subtasks={completedSubs} />
        )
      })()}

      {/* ── Layer 2: Tree View ── */}
      {selectedParentId !== null && viewMode === 'tree' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <TaskTreePanel parentId={selectedParentId} />
        </div>
      )}

      {/* ── Layer 2: Kanban Board (filtered to subtasks of selected parent) ── */}
      {selectedParentId !== null && viewMode === 'board' && <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-x-auto" role="region" aria-label={t('taskBoard')}>
        {statusColumns.map(column => (
          <div
            key={column.key}
            role="region"
            aria-label={t('columnAriaLabel', { title: column.title, count: tasksByStatus[column.key]?.length || 0 })}
            className="flex-1 min-w-80 min-h-0 bg-surface-0 border border-border/60 rounded-xl flex flex-col transition-colors duration-200 [&.drag-over]:border-primary/40 [&.drag-over]:bg-primary/[0.02]"
            onDragEnter={(e) => handleDragEnter(e, column.key)}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.key)}
          >
            {/* Column Header */}
            <div className={`${column.color} px-4 py-3 rounded-t-xl flex justify-between items-center border-b border-border/30`}>
              <h3 className="font-semibold text-sm tracking-wide">{column.title}</h3>
              <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded-md min-w-[1.75rem] text-center">
                {tasksByStatus[column.key]?.length || 0}
              </span>
            </div>

            {/* Column Body */}
            <div className="flex-1 p-2.5 space-y-2.5 min-h-32 h-full overflow-y-auto">
              {tasksByStatus[column.key]?.map(task => (
                <div
                  key={task.id}
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`${task.title}, ${task.priority} priority, ${task.status}`}
                  onDragStart={(e) => handleDragStart(e, task)}
                  onClick={() => {
                    setSelectedTask(task)
                    updateTaskUrl(task.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedTask(task)
                      updateTaskUrl(task.id)
                    }
                  }}
                  className={`group bg-card rounded-lg p-3 cursor-pointer border border-border/40 shadow-sm hover:shadow-md hover:shadow-black/10 hover:border-border/70 transition-all duration-200 ease-out border-l-4 ${priorityColors[task.priority]} ${
                    draggedTask?.id === task.id ? 'opacity-40 scale-[0.97] rotate-1' : ''
                  } ${(task as any).blocked_by && (task as any).blocked_by !== '[]' && JSON.parse((task as any).blocked_by || '[]').length > 0 ? 'opacity-50' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
                >
                  {/* Blocked + Team + Subtask indicators */}
                  {(() => {
                    const blockedBy = (() => { try { return JSON.parse((task as any).blocked_by || '[]') } catch { return [] } })()
                    const hasParent = !!(task as any).parent_task_id
                    const team = (task as any).team
                    const showIndicators = blockedBy.length > 0 || hasParent || team
                    if (!showIndicators) return null
                    return (
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        {blockedBy.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono" title={`Blocked by: ${blockedBy.map((id: number) => `TASK-${id}`).join(', ')}`}>
                            blocked
                          </span>
                        )}
                        {hasParent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono">
                            sub-task
                          </span>
                        )}
                        {team && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-mono">
                            {team}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                  {/* Drag handle + Title row */}
                  <div className="flex items-start gap-2 mb-2">
                    {/* Grip handle — visible on hover */}
                    <svg className="w-3.5 h-3.5 mt-0.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors shrink-0 cursor-grab" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
                      <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
                      <circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="text-foreground font-medium text-sm leading-tight line-clamp-2">
                          {task.title}
                        </h4>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {task.metadata?.recurrence?.enabled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono" title={task.metadata.recurrence.natural_text || task.metadata.recurrence.cron_expr}>
                              {t('recurring')}
                            </span>
                          )}
                          {task.metadata?.recurrence?.parent_task_id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70 font-mono" title={t('spawnedFromTask', { id: task.metadata.recurrence.parent_task_id })}>
                              {t('spawned')}
                            </span>
                          )}
                          {task.ticket_ref && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono">
                              {task.ticket_ref}
                            </span>
                          )}
                          {task.github_issue_number && task.github_repo && (
                            <a
                              href={`https://github.com/${task.github_repo}/issues/${task.github_issue_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[#24292e]/30 text-gray-300 hover:text-white font-mono flex items-center gap-1 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                              title={`GitHub issue #${task.github_issue_number}`}
                            >
                              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                              #{task.github_issue_number}
                            </a>
                          )}
                          {task.github_pr_number && task.github_repo && (
                            <a
                              href={`https://github.com/${task.github_repo}/pull/${task.github_pr_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono flex items-center gap-1 transition-colors ${
                                task.github_pr_state === 'merged' ? 'bg-purple-500/20 text-purple-400' :
                                task.github_pr_state === 'closed' ? 'bg-red-500/20 text-red-400' :
                                'bg-green-500/20 text-green-400'
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              title={`PR #${task.github_pr_number} (${task.github_pr_state || 'open'})`}
                            >
                              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/></svg>
                              PR #{task.github_pr_number}
                            </a>
                          )}
                          {task.aegisApproved && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                              Aegis
                            </span>
                          )}
                          {detectAwaitingOwner(task) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-mono">
                              {t('colAwaitingOwner')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {task.description && (
                    <div className="mb-2 ml-5.5 line-clamp-2 overflow-hidden text-xs text-muted-foreground">
                      <MarkdownRenderer content={task.description} preview />
                    </div>
                  )}

                  {/* Footer: assignee, priority, timestamp */}
                  <div className="flex items-center justify-between gap-2 ml-5.5 mt-auto pt-2 border-t border-border/20">
                    <span className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
                      {task.assigned_to ? (
                        <>
                          <AgentAvatar name={getAgentName(task.assigned_to)} size="xs" />
                          <span className="truncate max-w-[8rem]">{getAgentName(task.assigned_to)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/50 italic">{t('unassigned')}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {task.status !== 'done' && (
                        <DunkItButton taskId={task.id} onDunked={() => fetchData()} />
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        task.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                        task.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-green-500/20 text-green-400'
                      }`}>
                        {t(`priority_${task.priority}` as any)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">{formatTaskTimestamp(task.created_at)}</span>
                    </div>
                  </div>

                  {/* Tags row */}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 ml-5.5">
                      {task.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${getTagColor(tag)}`}
                        >
                          {tag}
                        </span>
                      ))}
                      {task.tags.length > 3 && (
                        <span className="text-muted-foreground/60 text-[10px]">+{task.tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Due date — prominent when overdue */}
                  {task.due_date && (
                    <div className="mt-1.5 ml-5.5 text-[10px]">
                      <span className={`inline-flex items-center gap-1 ${
                        task.due_date * 1000 < Date.now() ? 'text-red-400 font-medium' : 'text-muted-foreground/60'
                      }`}>
                        {task.due_date * 1000 < Date.now() ? '! ' : ''}{t('due')} {formatTaskTimestamp(task.due_date)}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Empty State */}
              {tasksByStatus[column.key]?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/30">
                  <svg className="w-8 h-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 12h6M12 9v6" strokeLinecap="round" />
                  </svg>
                  <span className="text-xs">{t('dropTasksHere')}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>}

      {/* Claude Code Tasks */}
      <ClaudeCodeTasksSection />

      {/* Hermes Scheduled Tasks */}
      <HermesCronSection />

      {/* Task Detail Modal */}
      {selectedTask && !editingTask && (
        <TaskDetailModal
          task={selectedTask}
          agents={agents}
          projects={projects}
          onClose={() => {
            setSelectedTask(null)
            updateTaskUrl(null)
          }}
          onUpdate={fetchData}
          onEdit={(taskToEdit) => {
            setEditingTask(taskToEdit)
            setSelectedTask(null)
            updateTaskUrl(null, 'replace')
          }}
          onDelete={fetchData}
        />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <CreateTaskModal
          agents={agents}
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchData}
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          agents={agents}
          projects={projects}
          onClose={() => setEditingTask(null)}
          onUpdated={() => { fetchData(); setEditingTask(null) }}
        />
      )}

      {showProjectManager && (
        <ProjectManagerModal
          onClose={() => setShowProjectManager(false)}
          onChanged={fetchData}
        />
      )}
    </div>
  )
}

// ── Mission Report Panel ──
// Shows the final report from completed sub-tasks directly in Layer 2
function MissionReportPanel({ parentTaskId, subtasks }: { parentTaskId: number; subtasks: Task[] }) {
  const t = useTranslations('taskBoard')
  const [report, setReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    async function fetchReport() {
      try {
        // 1. Check parent task comments for Mission Report
        const parentComments = await fetch(`/api/tasks/${parentTaskId}/comments`).then(r => r.json())
        const reportComment = (parentComments.comments || []).reverse().find(
          (c: Comment) => c.content?.includes('Mission Report') || c.content?.includes('# ')
        )
        if (reportComment?.content) {
          // Strip the "📋 **Mission Report**" prefix
          const cleaned = reportComment.content.replace(/^📋\s*\*\*Mission Report\*\*\s*/i, '').trim()
          setReport(cleaned)
          setLoading(false)
          return
        }

        // 2. Fallback: get latest substantial comment from completed sub-tasks
        for (const sub of subtasks) {
          const subComments = await fetch(`/api/tasks/${sub.id}/comments`).then(r => r.json())
          const agentComment = (subComments.comments || []).reverse().find(
            (c: Comment) => c.content?.length > 200 && !c.content?.startsWith('[executor')
          )
          if (agentComment?.content) {
            // Strip agent prefix like "[research-lead] "
            const cleaned = agentComment.content.replace(/^\[[\w-]+\]\s*/i, '').trim()
            setReport(cleaned)
            setLoading(false)
            return
          }
        }

        setReport(null)
        setLoading(false)
      } catch {
        setLoading(false)
      }
    }
    fetchReport()
  }, [parentTaskId, subtasks])

  if (loading) return null
  if (!report) return null

  return (
    <div className="mx-4 mt-3 mb-1 rounded-xl border border-border/40 bg-card/50 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{t('missionReport') || 'Report'}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
            {t('completed') || 'Completed'}
          </span>
        </div>
        <svg className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 border-t border-border/20">
          <div className="mt-3 prose prose-invert prose-sm max-w-none text-foreground/85 leading-relaxed">
            <MarkdownRenderer content={report} />
          </div>
        </div>
      )}
    </div>
  )
}

// Task Detail Modal Component (placeholder - would be implemented separately)
function TaskDetailModal({
  task,
  agents,
  projects,
  onClose,
  onUpdate,
  onEdit,
  onDelete
}: {
  task: Task
  agents: Agent[]
  projects: Project[]
  onClose: () => void
  onUpdate: () => void
  onEdit: (task: Task) => void
  onDelete: () => void
}) {
  const t = useTranslations('taskBoard')
  const router = useRouter()
  const { currentUser } = useMissionControl()
  const commentAuthor = currentUser?.username || 'system'
  const resolvedProjectName =
    task.project_name ||
    projects.find((project) => project.id === task.project_id)?.name
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved')
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewError, setReviewError] = useState<string | null>(null)
  const mentionTargets = useMentionTargets()
  const isAwaitingOwner = task.status === 'awaiting_owner' || detectAwaitingOwner(task)
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'quality' | 'session' | 'plan_review'>(isAwaitingOwner ? 'plan_review' : 'details')
  const [reviewer, setReviewer] = useState('aegis')
  const [planFeedback, setPlanFeedback] = useState('')
  const [planActionStatus, setPlanActionStatus] = useState<string | null>(null)

  const fetchReviews = useCallback(async () => {
    try {
      const response = await fetch(`/api/quality-review?taskId=${task.id}`)
      if (!response.ok) throw new Error('Failed to fetch reviews')
      const data = await response.json()
      setReviews(data.reviews || [])
    } catch (error) {
      setReviewError('Failed to load quality reviews')
    }
  }, [task.id])

  const fetchComments = useCallback(async () => {
    try {
      setLoadingComments(true)
      const response = await fetch(`/api/tasks/${task.id}/comments`)
      if (!response.ok) throw new Error('Failed to fetch comments')
      const data = await response.json()
      setComments(data.comments || [])
    } catch (error) {
      setCommentError('Failed to load comments')
    } finally {
      setLoadingComments(false)
    }
  }, [task.id])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])
  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])
  
  useSmartPoll(fetchComments, 15000)

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return

    try {
      setCommentError(null)
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: commentAuthor || 'system',
          content: commentText
        })
      })
      if (!response.ok) throw new Error('Failed to add comment')
      setCommentText('')
      await fetchComments()
      onUpdate()
    } catch (error) {
      setCommentError('Failed to add comment')
    }
  }

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastMessage.trim()) return

    try {
      setBroadcastStatus(null)
      const response = await fetch(`/api/tasks/${task.id}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: commentAuthor || 'system',
          message: broadcastMessage
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Broadcast failed')
      setBroadcastMessage('')
      setBroadcastStatus(t('broadcastSent', { count: data.sent || 0 }))
    } catch (error) {
      setBroadcastStatus('Failed to broadcast')
    }
  }

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setReviewError(null)
      const response = await fetch('/api/quality-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          reviewer,
          status: reviewStatus,
          notes: reviewNotes
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to submit review')
      setReviewNotes('')
      await fetchReviews()
      onUpdate()
    } catch (error) {
      setReviewError('Failed to submit review')
    }
  }

  const parseCommentContent = (raw: string): { text: string; meta?: { model?: string; provider?: string; durationMs?: number; tokens?: number } } => {
    // Strip ANSI escape codes
    const stripped = raw.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[3[0-9]m/g, '').replace(/\[39m/g, '')

    // Try to parse as JSON payload (OpenClaw agent result format)
    try {
      const parsed = JSON.parse(stripped)
      if (parsed && typeof parsed === 'object') {
        let text = ''
        let meta: { model?: string; provider?: string; durationMs?: number; tokens?: number } | undefined

        // Extract text from payloads array
        if (Array.isArray(parsed.payloads)) {
          text = parsed.payloads
            .map((p: any) => (typeof p === 'string' ? p : p?.text || '').trim())
            .filter(Boolean)
            .join('\n')
        }

        // Extract compact meta
        if (parsed.meta?.agentMeta) {
          const am = parsed.meta.agentMeta
          meta = {
            model: am.model,
            provider: am.provider,
            durationMs: parsed.meta.durationMs,
            tokens: am.usage?.total,
          }
        }

        if (text) return { text, meta }
      }
    } catch {
      // Not JSON — treat as plain text
    }

    // Clean up any remaining ANSI prefixes from log lines
    const cleaned = stripped
      .split('\n')
      .map(line => line.replace(/^\[[\w/-]+\]\s*/, '').trim())
      .filter(line => line && !line.startsWith('{') && !line.startsWith('"'))
      .join('\n')

    return { text: cleaned || stripped }
  }

  const renderComment = (comment: Comment, depth: number = 0) => {
    const { text, meta } = parseCommentContent(comment.content)
    return (
      <div key={comment.id} className={`border-l-2 border-border pl-3 ${depth > 0 ? 'ml-4' : ''}`}>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground/80">{comment.author}</span>
            {meta && (
              <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px] text-muted-foreground">
                {meta.model}{meta.tokens ? ` · ${meta.tokens.toLocaleString()} tok` : ''}{meta.durationMs ? ` · ${(meta.durationMs / 1000).toFixed(1)}s` : ''}
              </span>
            )}
          </div>
          <span>{new Date(comment.created_at * 1000).toLocaleString()}</span>
        </div>
        <div className="text-sm text-foreground/90 mt-1 prose prose-invert prose-sm max-w-none"><MarkdownRenderer content={text} /></div>
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {comment.replies.map(reply => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const dialogRef = useFocusTrap(onClose)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="task-detail-title" className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 id="task-detail-title" className="text-xl font-bold text-foreground">{task.title}</h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit(task)} className="text-primary hover:bg-primary/20">
                {t('edit')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!confirm(t('deleteTaskConfirm', { title: task.title }))) return
                  try {
                    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
                    if (!res.ok) {
                      const errorData = await res.json().catch(() => ({ error: 'Failed to delete task' }))
                      throw new Error(errorData.error || 'Failed to delete task')
                    }
                    // Close modal immediately on successful deletion
                    // SSE will handle the task.deleted event and remove the task from the UI
                    onClose()
                  } catch (error) {
                    // Show error to user
                    const errorMessage = error instanceof Error ? error.message : 'Failed to delete task'
                    alert(errorMessage)
                    // Don't close modal on error
                  }
                }}
              >
                {t('delete')}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label={t('closeTaskDetails')}
                className="text-xl"
              >
                ×
              </Button>
            </div>
          </div>
          {task.description ? (
            <div className="mb-4">
              <MarkdownRenderer content={task.description} />
            </div>
          ) : (
            <p className="text-foreground/80 mb-4">{t('noDescription')}</p>
          )}
          <div className="flex gap-2 mt-4" role="tablist" aria-label={t('taskDetailTabs')}>
            {(['details', 'comments', 'quality'] as const).map(tab => (
              <Button
                key={tab}
                role="tab"
                size="sm"
                variant={activeTab === tab ? 'default' : 'secondary'}
                aria-selected={activeTab === tab}
                aria-controls={`tabpanel-${tab}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'details' ? t('tabDetails') : tab === 'comments' ? t('tabComments') : t('tabQualityReview')}
              </Button>
            ))}
            {task.metadata?.dispatch_session_id && (
              <Button
                role="tab"
                size="sm"
                variant={activeTab === 'session' ? 'default' : 'secondary'}
                aria-selected={activeTab === 'session'}
                aria-controls="tabpanel-session"
                onClick={() => setActiveTab('session')}
              >
                {t('tabSession')}
                {task.status === 'in_progress' && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                )}
              </Button>
            )}
            {isAwaitingOwner && (
              <Button
                role="tab"
                size="sm"
                variant={activeTab === 'plan_review' ? 'default' : 'secondary'}
                aria-selected={activeTab === 'plan_review'}
                aria-controls="tabpanel-plan-review"
                onClick={() => setActiveTab('plan_review')}
                className={activeTab === 'plan_review' ? '' : 'border border-orange-500/30 text-orange-400'}
              >
                {t('planReview')}
              </Button>
            )}
          </div>

          {activeTab === 'details' && (
            <div id="tabpanel-details" role="tabpanel" aria-label={t('tabDetails')} className="grid grid-cols-2 gap-4 text-sm mt-4">
              {task.ticket_ref && (
                <div>
                  <span className="text-muted-foreground">{t('ticket')}:</span>
                  <span className="text-foreground ml-2 font-mono">{task.ticket_ref}</span>
                </div>
              )}
              {resolvedProjectName && (
                <div>
                  <span className="text-muted-foreground">{t('project')}:</span>
                  <span className="text-foreground ml-2">{resolvedProjectName}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">{t('status')}:</span>
                <span className="text-foreground ml-2">{task.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('priority')}:</span>
                <span className="text-foreground ml-2">{t(`priority_${task.priority}` as any)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('assignedTo')}:</span>
                <span className="text-foreground ml-2 inline-flex items-center gap-1.5">
                  {task.assigned_to ? (
                    <>
                      <AgentAvatar name={task.assigned_to} size="xs" />
                      <span>{task.assigned_to}</span>
                    </>
                  ) : (
                    <span>{t('unassigned')}</span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('created')}:</span>
                <span className="text-foreground ml-2">{new Date(task.created_at * 1000).toLocaleDateString()}</span>
              </div>
              {(task.github_issue_number || task.github_branch || task.github_pr_number) && (
                <>
                  <div className="col-span-2 mt-2 pt-2 border-t border-border/50">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">GitHub</span>
                  </div>
                  {task.github_issue_number && task.github_repo && (
                    <div>
                      <span className="text-muted-foreground">{t('issue')}:</span>
                      <a
                        href={`https://github.com/${task.github_repo}/issues/${task.github_issue_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline ml-2 font-mono"
                      >
                        {task.github_repo}#{task.github_issue_number}
                      </a>
                    </div>
                  )}
                  {task.github_branch && (
                    <div>
                      <span className="text-muted-foreground">{t('branch')}:</span>
                      <span className="text-foreground ml-2 font-mono text-xs">{task.github_branch}</span>
                    </div>
                  )}
                  {task.github_pr_number && task.github_repo && (
                    <div>
                      <span className="text-muted-foreground">{t('pr')}:</span>
                      <a
                        href={`https://github.com/${task.github_repo}/pull/${task.github_pr_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`ml-2 font-mono hover:underline ${
                          task.github_pr_state === 'merged' ? 'text-purple-400' :
                          task.github_pr_state === 'closed' ? 'text-red-400' :
                          'text-green-400'
                        }`}
                      >
                        #{task.github_pr_number} ({task.github_pr_state || 'open'})
                      </a>
                    </div>
                  )}
                </>
              )}
              {task.metadata?.dispatch_session_id && (
                <>
                  <div className="col-span-2 mt-2 pt-2 border-t border-border/50">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Agent Session</span>
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveTab('session')}
                      className="font-mono text-xs"
                    >
                      View Session {task.metadata.dispatch_session_id.slice(0, 8)}...
                    </Button>
                    {task.status === 'in_progress' && (
                      <span className="ml-2 text-xs text-green-400 animate-pulse">{t('live')}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div id="tabpanel-comments" role="tabpanel" aria-label={t('tabComments')} className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold text-foreground">{t('tabComments')}</h4>
              <Button variant="link" size="xs" onClick={fetchComments} className="text-blue-400 hover:text-blue-300">
                {t('refresh')}
              </Button>
            </div>

            {commentError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2 rounded-md text-sm mb-3">
                {commentError}
              </div>
            )}

            {loadingComments ? (
              <div className="text-muted-foreground text-sm">{t('loadingComments')}</div>
            ) : comments.length === 0 ? (
              <div className="text-muted-foreground/50 text-sm">{t('noComments')}</div>
            ) : (
              <div className="space-y-4">
                {comments.map(comment => renderComment(comment))}
              </div>
            )}

            <form onSubmit={handleAddComment} className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t('postingAs')}</span>
                <span className="font-medium text-foreground">{commentAuthor}</span>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('newComment')}</label>
                <MentionTextarea
                  value={commentText}
                  onChange={setCommentText}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  rows={3}
                  mentionTargets={mentionTargets}
                />
                <p className="text-[11px] text-muted-foreground mt-1">{t.rich('mentionHint', { mention: (chunks) => <span className="font-mono">{chunks}</span> })}</p>
              </div>
              <div className="flex justify-end">
                <Button type="submit">
                  {t('addComment')}
                </Button>
              </div>
            </form>

            <div className="mt-5 bg-blue-500/5 border border-blue-500/15 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-blue-300">{t('howNotificationsWork')}</div>
              <div>{t.rich('notifCommentsExplain', { strong: (chunks) => <strong className="text-foreground">{chunks}</strong> })}</div>
              <div>{t.rich('notifBroadcastsExplain', { strong: (chunks) => <strong className="text-foreground">{chunks}</strong> })}</div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <h5 className="text-sm font-medium text-foreground mb-2">{t('broadcastToSubscribers')}</h5>
              {broadcastStatus && (
                <div className="text-xs text-muted-foreground mb-2">{broadcastStatus}</div>
              )}
              <form onSubmit={handleBroadcast} className="space-y-2">
                <MentionTextarea
                  value={broadcastMessage}
                  onChange={setBroadcastMessage}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  rows={2}
                  placeholder={t('broadcastPlaceholder')}
                  mentionTargets={mentionTargets}
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" className="bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30">
                    {t('broadcast')}
                  </Button>
                </div>
              </form>
            </div>
          </div>
          )}

          {activeTab === 'quality' && (
            <div id="tabpanel-quality" role="tabpanel" aria-label={t('tabQualityReview')} className="mt-6">
              <h5 className="text-sm font-medium text-foreground mb-2">{t('aegisQualityReview')}</h5>
              {reviewError && (
                <div className="text-xs text-red-400 mb-2">{reviewError}</div>
              )}
              {reviews.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {reviews.map((review) => (
                    <div key={review.id} className="text-xs text-foreground/80 bg-surface-1/40 rounded p-2">
                      <div className="flex justify-between">
                        <span>{review.reviewer} — {review.status}</span>
                        <span>{new Date(review.created_at * 1000).toLocaleString()}</span>
                      </div>
                      {review.notes && <div className="mt-1">{review.notes}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mb-3">{t('noReviews')}</div>
              )}
              <form onSubmit={handleSubmitReview} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                    className="bg-surface-1 text-foreground border border-border rounded-md px-2 py-1 text-xs"
                    placeholder={t('reviewerPlaceholder')}
                  />
                  <select
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value as 'approved' | 'rejected')}
                    className="bg-surface-1 text-foreground border border-border rounded-md px-2 py-1 text-xs"
                  >
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                  </select>
                  <input
                    type="text"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="flex-1 bg-surface-1 text-foreground border border-border rounded-md px-2 py-1 text-xs"
                    placeholder={t('reviewNotesPlaceholder')}
                  />
                  <Button type="submit" variant="success" size="xs">
                    {t('submit')}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'session' && task.metadata?.dispatch_session_id && (
            <div id="tabpanel-session" role="tabpanel" aria-label="Session" className="mt-4">
              <TaskSessionFeed
                sessionId={task.metadata.dispatch_session_id}
                agentName={task.assigned_to}
                isLive={task.status === 'in_progress'}
              />
            </div>
          )}

          {activeTab === 'plan_review' && (
            <PlanReviewPanel
              task={task}
              comments={comments}
              planFeedback={planFeedback}
              setPlanFeedback={setPlanFeedback}
              planActionStatus={planActionStatus}
              setPlanActionStatus={setPlanActionStatus}
              onUpdate={onUpdate}
              onClose={onClose}
              commentAuthor={commentAuthor}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function PlanReviewPanel({
  task,
  comments,
  planFeedback,
  setPlanFeedback,
  planActionStatus,
  setPlanActionStatus,
  onUpdate,
  onClose,
  commentAuthor,
}: {
  task: Task
  comments: Comment[]
  planFeedback: string
  setPlanFeedback: (v: string) => void
  planActionStatus: string | null
  setPlanActionStatus: (v: string | null) => void
  onUpdate: () => void
  onClose: () => void
  commentAuthor: string
}) {
  const t = useTranslations('taskBoard')

  // Find the latest comment containing a plan (## heading or plan keywords)
  const planComment = [...comments].reverse().find(c => {
    const content = c.content || ''
    return /^##\s/m.test(content) || /plan|計畫/i.test(content)
  })

  const planContent = planComment?.content || null

  const handleApprove = async () => {
    try {
      setPlanActionStatus(null)
      // Set task status to assigned (resumes pipeline)
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'assigned' }),
      })
      if (!res.ok) throw new Error('Failed to approve')
      // Post approval comment
      await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: commentAuthor,
          content: `**Plan Approved** -- pipeline will resume.`,
        }),
      })
      setPlanActionStatus(t('planApproved'))
      onUpdate()
      setTimeout(() => onClose(), 1500)
    } catch {
      setPlanActionStatus('Failed to approve plan')
    }
  }

  const handleRequestChanges = async () => {
    if (!planFeedback.trim()) return
    try {
      setPlanActionStatus(null)
      // Post feedback comment
      await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: commentAuthor,
          content: `**Changes Requested:**\n\n${planFeedback}`,
        }),
      })
      // Set task status to rework_requested (or assigned to trigger rework)
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'assigned' }),
      })
      setPlanActionStatus(t('changesRequested'))
      setPlanFeedback('')
      onUpdate()
      setTimeout(() => onClose(), 1500)
    } catch {
      setPlanActionStatus('Failed to request changes')
    }
  }

  return (
    <div id="tabpanel-plan-review" role="tabpanel" aria-label={t('planReview')} className="mt-4 space-y-4">
      <h4 className="text-lg font-semibold text-foreground flex items-center gap-2">
        {t('planReview')}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-mono">
          awaiting_owner
        </span>
      </h4>

      {planContent ? (
        <div className="bg-surface-1 border border-border rounded-lg p-4 max-h-[40vh] overflow-y-auto prose prose-invert prose-sm max-w-none">
          <MarkdownRenderer content={planContent} />
        </div>
      ) : (
        <div className="bg-surface-1 border border-border rounded-lg p-6 text-center text-muted-foreground">
          {t('noPlanFound')}
        </div>
      )}

      {planActionStatus && (
        <div className="text-sm px-3 py-2 rounded bg-green-500/10 border border-green-500/20 text-green-400">
          {planActionStatus}
        </div>
      )}

      <div className="flex flex-col gap-3 pt-2 border-t border-border">
        <Button
          onClick={handleApprove}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {t('approvePlan')}
        </Button>

        <div className="space-y-2">
          <textarea
            value={planFeedback}
            onChange={(e) => setPlanFeedback(e.target.value)}
            placeholder={t('changesFeedback')}
            rows={3}
            className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder-muted-foreground"
          />
          <Button
            onClick={handleRequestChanges}
            disabled={!planFeedback.trim()}
            variant="outline"
            className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
          >
            {t('requestChanges')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TaskSessionFeed({ sessionId, agentName, isLive }: { sessionId: string; agentName?: string; isLive: boolean }) {
  const t = useTranslations('taskBoard')
  const [messages, setMessages] = useState<SessionTranscriptMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  const fetchTranscript = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/transcript?kind=claude-code&id=${encodeURIComponent(sessionId)}&limit=100`)
      if (!res.ok) throw new Error(`Failed to fetch transcript: ${res.status}`)
      const data = await res.json()
      setMessages(data.messages || [])
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load session transcript')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  // Initial fetch
  useEffect(() => { fetchTranscript() }, [fetchTranscript])

  // Auto-refresh when live
  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(fetchTranscript, 5000)
    return () => clearInterval(interval)
  }, [isLive, fetchTranscript])

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    prevCountRef.current = messages.length
  }, [messages.length])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {agentName && (
            <span className="flex items-center gap-1.5">
              <AgentAvatar name={agentName} size="xs" />
              <span className="font-medium text-foreground">{agentName}</span>
            </span>
          )}
          <span className="font-mono text-muted-foreground/50">{sessionId.slice(0, 12)}...</span>
          {isLive && (
            <span className="flex items-center gap-1 text-green-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              {t('live')}
            </span>
          )}
        </div>
        <Button variant="link" size="xs" onClick={fetchTranscript} className="text-blue-400 hover:text-blue-300">
          {t('refresh')}
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2 rounded-md text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm py-4 text-center">{t('loadingTranscript')}</div>
      ) : messages.length === 0 ? (
        <div className="text-muted-foreground/50 text-sm py-4 text-center">{t('noSessionMessages')}</div>
      ) : (
        <div ref={scrollRef} className="max-h-[50vh] overflow-y-auto space-y-0.5 rounded border border-border/30 bg-black/10 p-2">
          {messages.map((msg, idx) => (
            <SessionMessage
              key={idx}
              message={msg}
              showTimestamp={shouldShowTimestamp(msg, messages[idx - 1])}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Claude Code Tasks Section — read-only bridge
function ClaudeCodeTasksSection() {
  const t = useTranslations('taskBoard')
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<{ teams: any[]; tasks: any[] }>({ teams: [], tasks: [] })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!expanded || loaded) return
    fetch('/api/claude-tasks')
      .then(r => r.json())
      .then(d => { setData(d); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [expanded, loaded])

  const tasksByTeam = data.tasks.reduce<Record<string, any[]>>((acc, t) => {
    (acc[t.teamName] ||= []).push(t)
    return acc
  }, {})

  const statusColor = (s: string) =>
    s === 'completed' ? 'text-green-400' :
    s === 'in_progress' ? 'text-blue-400' :
    s === 'blocked' ? 'text-red-400' :
    s === 'awaiting_owner' ? 'text-orange-400' :
    'text-muted-foreground'

  return (
    <div className="mt-4 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-secondary/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{t('claudeCodeTasks')}</span>
          {data.tasks.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">{data.tasks.length}</span>
          )}
        </div>
        <span className="text-muted-foreground text-xs">{expanded ? t('collapse') : t('expand')}</span>
      </button>
      {expanded && (
        <div className="p-4 border-t border-border space-y-4">
          {!loaded ? (
            <div className="text-sm text-muted-foreground">{t('loading')}</div>
          ) : data.tasks.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              <p className="font-medium">{t('noTeamTasksFound')}</p>
              <p className="text-xs mt-1 text-muted-foreground/70">{t('noTeamTasksDesc')}</p>
            </div>
          ) : (
            Object.entries(tasksByTeam).map(([team, tasks]) => (
              <div key={team}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-foreground">{team}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{t('taskCount', { count: tasks.length })}</span>
                  {data.teams.find(t => t.name === team)?.members?.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {data.teams.find(t => t.name === team).members.map((m: any) => m.name).join(', ')}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {tasks.map((task: any) => (
                    <div key={task.id} className="flex items-center gap-3 px-3 py-2 rounded bg-surface-1 border border-border text-sm">
                      <span className={`text-[10px] font-mono ${statusColor(task.status)}`}>{task.status}</span>
                      <span className="text-foreground flex-1 truncate">{task.subject}</span>
                      {task.owner && <span className="text-[10px] text-muted-foreground">{task.owner}</span>}
                      {task.blockedBy?.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{t('blocked')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function HermesCronSection() {
  const t = useTranslations('taskBoard')
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<{ cronJobs: any[] }>({ cronJobs: [] })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!expanded || loaded) return
    fetch('/api/hermes/tasks')
      .then(r => r.json())
      .then(d => { setData(d); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [expanded, loaded])

  return (
    <div className="mt-4 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-secondary/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{t('hermesScheduledTasks')}</span>
          {data.cronJobs.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">{data.cronJobs.length}</span>
          )}
        </div>
        <span className="text-muted-foreground text-xs">{expanded ? t('collapse') : t('expand')}</span>
      </button>
      {expanded && (
        <div className="p-4 border-t border-border space-y-2">
          {!loaded ? (
            <div className="text-sm text-muted-foreground">{t('loading')}</div>
          ) : data.cronJobs.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              <p className="font-medium">{t('noScheduledTasksFound')}</p>
              <p className="text-xs mt-1 text-muted-foreground/70">{t('noScheduledTasksDesc')}</p>
            </div>
          ) : (
            data.cronJobs.map((job: any) => (
              <div key={job.id} className="flex items-center gap-3 px-3 py-2 rounded bg-surface-1 border border-border text-sm">
                <span className={`text-[10px] font-mono shrink-0 ${job.enabled ? 'text-purple-400' : 'text-muted-foreground/50'}`}>
                  {job.schedule || t('noSchedule')}
                </span>
                <span className="text-foreground flex-1 truncate">{job.prompt || job.id}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${job.enabled ? 'bg-green-500/15 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                  {job.enabled ? t('enabled') : t('disabled')}
                </span>
                {job.lastRunAt && (
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">{job.lastRunAt}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Create Task Modal Component (placeholder)
function CreateTaskModal({
  agents, 
  projects,
  onClose, 
  onCreated 
}: { 
  agents: Agent[]
  projects: Project[]
  onClose: () => void
  onCreated: () => void
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    project_id: projects[0]?.id ? String(projects[0].id) : '',
    assigned_to: '',
    tags: '',
    target_session: '',
  })
  const [taskImages, setTaskImages] = useState<Array<{ name: string; dataUrl: string }>>([])
  const taskFileRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('taskBoard')
  const agentSessions = useAgentSessions(formData.assigned_to || undefined)
  const [isRecurring, setIsRecurring] = useState(false)
  const [scheduleInput, setScheduleInput] = useState('')
  const [parsedSchedule, setParsedSchedule] = useState<{ cronExpr: string; humanReadable: string } | null>(null)
  const [scheduleError, setScheduleError] = useState('')
  const mentionTargets = useMentionTargets()

  const handleScheduleChange = async (value: string) => {
    setScheduleInput(value)
    setScheduleError('')
    setParsedSchedule(null)
    if (!value.trim()) return
    try {
      const res = await fetch(`/api/schedule-parse?input=${encodeURIComponent(value.trim())}`)
      const data = await res.json()
      if (data.cronExpr) {
        setParsedSchedule(data)
      } else {
        setScheduleError('Could not parse schedule')
      }
    } catch {
      setScheduleError('Parse failed')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) return
    if (isRecurring && !parsedSchedule) return

    const metadata: Record<string, unknown> = {}
    if (isRecurring && parsedSchedule) {
      metadata.recurrence = {
        cron_expr: parsedSchedule.cronExpr,
        natural_text: parsedSchedule.humanReadable,
        enabled: true,
        last_spawned_at: null,
        spawn_count: 0,
        parent_task_id: null,
      }
    }
    if (formData.target_session) {
      metadata.target_session = formData.target_session
    }
    if (taskImages.length > 0) {
      metadata.attachments = taskImages.map(img => ({
        name: img.name,
        type: 'image',
        dataUrl: img.dataUrl,
      }))
    }

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          project_id: formData.project_id ? Number(formData.project_id) : undefined,
          tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
          assigned_to: formData.assigned_to || undefined,
          metadata,
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMsg = errorData.details ? errorData.details.join(', ') : errorData.error
        throw new Error(errorMsg)
      }

      onCreated()
      onClose()
    } catch (error) {
      log.error('Error creating task:', error)
    }
  }

  const dialogRef = useFocusTrap(onClose)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-task-title" className="bg-card border border-border rounded-lg max-w-md w-full">
        <form onSubmit={handleSubmit} className="p-6">
          <h3 id="create-task-title" className="text-xl font-bold text-foreground mb-4">{t('createNewTask')}</h3>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="create-title" className="block text-sm text-muted-foreground mb-1">{t('fieldTitle')}</label>
              <input
                id="create-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                required
              />
            </div>
            
            <div>
              <label htmlFor="create-description" className="block text-sm text-muted-foreground mb-1">{t('fieldDescription')}</label>
              <MentionTextarea
                id="create-description"
                value={formData.description}
                onChange={(next) => setFormData(prev => ({ ...prev, description: next }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                rows={3}
                mentionTargets={mentionTargets}
              />
              <p className="text-[11px] text-muted-foreground mt-1">{t.rich('mentionTip', { mention: (chunks) => <span className="font-mono">{chunks}</span> })}</p>
            </div>

            {/* Image attachments */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('attachments')}</label>
              <div
                className="border border-dashed border-border/60 rounded-md p-2 min-h-[40px] cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => taskFileRef.current?.click()}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file') {
                      const file = items[i].getAsFile();
                      if (file && file.size < 10 * 1024 * 1024) {
                        const reader = new FileReader();
                        reader.onload = () => setTaskImages(prev => [...prev, { name: file.name, dataUrl: reader.result as string }]);
                        reader.readAsDataURL(file);
                      }
                    }
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  for (const file of Array.from(e.dataTransfer.files)) {
                    if (file.size < 10 * 1024 * 1024) {
                      const reader = new FileReader();
                      reader.onload = () => setTaskImages(prev => [...prev, { name: file.name, dataUrl: reader.result as string }]);
                      reader.readAsDataURL(file);
                    }
                  }
                }}
              >
                {taskImages.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-1">{t('pasteOrDragImages')}</p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {taskImages.map((img, i) => (
                      <div key={i} className="relative group">
                        {img.dataUrl.startsWith('data:image') ? (
                          <img src={img.dataUrl} alt={img.name} className="h-16 w-16 object-cover rounded border border-border/40" />
                        ) : (
                          <div className="h-16 w-16 flex flex-col items-center justify-center rounded border border-border/40 bg-surface-1">
                            <span className="text-lg">{
                              img.name.match(/\.pdf$/i) ? '📄' :
                              img.name.match(/\.docx?$/i) ? '📝' :
                              img.name.match(/\.xlsx?$|\.csv$/i) ? '📊' :
                              img.name.match(/\.pptx?$/i) ? '📋' :
                              img.name.match(/\.mp4$|\.mov$|\.avi$/i) ? '🎬' :
                              '📎'
                            }</span>
                            <span className="text-[8px] text-muted-foreground truncate w-full text-center px-0.5">{img.name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); setTaskImages(prev => prev.filter((_, j) => j !== i)); }}
                        >x</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input ref={taskFileRef} type="file" multiple className="hidden" onChange={(e) => {
                for (const file of Array.from(e.target.files || [])) {
                  const reader = new FileReader();
                  reader.onload = () => setTaskImages(prev => [...prev, { name: file.name, dataUrl: reader.result as string }]);
                  reader.readAsDataURL(file);
                }
                e.target.value = '';
              }} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="create-priority" className="block text-sm text-muted-foreground mb-1">{t('fieldPriority')}</label>
                <select
                  id="create-priority"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as Task['priority'] }))}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="low">{t('priority_low')}</option>
                  <option value="medium">{t('priority_medium')}</option>
                  <option value="high">{t('priority_high')}</option>
                  <option value="critical">{t('priority_critical')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="create-project" className="block text-sm text-muted-foreground mb-1">{t('fieldProject')}</label>
                <select
                  id="create-project"
                  value={formData.project_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {projects.map(project => (
                    <option key={project.id} value={String(project.id)}>
                      {project.name} ({project.ticket_prefix})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="create-assignee" className="block text-sm text-muted-foreground mb-1">{t('fieldAssignTo')}</label>
              <select
                id="create-assignee"
                value={formData.assigned_to}
                onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value, target_session: '' }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">{t('unassigned')}</option>
                {agents.map(agent => (
                  <option key={agent.name} value={agent.name}>
                    {agent.name} ({agent.role})
                  </option>
                ))}
              </select>
            </div>

            {formData.assigned_to && agentSessions.length > 0 && (
              <div>
                <label htmlFor="create-target-session" className="block text-sm text-muted-foreground mb-1">{t('targetSession')}</label>
                <select
                  id="create-target-session"
                  value={formData.target_session}
                  onChange={(e) => setFormData(prev => ({ ...prev, target_session: e.target.value }))}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="">{t('newSessionDefault')}</option>
                  {agentSessions.map(s => (
                    <option key={s.key} value={s.key}>
                      {s.displayLabel}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">{t('targetSessionHint')}</p>
              </div>
            )}

            <div>
              <label htmlFor="create-tags" className="block text-sm text-muted-foreground mb-1">{t('fieldTags')}</label>
              <input
                id="create-tags"
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder={t('tagsPlaceholder')}
              />
            </div>

            {/* Recurring Schedule */}
            <div className="border border-border rounded-md p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => {
                    setIsRecurring(e.target.checked)
                    if (!e.target.checked) {
                      setParsedSchedule(null)
                      setScheduleInput('')
                      setScheduleError('')
                    }
                  }}
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">{t('makeRecurring')}</span>
              </label>
              {isRecurring && (
                <div>
                  <input
                    type="text"
                    value={scheduleInput}
                    onChange={(e) => handleScheduleChange(e.target.value)}
                    className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={t('schedulePlaceholder')}
                  />
                  {parsedSchedule && (
                    <p className="text-xs text-cyan-400 mt-1">
                      {parsedSchedule.humanReadable} <span className="text-muted-foreground font-mono">({parsedSchedule.cronExpr})</span>
                    </p>
                  )}
                  {scheduleError && (
                    <p className="text-xs text-red-400 mt-1">{scheduleError}. {t('scheduleErrorHint')}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button type="submit" className="flex-1" disabled={isRecurring && !parsedSchedule}>
              {isRecurring ? t('createRecurringTask') : t('createTask')}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              {t('cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Task Modal Component
function EditTaskModal({
  task,
  agents,
  projects,
  onClose,
  onUpdated
}: {
  task: Task
  agents: Agent[]
  projects: Project[]
  onClose: () => void
  onUpdated: () => void
}) {
  const t = useTranslations('taskBoard')
  const [formData, setFormData] = useState({
    title: task.title,
    description: task.description || '',
    priority: task.priority,
    status: task.status,
    project_id: task.project_id ? String(task.project_id) : (projects[0]?.id ? String(projects[0].id) : ''),
    assigned_to: task.assigned_to || '',
    tags: task.tags ? task.tags.join(', ') : '',
    target_session: task.metadata?.target_session || '',
  })
  const mentionTargets = useMentionTargets()
  const agentSessions = useAgentSessions(formData.assigned_to || undefined)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) return

    try {
      const existingMeta = task.metadata || {}
      const updatedMeta = { ...existingMeta }
      if (formData.target_session) {
        updatedMeta.target_session = formData.target_session
      } else {
        delete updatedMeta.target_session
      }

      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          project_id: formData.project_id ? Number(formData.project_id) : undefined,
          tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
          assigned_to: formData.assigned_to || undefined,
          metadata: updatedMeta,
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMsg = errorData.details ? errorData.details.join(', ') : errorData.error
        throw new Error(errorMsg)
      }

      onUpdated()
    } catch (error) {
      log.error('Error updating task:', error)
    }
  }

  const dialogRef = useFocusTrap(onClose)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-task-title" className="bg-card border border-border rounded-lg max-w-md w-full">
        <form onSubmit={handleSubmit} className="p-6">
          <h3 id="edit-task-title" className="text-xl font-bold text-foreground mb-4">{t('editTask')}</h3>

          <div className="space-y-4">
            <div>
              <label htmlFor="edit-title" className="block text-sm text-muted-foreground mb-1">{t('fieldTitle')}</label>
              <input
                id="edit-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                required
              />
            </div>

            <div>
              <label htmlFor="edit-description" className="block text-sm text-muted-foreground mb-1">{t('fieldDescription')}</label>
              <MentionTextarea
                id="edit-description"
                value={formData.description}
                onChange={(next) => setFormData(prev => ({ ...prev, description: next }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                rows={3}
                mentionTargets={mentionTargets}
              />
              <p className="text-[11px] text-muted-foreground mt-1">{t.rich('mentionTip', { mention: (chunks) => <span className="font-mono">{chunks}</span> })}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-status" className="block text-sm text-muted-foreground mb-1">{t('fieldStatus')}</label>
                <select
                  id="edit-status"
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as Task['status'] }))}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="inbox">{t('colInbox')}</option>
                  <option value="assigned">{t('colAssigned')}</option>
                  <option value="in_progress">{t('colInProgress')}</option>
                  <option value="review">{t('colReview')}</option>
                  <option value="quality_review">{t('colQualityReview')}</option>
                  <option value="done">{t('colDone')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-priority" className="block text-sm text-muted-foreground mb-1">{t('fieldPriority')}</label>
                <select
                  id="edit-priority"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as Task['priority'] }))}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="low">{t('priority_low')}</option>
                  <option value="medium">{t('priority_medium')}</option>
                  <option value="high">{t('priority_high')}</option>
                  <option value="critical">{t('priority_critical')}</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="edit-project" className="block text-sm text-muted-foreground mb-1">{t('fieldProject')}</label>
              <select
                id="edit-project"
                value={formData.project_id}
                onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {projects.map(project => (
                  <option key={project.id} value={String(project.id)}>
                    {project.name} ({project.ticket_prefix})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-assignee" className="block text-sm text-muted-foreground mb-1">{t('fieldAssignTo')}</label>
              <select
                id="edit-assignee"
                value={formData.assigned_to}
                onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value, target_session: '' }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">{t('unassigned')}</option>
                {agents.map(agent => (
                  <option key={agent.name} value={agent.name}>
                    {agent.name} ({agent.role})
                  </option>
                ))}
              </select>
            </div>

            {formData.assigned_to && agentSessions.length > 0 && (
              <div>
                <label htmlFor="edit-target-session" className="block text-sm text-muted-foreground mb-1">{t('targetSession')}</label>
                <select
                  id="edit-target-session"
                  value={formData.target_session}
                  onChange={(e) => setFormData(prev => ({ ...prev, target_session: e.target.value }))}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="">{t('newSessionDefault')}</option>
                  {agentSessions.map(s => (
                    <option key={s.key} value={s.key}>
                      {s.displayLabel}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">{t('targetSessionHint')}</p>
              </div>
            )}

            <div>
              <label htmlFor="edit-tags" className="block text-sm text-muted-foreground mb-1">{t('fieldTags')}</label>
              <input
                id="edit-tags"
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder={t('tagsPlaceholder')}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button type="submit" className="flex-1">
              {t('saveChanges')}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              {t('cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
