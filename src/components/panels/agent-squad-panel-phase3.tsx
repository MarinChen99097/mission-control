'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { createClientLogger } from '@/lib/client-logger'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import {
  OverviewTab,
  SoulTab,
  MemoryTab,
  TasksTab,
  ActivityTab,
  ConfigTab,
  FilesTab,
  ToolsTab,
  ChannelsTab,
  CronTab,
  ModelsTab,
  CreateAgentModal
} from './agent-detail-tabs'
import { formatModelName, buildTaskStatParts } from '@/lib/agent-card-helpers'
import { useMissionControl, type Agent } from '@/store'

const log = createClientLogger('AgentSquadPhase3')

interface WorkItem {
  type: string
  count: number
  items: any[]
}

interface HeartbeatResponse {
  status: 'HEARTBEAT_OK' | 'WORK_ITEMS_FOUND'
  agent: string
  checked_at: number
  work_items?: WorkItem[]
  total_items?: number
  message?: string
}

interface SoulTemplate {
  name: string
  description: string
  size: number
}

const statusColors: Record<string, string> = {
  offline: 'bg-gray-500',
  idle: 'bg-green-500',
  busy: 'bg-yellow-500',
  error: 'bg-red-500',
}

const statusBadgeStyles: Record<string, string> = {
  offline: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  idle: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  busy: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

const statusIcons: Record<string, string> = {
  offline: '-',
  idle: 'o',
  busy: '~',
  error: '!',
}

const defaultCardStyle = {
  edge: 'from-slate-400/60 to-slate-600/30',
  glow: 'from-slate-500/10 via-transparent to-transparent',
  dot: 'bg-slate-400',
}

const statusCardStyles: Record<string, { edge: string; glow: string; dot: string }> = {
  offline: defaultCardStyle,
  idle: {
    edge: 'from-emerald-300/80 to-emerald-600/30',
    glow: 'from-emerald-400/15 via-transparent to-transparent',
    dot: 'bg-emerald-300',
  },
  busy: {
    edge: 'from-amber-300/80 to-amber-600/30',
    glow: 'from-amber-400/15 via-transparent to-transparent',
    dot: 'bg-amber-300',
  },
  error: {
    edge: 'from-rose-300/80 to-rose-600/30',
    glow: 'from-rose-400/15 via-transparent to-transparent',
    dot: 'bg-rose-300',
  },
}

function useAgentDisplayName() {
  const ta = useTranslations('agentNames')
  return (name: string) => {
    try { return ta(name as any) } catch { return name }
  }
}

function useAgentDescription() {
  const ta = useTranslations('agentNames')
  return (name: string) => {
    try { return ta(`${name}_desc` as any) } catch { return null }
  }
}

export function AgentSquadPanelPhase3() {
  const t = useTranslations('agentSquadPhase3')
  const getDisplayName = useAgentDisplayName()
  const getAgentDesc = useAgentDescription()
  const { agents, setAgents } = useMissionControl()
  const [loading, setLoading] = useState(agents.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showQuickSpawnModal, setShowQuickSpawnModal] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncToast, setSyncToast] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)

  // Sync agents from gateway config or local disk
  const syncFromConfig = async (source?: 'local') => {
    setSyncing(true)
    setSyncToast(null)
    try {
      const url = source === 'local' ? '/api/agents/sync?source=local' : '/api/agents/sync'
      const response = await fetch(url, { method: 'POST' })
      if (response.status === 401) {
        window.location.assign('/login?next=%2Fagents')
        return
      }
      const data = await response.json()
      if (response.status === 403) {
        throw new Error('Admin access required for agent sync')
      }
      if (!response.ok) throw new Error(data.error || 'Sync failed')
      if (source === 'local') {
        setSyncToast(data.message || 'Local agent sync complete')
      } else {
        setSyncToast(`Synced ${data.synced} agents (${data.created} new, ${data.updated} updated)`)
      }
      fetchAgents()
      setTimeout(() => setSyncToast(null), 5000)
    } catch (err: any) {
      setSyncToast(`Sync failed: ${err.message}`)
      setTimeout(() => setSyncToast(null), 5000)
    } finally {
      setSyncing(false)
    }
  }

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    try {
      setError(null)
      if (agents.length === 0) setLoading(true)

      const url = showHidden ? '/api/agents?show_hidden=true' : '/api/agents'
      const response = await fetch(url)
      if (response.status === 401) {
        window.location.assign('/login?next=%2Fagents')
        return
      }
      if (response.status === 403) {
        throw new Error('Access denied')
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch agents')
      }

      const data = await response.json()
      setAgents(data.agents || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [agents.length, setAgents, showHidden])

  // Smart polling with visibility pause
  useSmartPoll(fetchAgents, 30000, { enabled: autoRefresh, pauseWhenSseConnected: true })

  // Update agent status
  const updateAgentStatus = async (agentName: string, status: Agent['status'], activity?: string) => {
    try {
      const response = await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          status,
          last_activity: activity || `Status changed to ${status}`
        })
      })

      if (!response.ok) throw new Error('Failed to update agent status')
      
      // Update store state
      setAgents(agents.map(agent =>
        agent.name === agentName
          ? {
              ...agent,
              status,
              last_activity: activity || `Status changed to ${status}`,
              last_seen: Math.floor(Date.now() / 1000),
              updated_at: Math.floor(Date.now() / 1000)
            }
          : agent
      ))
    } catch (error) {
      log.error('Failed to update agent status:', error)
      setError('Failed to update agent status')
    }
  }

  // Wake agent via session_send
  const wakeAgent = async (agentName: string, sessionKey: string) => {
    try {
      const response = await fetch(`/api/agents/${agentName}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `🤖 **Wake Up Call**\n\nAgent ${agentName}, you have been manually woken up.\nCheck Mission Control for any pending tasks or notifications.\n\n⏰ ${new Date().toLocaleString()}`
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to wake agent')
      }

      await updateAgentStatus(agentName, 'idle', 'Manually woken via session')
    } catch (error) {
      log.error('Failed to wake agent:', error)
      setError('Failed to wake agent')
    }
  }

  // Re-fetch when showHidden changes
  useEffect(() => {
    fetchAgents()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden])

  const toggleAgentHidden = async (agentId: number, hide: boolean) => {
    try {
      const response = await fetch(`/api/agents/${agentId}/hide`, {
        method: hide ? 'POST' : 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to update visibility')
      fetchAgents()
    } catch (error) {
      log.error('Failed to toggle agent visibility:', error)
      setError('Failed to update agent visibility')
    }
  }

  const deleteAgent = async (agentId: number, removeWorkspace: boolean) => {
    const previousAgents = agents
    setAgents(agents.filter((agent) => agent.id !== agentId))

    const response = await fetch(`/api/agents/${agentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove_workspace: removeWorkspace }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setAgents(previousAgents)
      throw new Error(payload?.error || 'Failed to delete agent')
    }

    setSyncToast(
      removeWorkspace
        ? `Deleted agent and workspace: ${payload?.deleted || agentId}`
        : `Deleted agent: ${payload?.deleted || agentId}`,
    )
    await fetchAgents()
    setTimeout(() => setSyncToast(null), 5000)
  }

  // Format last seen time
  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return 'Never'
    
    const now = Date.now()
    const diffMs = now - (timestamp * 1000)
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  // Check if agent had recent heartbeat (within 30 minutes)
  const hasRecentHeartbeat = (agent: Agent) => {
    if (!agent.last_seen) return false
    const thirtyMinutesAgo = Math.floor(Date.now() / 1000) - (30 * 60)
    return agent.last_seen > thirtyMinutesAgo
  }

  // Batch selection helpers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === agents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(agents.map(a => a.id)))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  // Batch confirm dialog state
  const [batchConfirm, setBatchConfirm] = useState<{ action: 'wake' | 'sleep' | 'hide'; count: number } | null>(null)

  // Batch operations with confirmation
  const confirmBatchAction = (action: 'wake' | 'sleep' | 'hide') => {
    setBatchConfirm({ action, count: selectedIds.size })
  }

  // Unified batch runner — keeps failed agents selected for retry
  const runBatchOp = async (label: string, op: (agent: Agent) => Promise<void>) => {
    setBatchBusy(true)
    let ok = 0, fail = 0
    const failedIds: number[] = []
    const selected = agents.filter(a => selectedIds.has(a.id))
    for (const agent of selected) {
      try {
        await op(agent)
        ok++
      } catch {
        fail++
        failedIds.push(agent.id)
      }
    }
    setBatchBusy(false)
    if (fail > 0) {
      setSelectedIds(new Set(failedIds))
      setSyncToast(`${label} ${ok} agent${ok !== 1 ? 's' : ''}, ${fail} failed — retry?`)
      setTimeout(() => setSyncToast(null), 8000)
    } else {
      clearSelection()
      setSyncToast(`${label} ${ok} agent${ok !== 1 ? 's' : ''}`)
      setTimeout(() => setSyncToast(null), 5000)
    }
    fetchAgents()
  }

  const executeBatchAction = async () => {
    if (!batchConfirm) return
    const { action } = batchConfirm
    setBatchConfirm(null)

    if (action === 'wake') {
      await runBatchOp('Woke', async (a) => {
        if (a.session_key) await wakeAgent(a.name, a.session_key)
        else await updateAgentStatus(a.name, 'idle', 'Batch wake')
      })
    } else if (action === 'sleep') {
      await runBatchOp('Set to sleep', (a) => updateAgentStatus(a.name, 'offline', 'Batch sleep'))
    } else if (action === 'hide') {
      await runBatchOp('Toggled visibility for', (a) => toggleAgentHidden(a.id, !a.hidden))
    }
  }

  // Clean up stale selections when agents list changes
  useEffect(() => {
    const agentIds = new Set(agents.map(a => a.id))
    setSelectedIds(prev => {
      const cleaned = new Set([...prev].filter(id => agentIds.has(id)))
      return cleaned.size !== prev.size ? cleaned : prev
    })
  }, [agents])

  const hasSelection = selectedIds.size > 0
  const allSelected = agents.length > 0 && selectedIds.size === agents.length

  // Get status distribution for summary
  const statusCounts = agents.reduce((acc, agent) => {
    acc[agent.status] = (acc[agent.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loading && agents.length === 0) {
    return <Loader variant="panel" label="Loading agents" />
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-foreground">{t('title')}</h2>
          
          {/* Status Summary */}
          <div className="flex gap-2 text-sm">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${statusColors[status]}`}></div>
                <span className="text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>

          {/* Active Heartbeats Indicator */}
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
            <span className="text-sm text-muted-foreground">
              {t('activeHeartbeats', { count: agents.filter(hasRecentHeartbeat).length })}
            </span>
          </div>

          {/* Select all toggle (visible when agents exist) */}
          {agents.length > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none ml-2" title="Select all agents">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = hasSelection && !allSelected }}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded border-border bg-surface-1 text-primary accent-primary cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">Select</span>
            </label>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'success' : 'secondary'}
            size="sm"
          >
            {autoRefresh ? t('live') : t('manual')}
          </Button>
          <Button
            onClick={() => syncFromConfig()}
            disabled={syncing}
            size="sm"
            className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30"
          >
            {syncing ? t('syncing') : t('syncConfig')}
          </Button>
          <Button
            onClick={() => syncFromConfig('local')}
            disabled={syncing}
            size="sm"
            className="bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30"
          >
            {t('syncLocal')}
          </Button>
          <Button
            onClick={() => setShowHidden(!showHidden)}
            variant={showHidden ? 'success' : 'secondary'}
            size="sm"
          >
            {showHidden ? 'Showing hidden' : 'Show hidden'}
          </Button>
          <Button
            onClick={() => setShowCreateModal(true)}
            size="sm"
          >
            {t('addAgent')}
          </Button>
          <Button
            onClick={fetchAgents}
            variant="secondary"
            size="sm"
          >
            {t('refresh')}
          </Button>
        </div>
      </div>

      {/* Sync Toast */}
      {syncToast && (
        <div className={`p-3 m-4 rounded-lg text-sm ${syncToast.includes('failed') ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {syncToast}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 m-4 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button
            onClick={() => setError(null)}
            variant="ghost"
            size="icon-sm"
            className="text-red-400/60 hover:text-red-400 ml-2"
          >
            ×
          </Button>
        </div>
      )}

      {/* Batch Toolbar — desktop: sticky top, mobile: fixed bottom bar, animated */}
      <div
        className={`z-20 flex items-center gap-1.5 sm:gap-2 rounded-lg border border-primary/30 bg-primary/5 backdrop-blur-sm px-2.5 sm:px-4 py-2 sm:py-2.5 shadow-lg shadow-black/10 transition-all duration-200 ease-out
          fixed bottom-4 left-4 right-4
          sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:sticky sm:top-0 sm:mx-4 sm:mt-2
          ${hasSelection ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none translate-y-4 sm:-translate-y-2'}`}
        role="toolbar"
        aria-label="Batch agent operations"
        aria-hidden={!hasSelection}
      >
          {/* Screen reader live region */}
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {selectedIds.size} agent{selectedIds.size !== 1 ? 's' : ''} selected
          </div>

          {/* Select all checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = hasSelection && !allSelected }}
              onChange={toggleSelectAll}
              aria-label="Select all agents"
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-border bg-surface-1 text-primary accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground">All</span>
          </label>

          <div className="h-3.5 sm:h-4 w-px bg-border/50 shrink-0" />

          {/* Selected count */}
          <span className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">
            {selectedIds.size} <span className="hidden xs:inline">selected</span>
          </span>

          <div className="flex-1 min-w-0" />

          {/* Batch action buttons */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={() => confirmBatchAction('wake')}
              disabled={batchBusy}
              aria-label={`Wake ${selectedIds.size} selected agents`}
              className="inline-flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 3v5l3 3" /><circle cx="8" cy="8" r="6" />
              </svg>
              Wake
            </button>
            <button
              onClick={() => confirmBatchAction('sleep')}
              disabled={batchBusy}
              aria-label={`Set ${selectedIds.size} selected agents to sleep`}
              className="inline-flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors bg-slate-500/15 text-slate-300 border border-slate-500/30 hover:bg-slate-500/25 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M13 3.5A6.5 6.5 0 0 1 3.5 13 6 6 0 0 0 13 3.5z" />
              </svg>
              Sleep
            </button>
            <button
              onClick={() => confirmBatchAction('hide')}
              disabled={batchBusy}
              aria-label={`Toggle visibility for ${selectedIds.size} selected agents`}
              className="inline-flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" /><circle cx="8" cy="8" r="2" />
                <path d="M3 13L13 3" strokeWidth="1.5" />
              </svg>
              Hide
            </button>

            <div className="h-3.5 sm:h-4 w-px bg-border/50" />

            <button
              onClick={clearSelection}
              aria-label="Clear selection"
              className="inline-flex items-center rounded-md p-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

      {/* Batch Confirm Dialog */}
      {batchConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setBatchConfirm(null)}>
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Confirm batch {batchConfirm.action}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {batchConfirm.action === 'wake' && `Wake ${batchConfirm.count} agent${batchConfirm.count !== 1 ? 's' : ''}?`}
              {batchConfirm.action === 'sleep' && `Set ${batchConfirm.count} agent${batchConfirm.count !== 1 ? 's' : ''} to sleep?`}
              {batchConfirm.action === 'hide' && `Toggle visibility for ${batchConfirm.count} agent${batchConfirm.count !== 1 ? 's' : ''}?`}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setBatchConfirm(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={executeBatchAction} className={batchConfirm.action === 'wake' ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : batchConfirm.action === 'sleep' ? 'bg-slate-600 hover:bg-slate-700 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white'}>
                {batchConfirm.action === 'wake' ? 'Wake' : batchConfirm.action === 'sleep' ? 'Sleep' : 'Hide'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Grid — extra bottom padding on mobile for fixed toolbar */}
      <div className={`flex-1 p-4 overflow-y-auto ${hasSelection ? 'pb-20 sm:pb-4' : ''}`}>
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="8" cy="5" r="3" />
                <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              </svg>
            </div>
            <p className="text-sm font-medium">{t('noAgents')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs text-center">
              {t('noAgentsHint')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => {
              const modelName = formatModelName(agent.config)
              const taskStatsLine = buildTaskStatParts(agent.taskStats)

              const isSelected = selectedIds.has(agent.id)

              return (
                <div
                  key={agent.id}
                  className={`group relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg cursor-pointer ${
                    isSelected
                      ? 'border-primary/50 bg-primary/[0.03] ring-1 ring-primary/20'
                      : 'border-border/70 hover:border-border'
                  }`}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <div className={`pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${(statusCardStyles[agent.status] || defaultCardStyle).edge}`} />
                  {agent.hidden ? <div className="absolute top-2 right-2 text-2xs text-slate-500">hidden</div> : null}

                  {/* Header: checkbox + avatar + name + status */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Batch checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleSelect(agent.id)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${agent.name}`}
                        className="w-4 h-4 rounded border-border bg-surface-1 text-primary accent-primary cursor-pointer shrink-0 mt-0.5"
                      />
                      <AgentAvatar name={agent.name} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-semibold text-foreground truncate">{getDisplayName(agent.name)}</h3>
                          {(agent as any).source && (agent as any).source !== 'manual' && (
                            <span className={`text-2xs px-1.5 py-0.5 rounded-full border ${
                              (agent as any).source === 'local'
                                ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                                : (agent as any).source === 'gateway'
                                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                  : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                            }`}>
                              {(agent as any).source}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {getAgentDesc(agent.name) || agent.role}{modelName && <> · <span className="font-mono text-muted-foreground/80">{modelName}</span></>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {hasRecentHeartbeat(agent) && (
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" title="Recent heartbeat" />
                      )}
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs capitalize ${statusBadgeStyles[agent.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${(statusCardStyles[agent.status] || defaultCardStyle).dot}`} />
                        {agent.status}
                      </span>
                    </div>
                  </div>

                  {/* Task stats — inline */}
                  {taskStatsLine && (
                    <div className="text-xs text-muted-foreground mb-2 pl-0.5">
                      {taskStatsLine.map((part, i) => (
                        <span key={part.label}>
                          {i > 0 && <span className="mx-1 text-muted-foreground/40">·</span>}
                          <span className={part.color || 'text-foreground/80'}>{part.count}</span>
                          {' '}{part.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer: last seen + actions */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                    <span className="text-[11px] text-muted-foreground/70">
                      {formatLastSeen(agent.last_seen)}
                    </span>
                    <div className="flex gap-1">
                      {agent.session_key ? (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            wakeAgent(agent.name, agent.session_key!)
                          }}
                          size="xs"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-cyan-300 hover:bg-cyan-500/15 hover:text-cyan-200"
                          title="Wake agent via session"
                        >
                          {t('wake')}
                        </Button>
                      ) : (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            updateAgentStatus(agent.name, 'idle', 'Manually activated')
                          }}
                          disabled={agent.status === 'idle'}
                          size="xs"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                        >
                          {t('wake')}
                        </Button>
                      )}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedAgent(agent)
                          setShowQuickSpawnModal(true)
                        }}
                        size="xs"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-blue-300 hover:bg-blue-500/15 hover:text-blue-200"
                      >
                        {t('spawn')}
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleAgentHidden(agent.id, !agent.hidden)
                        }}
                        size="xs"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-slate-400 hover:bg-slate-500/15 hover:text-slate-300"
                      >
                        {agent.hidden ? 'Unhide' : 'Hide'}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <AgentDetailModalPhase3
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onUpdate={fetchAgents}
          onStatusUpdate={updateAgentStatus}
          onWakeAgent={wakeAgent}
          onDelete={deleteAgent}
        />
      )}

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchAgents}
        />
      )}

      {/* Quick Spawn Modal */}
      {showQuickSpawnModal && selectedAgent && (
        <QuickSpawnModal
          agent={selectedAgent}
          onClose={() => {
            setShowQuickSpawnModal(false)
            setSelectedAgent(null)
          }}
          onSpawned={fetchAgents}
        />
      )}
    </div>
  )
}

// Enhanced Agent Detail Modal with Tabs
function AgentDetailModalPhase3({
  agent,
  onClose,
  onUpdate,
  onStatusUpdate,
  onWakeAgent,
  onDelete
}: {
  agent: Agent
  onClose: () => void
  onUpdate: () => void
  onStatusUpdate: (name: string, status: Agent['status'], activity?: string) => Promise<void>
  onWakeAgent: (name: string, sessionKey: string) => Promise<void>
  onDelete: (agentId: number, removeWorkspace: boolean) => Promise<void>
}) {
  const getDisplayName = useAgentDisplayName()
  const getAgentDesc = useAgentDescription()
  const [agentState, setAgentState] = useState<Agent & { config?: any; working_memory?: string }>(agent as Agent & { config?: any; working_memory?: string })
  const [activeTab, setActiveTab] = useState<'overview' | 'soul' | 'memory' | 'config' | 'tasks' | 'activity' | 'files' | 'tools' | 'channels' | 'cron' | 'models'>('overview')
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    role: agent.role,
    session_key: agent.session_key || '',
    soul_content: agent.soul_content || '',
    working_memory: agent.working_memory || '',
    model: (() => { const p = (agent as any).config?.model?.primary; return (typeof p === 'string' ? p : p?.primary) || '' })(),
  })
  const [workspaceFiles, setWorkspaceFiles] = useState<{ identityMd: string; agentMd: string }>({
    identityMd: '',
    agentMd: '',
  })
  const [soulTemplates, setSoulTemplates] = useState<SoulTemplate[]>([])
  const [heartbeatData, setHeartbeatData] = useState<HeartbeatResponse | null>(null)
  const [loadingHeartbeat, setLoadingHeartbeat] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const deleteMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deleteBusy) return
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(e.target as Node)) {
        setShowDeleteMenu(false)
      }
    }
    if (showDeleteMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDeleteMenu, deleteBusy])

  useEffect(() => {
    setAgentState(agent as Agent & { config?: any; working_memory?: string })
    setFormData({
      role: agent.role,
      session_key: agent.session_key || '',
      soul_content: agent.soul_content || '',
      working_memory: (agent as any).working_memory || '',
      model: (() => { const p = (agent as any).config?.model?.primary; return (typeof p === 'string' ? p : p?.primary) || '' })(),
    })
  }, [agent])

  useEffect(() => {
    const loadCanonicalAgentData = async () => {
      try {
        const [agentRes, soulRes, memoryRes, filesRes] = await Promise.all([
          fetch(`/api/agents/${agent.id}`),
          fetch(`/api/agents/${agent.id}/soul`),
          fetch(`/api/agents/${agent.id}/memory`),
          fetch(`/api/agents/${agent.id}/files`),
        ])

        if (agentRes.ok) {
          const payload = await agentRes.json()
          if (payload?.agent) {
            const freshAgent = payload.agent as Agent & { config?: any; working_memory?: string }
            setAgentState((prev) => ({ ...prev, ...freshAgent }))
            setFormData((prev) => ({
              ...prev,
              role: freshAgent.role || prev.role,
              session_key: freshAgent.session_key || '',
              model: (freshAgent as any).config?.model?.primary || prev.model,
            }))
          }
        }

        if (soulRes.ok) {
          const payload = await soulRes.json()
          setFormData((prev) => ({ ...prev, soul_content: String(payload?.soul_content || '') }))
        }

        if (memoryRes.ok) {
          const payload = await memoryRes.json()
          setFormData((prev) => ({ ...prev, working_memory: String(payload?.working_memory || '') }))
        }

        if (filesRes.ok) {
          const payload = await filesRes.json()
          setWorkspaceFiles({
            identityMd: String(payload?.files?.['identity.md']?.content || ''),
            agentMd: String(payload?.files?.['agent.md']?.content || ''),
          })
        }
      } catch (error) {
        log.error('Failed to load canonical agent data:', error)
      }
    }

    loadCanonicalAgentData()
  }, [agent.id])

  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return 'Never'
    const diffMs = Date.now() - (timestamp * 1000)
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  // Load SOUL templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await fetch(`/api/agents/${agent.name}/soul`, {
          method: 'PATCH'
        })
        if (response.ok) {
          const data = await response.json()
          setSoulTemplates(data.templates || [])
        }
      } catch (error) {
        log.error('Failed to load SOUL templates:', error)
      }
    }
    
    if (activeTab === 'soul') {
      loadTemplates()
    }
  }, [activeTab, agent.name])

  // Perform heartbeat check
  const performHeartbeat = async () => {
    setLoadingHeartbeat(true)
    try {
      const response = await fetch(`/api/agents/${agent.name}/heartbeat`)
      if (response.ok) {
        const data = await response.json()
        setHeartbeatData(data)
      }
    } catch (error) {
      log.error('Failed to perform heartbeat:', error)
    } finally {
      setLoadingHeartbeat(false)
    }
  }

  const handleSave = async () => {
    setSaveBusy(true)
    try {
      const response = await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentState.name,
          ...formData
        })
      })

      if (!response.ok) throw new Error('Failed to update agent')

      setEditing(false)
      onUpdate()
    } catch (error) {
      log.error('Failed to update agent:', error)
    } finally {
      setSaveBusy(false)
    }
  }

  const handleSoulSave = async (content: string, templateName?: string) => {
    try {
      const response = await fetch(`/api/agents/${agentState.id}/soul`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soul_content: content,
          template_name: templateName
        })
      })

      if (!response.ok) throw new Error('Failed to update SOUL')
      
      setFormData(prev => ({ ...prev, soul_content: content }))
      setAgentState(prev => ({ ...prev, soul_content: content }))
      onUpdate()
    } catch (error) {
      log.error('Failed to update SOUL:', error)
    }
  }

  const handleMemorySave = async (content: string, append: boolean = false) => {
    try {
      const response = await fetch(`/api/agents/${agentState.id}/memory`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          working_memory: content,
          append
        })
      })

      if (!response.ok) throw new Error('Failed to update memory')
      
      const data = await response.json()
      setFormData(prev => ({ ...prev, working_memory: data.working_memory }))
      setAgentState(prev => ({ ...prev, working_memory: data.working_memory }))
      onUpdate()
    } catch (error) {
      log.error('Failed to update memory:', error)
    }
  }

  const handleWorkspaceFileSave = async (file: 'identity.md' | 'agent.md', content: string) => {
    const response = await fetch(`/api/agents/${agentState.id}/files`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, content }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || `Failed to save ${file}`)
    }
    setWorkspaceFiles((prev) => ({
      ...prev,
      ...(file === 'identity.md' ? { identityMd: content } : { agentMd: content }),
    }))
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'O' },
    { id: 'files', label: 'Files', icon: 'F' },
    { id: 'tools', label: 'Tools', icon: 'W' },
    { id: 'models', label: 'Models', icon: 'P' },
    { id: 'channels', label: 'Channels', icon: 'H' },
    { id: 'cron', label: 'Cron', icon: 'R' },
    { id: 'soul', label: 'SOUL', icon: 'S' },
    { id: 'memory', label: 'Memory', icon: 'M' },
    { id: 'tasks', label: 'Tasks', icon: 'T' },
    { id: 'config', label: 'Config', icon: 'C' },
    { id: 'activity', label: 'Activity', icon: 'A' }
  ]

  const handleDelete = async (removeWorkspace: boolean) => {
    const scope = removeWorkspace ? 'agent and workspace' : 'agent'
    const confirmed = window.confirm(`Delete ${scope} for "${agentState.name}"? This cannot be undone.`)
    if (!confirmed) return

    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await onDelete(agentState.id, removeWorkspace)
      onClose()
    } catch (error: any) {
      setDeleteError(error?.message || `Failed to delete ${scope}`)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/80 rounded-lg shadow-2xl shadow-black/40 max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 pt-5 pb-0 border-b border-border">
          <div className="flex justify-between items-center gap-4 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <AgentAvatar name={agent.name} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground leading-tight truncate">{getDisplayName(agentState.name)}</h3>
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${statusBadgeStyles[agentState.status]}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusColors[agentState.status]}`} />
                    {agentState.status}
                  </span>
                  {agentState.session_key && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                      Session
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-muted-foreground">{agentState.role}</span>
                  <span className="text-xs text-muted-foreground/60">·</span>
                  <span className="text-xs text-muted-foreground/60">seen {formatLastSeen(agentState.last_seen)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative" ref={deleteMenuRef}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-rose-400"
                  title="Delete agent"
                  onClick={() => setShowDeleteMenu(prev => !prev)}
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 0 1 1.34-1.34h2.66a1.33 1.33 0 0 1 1.34 1.34V4M12.67 4v9.33a1.33 1.33 0 0 1-1.34 1.34H4.67a1.33 1.33 0 0 1-1.34-1.34V4" />
                  </svg>
                </Button>
                {showDeleteMenu && (
                  <div className="absolute right-0 top-full mt-1 flex flex-col gap-1 bg-card border border-border rounded-md shadow-xl p-1.5 z-10 min-w-[180px]">
                    <button
                      onClick={() => handleDelete(false)}
                      disabled={deleteBusy}
                      className="text-left text-xs px-2.5 py-1.5 rounded text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                    >
                      {deleteBusy ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
                          </svg>
                          Deleting...
                        </span>
                      ) : 'Delete agent'}
                    </button>
                    <button
                      onClick={() => handleDelete(true)}
                      disabled={deleteBusy}
                      className="text-left text-xs px-2.5 py-1.5 rounded text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                    >
                      {deleteBusy ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
                          </svg>
                          Deleting...
                        </span>
                      ) : 'Delete agent + workspace'}
                    </button>
                  </div>
                )}
              </div>
              <Button
                onClick={onClose}
                aria-label="Close agent details"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </Button>
            </div>
          </div>

          {deleteError && (
            <div className="mb-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {deleteError}
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-0 overflow-x-auto -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewTab
              agent={agentState}
              editing={editing}
              formData={formData}
              setFormData={setFormData}
              onSave={handleSave}
              saveBusy={saveBusy}
              onStatusUpdate={onStatusUpdate}
              onWakeAgent={onWakeAgent}
              onEdit={() => setEditing(true)}
              onCancel={() => setEditing(false)}
              heartbeatData={heartbeatData}
              loadingHeartbeat={loadingHeartbeat}
              onPerformHeartbeat={performHeartbeat}
            />
          )}
          
          {activeTab === 'soul' && (
            <SoulTab
              agent={agentState}
              soulContent={formData.soul_content}
              templates={soulTemplates}
              onSave={handleSoulSave}
            />
          )}
          
          {activeTab === 'memory' && (
            <MemoryTab
              agent={agentState}
              workingMemory={formData.working_memory}
              onSave={handleMemorySave}
            />
          )}
          
          {activeTab === 'tasks' && (
            <TasksTab agent={agentState} />
          )}
          
          {activeTab === 'config' && (
            <ConfigTab
              agent={agentState}
              workspaceFiles={workspaceFiles}
              onSaveWorkspaceFile={handleWorkspaceFileSave}
              onSave={onUpdate}
            />
          )}

          {activeTab === 'files' && (
            <FilesTab agent={agentState} />
          )}

          {activeTab === 'tools' && (
            <ToolsTab agent={agentState} />
          )}

          {activeTab === 'channels' && (
            <ChannelsTab agent={agentState} />
          )}

          {activeTab === 'cron' && (
            <CronTab agent={agentState} />
          )}

          {activeTab === 'models' && (
            <ModelsTab agent={agentState} />
          )}

          {activeTab === 'activity' && (
            <ActivityTab agent={agentState} />
          )}
        </div>
      </div>
    </div>
  )
}

// Quick Spawn Modal Component — creates a task assigned to the agent
// The lobster's task-executor.js picks it up and dispatches via the agent's runtime
function QuickSpawnModal({
  agent,
  onClose,
  onSpawned
}: {
  agent: Agent
  onClose: () => void
  onSpawned: () => void
}) {
  const getDisplayName = useAgentDisplayName()
  const [taskDescription, setTaskDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [isSpawning, setIsSpawning] = useState(false)
  const [spawnResult, setSpawnResult] = useState<any>(null)

  const handleSpawn = async () => {
    if (!taskDescription.trim()) {
      alert('Please enter a task description')
      return
    }

    setIsSpawning(true)
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskDescription.length > 80 ? taskDescription.slice(0, 80) + '...' : taskDescription,
          description: taskDescription,
          assigned_to: agent.name,
          priority,
          status: 'assigned',
        })
      })

      const result = await response.json()
      if (response.ok) {
        setSpawnResult(result)
        onSpawned()

        setTimeout(() => {
          onClose()
        }, 2000)
      } else {
        alert(result.error || 'Failed to create task')
      }
    } catch (error) {
      alert('Network error occurred')
    } finally {
      setIsSpawning(false)
    }
  }

  const runtimeLabel = (agent as any).runtime || 'claude-mcp'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">
            Assign Task to {getDisplayName(agent.name)}
          </h3>
          <Button onClick={onClose} variant="ghost" size="icon-sm" className="text-2xl">×</Button>
        </div>

        {spawnResult ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-lg text-sm">
              Task created! The lobster will pick it up shortly.
            </div>
            <div className="text-sm text-foreground/80">
              <p><strong>Task ID:</strong> #{spawnResult.task?.id || spawnResult.id}</p>
              <p><strong>Assigned to:</strong> {getDisplayName(agent.name)}</p>
              <p><strong>Runtime:</strong> {runtimeLabel}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Runtime badge */}
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-blue-900/50 text-blue-300">{runtimeLabel}</span>
              <span className="text-muted-foreground">Executed on lobster via task-executor</span>
            </div>

            {/* Task Description */}
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-2">
                Task Description *
              </label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder={`What should ${getDisplayName(agent.name)} do?`}
                className="w-full h-24 px-3 py-2 bg-surface-1 border border-border rounded text-foreground placeholder-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/50 resize-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-2">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-surface-1 border border-border rounded text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleSpawn}
                disabled={isSpawning || !taskDescription.trim()}
                className="flex-1"
              >
                {isSpawning ? 'Creating...' : 'Assign Task'}
              </Button>
              <Button
                onClick={onClose}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AgentSquadPanelPhase3
