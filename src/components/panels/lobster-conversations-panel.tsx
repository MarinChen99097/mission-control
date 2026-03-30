'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface ConvoMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: { name: string; id?: string }[]
  model?: string
  usage?: { input: number; output: number; totalTokens: number; cost?: { total: number } }
  timestamp: string
}

interface Conversation {
  id: string
  channel: 'telegram' | 'discord'
  origin: string
  sessionId: string
  model: string
  messageCount: number
  lastMessage?: { role: string; text: string; timestamp: string }
  updatedAt: number
  active: boolean
}

interface ConvoDetail {
  id: string
  channel: string
  origin: string
  model: string
  messages: ConvoMessage[]
  totalMessages: number
}

export function LobsterConversationsPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConvoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/lobster/conversations')
      const data = await res.json()
      setConversations(data.conversations || [])
      if (data.error) setError(data.error)
      else setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/lobster/conversation/${id}`)
      const data = await res.json()
      if (data.error) setError(data.error)
      else setDetail(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
    else setDetail(null)
  }, [selectedId, fetchDetail])

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations()
      if (selectedId) fetchDetail(selectedId)
    }, 15_000)
    return () => clearInterval(interval)
  }, [fetchConversations, fetchDetail, selectedId])

  return (
    <div className="flex h-[calc(100vh-8.75rem)] min-h-[560px] m-4 rounded-lg border border-border bg-card overflow-hidden">
      {/* Sidebar — conversation list */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Lobster Conversations</h3>
          <Button variant="ghost" size="sm" onClick={fetchConversations} disabled={loading}>
            {loading ? '...' : 'Refresh'}
          </Button>
        </div>

        {error && (
          <div className="p-2 text-xs text-yellow-300 bg-yellow-500/10 border-b border-yellow-500/20">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left p-3 border-b border-border hover:bg-muted/50 transition-colors ${
                selectedId === c.id ? 'bg-muted/80' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block w-2 h-2 rounded-full ${c.active ? 'bg-green-500' : 'bg-gray-500'}`} />
                <ChannelBadge channel={c.channel} />
                <span className="text-xs text-muted-foreground truncate">{c.origin}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {c.lastMessage?.text?.slice(0, 80) || 'No messages'}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">{c.messageCount} messages</span>
                <span className="text-[10px] text-muted-foreground">
                  {c.lastMessage?.timestamp ? new Date(c.lastMessage.timestamp).toLocaleString() : ''}
                </span>
              </div>
            </button>
          ))}

          {!loading && conversations.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No conversations on the lobster
            </div>
          )}
        </div>
      </div>

      {/* Main — conversation detail */}
      <div className="flex-1 flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a conversation to view messages
          </div>
        ) : detailLoading && !detail ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center gap-3">
              <ChannelBadge channel={detail.channel} />
              <span className="font-medium text-sm">{detail.origin}</span>
              <span className="text-xs text-muted-foreground">
                {detail.totalMessages} messages
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-purple-900/50 text-purple-300">
                {detail.model}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {detail.messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  const colors = channel === 'telegram'
    ? 'bg-blue-900/50 text-blue-300'
    : channel === 'discord'
    ? 'bg-indigo-900/50 text-indigo-300'
    : 'bg-gray-700 text-gray-300'

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${colors}`}>
      {channel}
    </span>
  )
}

function MessageBubble({ msg }: { msg: ConvoMessage }) {
  const isUser = msg.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
        isUser
          ? 'bg-primary/20 text-foreground'
          : 'bg-muted text-foreground'
      }`}>
        <div className="text-sm whitespace-pre-wrap break-words">{msg.text}</div>

        {/* Tool calls */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {msg.toolCalls.map((tc, j) => (
              <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-300 font-mono">
                {tc.name}
              </span>
            ))}
          </div>
        )}

        {/* Metadata footer */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">
            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
          </span>
          {msg.usage && (
            <span className="text-[10px] text-muted-foreground">
              {msg.usage.totalTokens?.toLocaleString()} tok
              {msg.usage.cost?.total ? ` · $${msg.usage.cost.total.toFixed(4)}` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
