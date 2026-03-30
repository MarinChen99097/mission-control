'use client'

import { useTranslations } from 'next-intl'
import { LogRow, type DashboardData } from '../widget-primitives'

export function EventStreamWidget({ data }: { data: DashboardData }) {
  const { isLocal, mergedRecentLogs, recentErrorLogs, isSessionsLoading } = data
  const t = useTranslations('dashboard')

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="text-sm font-semibold">{isLocal ? t('localEventStream') : t('incidentStream')}</h3>
        <span className="text-2xs text-muted-foreground font-mono-tight">
          {isLocal ? mergedRecentLogs.length : `${recentErrorLogs} ${t('errors')}`}
        </span>
      </div>
      <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
        {mergedRecentLogs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">
              {isSessionsLoading ? t('loadingLogs') : t('noLogsYet')}
            </p>
            <p className="text-2xs text-muted-foreground/60 mt-1">
              {isLocal ? t('localEvents') : t('gatewayIncidents')}
            </p>
          </div>
        ) : (
          mergedRecentLogs.map((log) => <LogRow key={log.id} log={log} />)
        )}
      </div>
    </div>
  )
}
