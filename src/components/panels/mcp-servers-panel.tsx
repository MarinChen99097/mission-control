'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface McpServer {
  name: string
  scope: 'global' | 'project'
  project?: string
  source: string
  type?: string
  command?: string
  args?: string[]
  disabled?: boolean
  env?: Record<string, string>
}

interface McpResponse {
  servers: McpServer[]
  total: number
  timestamp?: string
  error?: string
}

export function McpServersPanel() {
  const [data, setData] = useState<McpResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchServers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mcp-servers')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as McpResponse
      setData(json)
      if (json.error) setError(json.error)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchServers() }, [fetchServers])

  const globalServers = data?.servers?.filter(s => s.scope === 'global') ?? []
  const projectServers = data?.servers?.filter(s => s.scope === 'project') ?? []
  const projects = [...new Set(projectServers.map(s => s.project))]

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">MCP Servers</h2>
          <p className="text-sm text-muted-foreground">
            Connected MCP servers on the lobster (local machine)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.timestamp && (
            <span className="text-xs text-muted-foreground">
              {new Date(data.timestamp).toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchServers} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
          {error}
        </div>
      )}

      {/* Global Scope */}
      {globalServers.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Global Scope (~/.claude.json)
          </h3>
          <div className="grid gap-3">
            {globalServers.map(s => <McpCard key={`global-${s.name}`} server={s} />)}
          </div>
        </section>
      )}

      {/* Project Scope */}
      {projects.map(proj => {
        const servers = projectServers.filter(s => s.project === proj)
        return (
          <section key={proj}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              Project: {proj}
            </h3>
            <div className="grid gap-3">
              {servers.map(s => <McpCard key={`${proj}-${s.name}`} server={s} />)}
            </div>
          </section>
        )
      })}

      {!loading && data && data.total === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No MCP servers found on the lobster.
        </div>
      )}
    </div>
  )
}

function McpCard({ server }: { server: McpServer }) {
  const isDisabled = server.disabled === true
  const envKeys = server.env ? Object.keys(server.env) : []

  return (
    <div className={`rounded-lg border p-4 ${isDisabled ? 'opacity-50 border-border' : 'border-border bg-card'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${isDisabled ? 'bg-gray-500' : 'bg-green-500'}`} />
          <span className="font-medium">{server.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {isDisabled && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">disabled</span>
          )}
          <span className="text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-300">
            {server.type || 'stdio'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-purple-900/50 text-purple-300">
            {server.scope}
          </span>
        </div>
      </div>

      {server.command && (
        <div className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1 mb-1 overflow-x-auto">
          {server.command} {server.args?.join(' ')}
        </div>
      )}

      {envKeys.length > 0 && (
        <div className="text-xs text-muted-foreground mt-1">
          ENV: {envKeys.map(k => (
            <span key={k} className="inline-block mr-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
