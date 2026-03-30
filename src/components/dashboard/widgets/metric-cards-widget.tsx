'use client'

import { useTranslations } from 'next-intl'
import {
  MetricCard,
  SessionIcon,
  GatewayIcon,
  AgentIcon,
  TaskIcon,
  ActivityIconMini,
  TokenIcon,
  CostIcon,
  formatTokensShort,
  type DashboardData,
} from '../widget-primitives'

export function MetricCardsWidget({ data }: { data: DashboardData }) {
  const t = useTranslations('dashboard')
  const {
    isLocal,
    isClaudeLoading,
    isSessionsLoading,
    isSystemLoading,
    claudeActive,
    codexActive,
    hermesActive,
    claudeStats,
    claudeLocalSessions,
    codexLocalSessions,
    hermesLocalSessions,
    hermesCronJobCount,
    systemLoad,
    memPct,
    diskPct,
    connection,
    activeSessions,
    sessions,
    onlineAgents,
    dbStats,
    agents,
    backlogCount,
    runningTasks,
    errorCount,
    subscriptionLabel,
    subscriptionPrice,
  } = data

  if (isLocal) {
    return (
      <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Claude"
          value={isClaudeLoading ? '...' : claudeActive}
          total={isClaudeLoading ? undefined : (claudeStats?.total_sessions ?? claudeLocalSessions.length)}
          subtitle="active sessions"
          icon={<SessionIcon />}
          color="blue"
        />
        <MetricCard
          label="Codex"
          value={isSessionsLoading ? '...' : codexActive}
          total={isSessionsLoading ? undefined : codexLocalSessions.length}
          subtitle="active sessions"
          icon={<SessionIcon />}
          color="green"
        />
        <MetricCard
          label="Hermes"
          value={isSessionsLoading ? '...' : hermesActive}
          total={isSessionsLoading ? undefined : hermesLocalSessions.length}
          subtitle={hermesCronJobCount > 0 ? `${hermesActive} active · ${hermesCronJobCount} cron` : 'active sessions'}
          icon={<SessionIcon />}
          color="purple"
        />
        <MetricCard
          label={t('systemLoad')}
          value={isSystemLoading ? '...' : `${systemLoad}%`}
          subtitle={`mem ${memPct ?? '-'} · disk ${Number.isFinite(diskPct) ? `${diskPct}%` : '-'}`}
          icon={<ActivityIconMini />}
          color={systemLoad > 85 ? 'red' : 'purple'}
        />
        <MetricCard
          label="Tokens"
          value={isClaudeLoading ? '...' : formatTokensShort((claudeStats?.total_input_tokens ?? 0) + (claudeStats?.total_output_tokens ?? 0))}
          subtitle={isClaudeLoading ? undefined : `${formatTokensShort(claudeStats?.total_input_tokens ?? 0)} in · ${formatTokensShort(claudeStats?.total_output_tokens ?? 0)} out`}
          icon={<TokenIcon />}
          color="purple"
        />
        <MetricCard
          label="Cost"
          value={isClaudeLoading ? '...' : (subscriptionLabel ? (subscriptionPrice ? `$${subscriptionPrice}/mo` : 'Included') : `$${(claudeStats?.total_estimated_cost ?? 0).toFixed(2)}`)}
          subtitle={subscriptionLabel ? `${subscriptionLabel} plan` : 'estimated'}
          icon={<CostIcon />}
          color={errorCount > 0 ? 'red' : 'green'}
        />
      </section>
    )
  }

  return (
    <section className="grid grid-cols-2 xl:grid-cols-5 gap-3">
      <MetricCard label="Gateway" value={connection.isConnected ? t('online') : t('offline')} subtitle={t('transportStatus')} icon={<GatewayIcon />} color={connection.isConnected ? 'green' : 'red'} />
      <MetricCard label={t('sessions')} value={activeSessions} total={sessions.length} subtitle={t('activeTotal')} icon={<SessionIcon />} color="blue" />
      <MetricCard label={t('agentCapacity')} value={onlineAgents} subtitle={`${dbStats?.agents.total ?? agents.length} ${t('total')}`} icon={<AgentIcon />} color="green" />
      <MetricCard label={t('queue')} value={backlogCount} subtitle={`${runningTasks} ${t('running')}`} icon={<TaskIcon />} color={backlogCount > 12 ? 'red' : 'purple'} />
      <MetricCard label={t('systemLoad')} value={isSystemLoading ? '...' : `${systemLoad}%`} subtitle={`${t('errors')} ${errorCount}`} icon={<ActivityIconMini />} color={systemLoad > 85 || errorCount > 0 ? 'red' : 'blue'} />
    </section>
  )
}
