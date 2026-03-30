'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { DashboardData } from '../widget-primitives'

interface HealthSummary {
  online: number
  idle: number
  busy: number
  error: number
  total: number
}

const STATUS_COLORS = {
  online: { stroke: '#34D399', bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30' },
  idle: { stroke: '#F59E0B', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  busy: { stroke: '#3B82F6', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  error: { stroke: '#DC2626', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
} as const

type StatusKey = keyof typeof STATUS_COLORS

function DonutChart({
  segments,
  total,
  totalLabel,
  size = 140,
  strokeWidth = 18,
  onHover,
  onClick,
}: {
  segments: { key: StatusKey; value: number; color: string }[]
  total: number
  totalLabel?: string
  size?: number
  strokeWidth?: number
  onHover?: (key: StatusKey | null) => void
  onClick?: (key: StatusKey) => void
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" role="img" aria-label="No agents">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-secondary"
        />
        <text x={center} y={center} textAnchor="middle" dominantBaseline="central" className="fill-foreground text-2xl font-bold font-mono-tight">
          0
        </text>
      </svg>
    )
  }

  let offset = 0
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const pct = seg.value / total
      const dashLen = pct * circumference
      const gap = circumference - dashLen
      const arc = { ...seg, dashLen, gap, offset }
      offset += dashLen
      return arc
    })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" role="img" aria-label={`Agent health: ${total} total`}>
      {/* Background ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-secondary"
      />
      {/* Segment arcs */}
      {arcs.map((arc) => (
        <circle
          key={arc.key}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc.dashLen} ${arc.gap}`}
          strokeDashoffset={-arc.offset}
          strokeLinecap="butt"
          className="transition-all duration-500 cursor-pointer hover:opacity-80"
          role="button"
          tabIndex={0}
          aria-label={`${arc.key}: ${arc.value}`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          onMouseEnter={() => onHover?.(arc.key)}
          onMouseLeave={() => onHover?.(null)}
          onClick={() => onClick?.(arc.key)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(arc.key) } }}
        />
      ))}
      {/* Center total */}
      <text x={center} y={totalLabel ? center - 8 : center} textAnchor="middle" dominantBaseline="central" className="fill-foreground text-2xl font-bold font-mono-tight">
        {total}
      </text>
      {totalLabel && (
        <text x={center} y={center + 12} textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground text-[10px]">
          {totalLabel}
        </text>
      )}
    </svg>
  )
}

export function AgentHealthWidget({ data }: { data: DashboardData }) {
  const { navigateToPanel } = data
  const t = useTranslations('dashboard')
  const [health, setHealth] = useState<HealthSummary | null>(null)
  const [hoveredStatus, setHoveredStatus] = useState<StatusKey | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/health-summary')
      if (!res.ok) return
      const json = await res.json()
      setHealth(json)
    } catch {
      // silently fail — widget shows stale or empty state
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const segments: { key: StatusKey; value: number; color: string; label: string }[] = [
    { key: 'online', value: health?.online ?? 0, color: STATUS_COLORS.online.stroke, label: t('agentHealthOnline') },
    { key: 'idle', value: health?.idle ?? 0, color: STATUS_COLORS.idle.stroke, label: t('agentHealthIdle') },
    { key: 'busy', value: health?.busy ?? 0, color: STATUS_COLORS.busy.stroke, label: t('agentHealthBusy') },
    { key: 'error', value: health?.error ?? 0, color: STATUS_COLORS.error.stroke, label: t('agentHealthError') },
  ]

  const total = health?.total ?? 0

  const handleSegmentClick = (key: StatusKey) => {
    navigateToPanel(`agents?status=${key}`)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="text-sm font-semibold">{t('agentHealthTitle')}</h3>
      </div>
      <div className="panel-body flex flex-col sm:flex-row items-center gap-4">
        {/* Donut chart */}
        <div className="shrink-0">
          <DonutChart
            segments={segments}
            total={total}
            totalLabel={t('agentTotal')}
            onHover={setHoveredStatus}
            onClick={handleSegmentClick}
          />
        </div>

        {/* Legend */}
        <div className="flex-1 grid grid-cols-2 gap-2 w-full">
          {segments.map((seg) => {
            const colors = STATUS_COLORS[seg.key]
            const isHovered = hoveredStatus === seg.key
            return (
              <button
                key={seg.key}
                type="button"
                onClick={() => handleSegmentClick(seg.key)}
                onMouseEnter={() => setHoveredStatus(seg.key)}
                onMouseLeave={() => setHoveredStatus(null)}
                className={`rounded-lg border px-2.5 py-2 text-left transition-all duration-200 ${colors.bg} ${colors.border} ${colors.text} ${
                  isHovered ? 'ring-1 ring-current scale-[1.02]' : ''
                }`}
              >
                <div className="text-2xs uppercase tracking-wide opacity-70">{seg.label}</div>
                <div className="text-lg font-bold font-mono-tight">{seg.value}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
