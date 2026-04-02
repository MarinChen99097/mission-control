import { EventEmitter } from 'events'

/**
 * Server-side event bus for broadcasting database mutations to SSE clients.
 * Singleton per Next.js server process.
 *
 * Multi-tenant extension:
 *   - workspace-scoped broadcasts (events only reach same workspace)
 *   - inter-agent peer discovery (agents can query who else is online)
 *   - event history per workspace for reconnecting agents
 */

export interface ServerEvent {
  type: string
  data: any
  timestamp: number
  workspace_id?: number
  actor?: string
}

// Event types emitted by the bus
export type EventType =
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'chat.message'
  | 'chat.message.deleted'
  | 'notification.created'
  | 'notification.read'
  | 'activity.created'
  | 'agent.updated'
  | 'agent.created'
  | 'agent.deleted'
  | 'agent.synced'
  | 'agent.status_changed'
  | 'agent.broadcast'
  | 'audit.security'
  | 'security.event'
  | 'connection.created'
  | 'connection.disconnected'
  | 'github.synced'
  | 'run.created'
  | 'run.updated'
  | 'run.completed'
  | 'run.eval_attached'
  | 'peer.joined'
  | 'peer.left'

interface PeerAgent {
  name: string
  workspaceId: number
  joinedAt: number
  lastPingAt: number
}

class ServerEventBus extends EventEmitter {
  private static instance: ServerEventBus | null = null
  private peers = new Map<string, PeerAgent>()
  private eventHistory = new Map<number, ServerEvent[]>()
  private maxHistoryPerWorkspace = 100
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  private constructor() {
    super()
    this.setMaxListeners(200)
    this.cleanupTimer = setInterval(() => this.cleanupStalePeers(), 60_000)
  }

  static getInstance(): ServerEventBus {
    if (!ServerEventBus.instance) {
      ServerEventBus.instance = new ServerEventBus()
    }
    return ServerEventBus.instance
  }

  /**
   * Broadcast an event to all SSE listeners.
   * If workspace_id is set, only listeners for that workspace receive it.
   */
  broadcast(type: EventType, data: any, workspaceId?: number, actor?: string): ServerEvent {
    // Auto-extract workspace_id from data if not explicitly provided
    // This ensures ALL existing callers get tenant scoping without code changes
    const wsId = workspaceId ?? data?.workspace_id
    const event: ServerEvent = { type, data, timestamp: Date.now(), workspace_id: wsId, actor }

    // Store in workspace history
    if (workspaceId) {
      const history = this.eventHistory.get(workspaceId) || []
      history.push(event)
      if (history.length > this.maxHistoryPerWorkspace) {
        history.splice(0, history.length - this.maxHistoryPerWorkspace)
      }
      this.eventHistory.set(workspaceId, history)
    }

    // Emit to global listeners (backward compatible)
    this.emit('server-event', event)

    // Emit to workspace-scoped listeners
    if (workspaceId) {
      this.emit(`ws:${workspaceId}`, event)
    }

    return event
  }

  /**
   * Register an agent as a peer in a workspace (inter-agent awareness).
   */
  registerPeer(agentName: string, workspaceId: number): () => void {
    const key = `${workspaceId}:${agentName}`
    this.peers.set(key, {
      name: agentName,
      workspaceId,
      joinedAt: Date.now(),
      lastPingAt: Date.now(),
    })

    this.broadcast('peer.joined', { agent: agentName }, workspaceId, agentName)

    // Return cleanup function
    return () => {
      this.peers.delete(key)
      this.broadcast('peer.left', { agent: agentName }, workspaceId, agentName)
    }
  }

  /**
   * Keep a peer's presence alive.
   */
  pingPeer(agentName: string, workspaceId: number): void {
    const key = `${workspaceId}:${agentName}`
    const peer = this.peers.get(key)
    if (peer) {
      peer.lastPingAt = Date.now()
    }
  }

  /**
   * Get all online peers in a workspace.
   */
  getPeers(workspaceId: number): PeerAgent[] {
    const result: PeerAgent[] = []
    for (const peer of this.peers.values()) {
      if (peer.workspaceId === workspaceId) {
        result.push(peer)
      }
    }
    return result
  }

  /**
   * Get recent events for a workspace (for reconnecting agents).
   */
  getRecentEvents(workspaceId: number, since?: number): ServerEvent[] {
    const history = this.eventHistory.get(workspaceId) || []
    if (since) {
      return history.filter(e => e.timestamp > since)
    }
    return history.slice(-20)
  }

  /**
   * Subscribe to workspace-scoped events only.
   */
  onWorkspace(workspaceId: number, listener: (event: ServerEvent) => void): () => void {
    const channel = `ws:${workspaceId}`
    this.on(channel, listener)
    return () => this.off(channel, listener)
  }

  /**
   * Get bus statistics for monitoring.
   */
  getStats(): { peers: number; workspaces: number; totalEvents: number } {
    const workspaces = new Set<number>()
    for (const peer of this.peers.values()) {
      workspaces.add(peer.workspaceId)
    }
    let totalEvents = 0
    for (const events of this.eventHistory.values()) {
      totalEvents += events.length
    }
    return { peers: this.peers.size, workspaces: workspaces.size, totalEvents }
  }

  private cleanupStalePeers(): void {
    const staleThreshold = Date.now() - 5 * 60 * 1000
    for (const [key, peer] of this.peers) {
      if (peer.lastPingAt < staleThreshold) {
        this.peers.delete(key)
        this.broadcast('peer.left', { agent: peer.name, reason: 'timeout' }, peer.workspaceId, 'system')
      }
    }
    // Clean old history (> 1 hour)
    const oldThreshold = Date.now() - 60 * 60 * 1000
    for (const [wsId, events] of this.eventHistory) {
      const filtered = events.filter(e => e.timestamp > oldThreshold)
      if (filtered.length === 0) {
        this.eventHistory.delete(wsId)
      } else {
        this.eventHistory.set(wsId, filtered)
      }
    }
  }
}

// Use globalThis to survive HMR in development
const globalBus = globalThis as typeof globalThis & { __eventBus?: ServerEventBus }
export const eventBus = globalBus.__eventBus ?? ServerEventBus.getInstance()
globalBus.__eventBus = eventBus as ServerEventBus
