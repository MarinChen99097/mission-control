'use client'

import { useTranslations } from 'next-intl'
import { HealthRow, type DashboardData } from '../widget-primitives'

export function GatewayHealthWidget({ data }: { data: DashboardData }) {
  const { connection, sessions, errorCount, backlogCount, memPct, systemStats, gatewayHealthStatus } = data
  const t = useTranslations('dashboard')

  return (
    <div className="panel">
      <div className="panel-header"><h3 className="text-sm font-semibold">{t('gatewayHealth')}</h3></div>
      <div className="panel-body space-y-3">
        <HealthRow label="Gateway" value={connection.isConnected ? t('connected') : t('disconnected')} status={gatewayHealthStatus} />
        <HealthRow label={t('trafficSessions')} value={`${sessions.length}`} status={sessions.length > 0 ? 'good' : 'warn'} />
        <HealthRow label={t('errors24h')} value={`${errorCount}`} status={errorCount > 0 ? 'warn' : 'good'} />
        <HealthRow label={t('saturationQueue')} value={`${backlogCount}`} status={backlogCount > 16 ? 'bad' : backlogCount > 8 ? 'warn' : 'good'} />
        {memPct != null && <HealthRow label={t('memory')} value={`${memPct}%`} status={memPct > 90 ? 'bad' : memPct > 70 ? 'warn' : 'good'} bar={memPct} />}
        {systemStats?.disk && <HealthRow label={t('disk')} value={systemStats.disk.usage || 'N/A'} status={parseInt(systemStats.disk.usage) > 90 ? 'bad' : 'good'} />}
      </div>
    </div>
  )
}
