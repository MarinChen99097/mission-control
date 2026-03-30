'use client'

import { useTranslations } from 'next-intl'
import {
  QuickAction,
  SpawnActionIcon,
  LogActionIcon,
  TaskActionIcon,
  MemoryActionIcon,
  SessionIcon,
  PipelineActionIcon,
  type DashboardData,
} from '../widget-primitives'

export function QuickActionsWidget({ data }: { data: DashboardData }) {
  const { isLocal, navigateToPanel } = data
  const t = useTranslations('dashboard')

  return (
    <section className="grid grid-cols-2 lg:grid-cols-5 gap-2">
      {!isLocal && <QuickAction label={t('spawnAgent')} desc={t('launchSubAgent')} tab="spawn" icon={<SpawnActionIcon />} onNavigate={navigateToPanel} />}
      <QuickAction label={t('viewLogs')} desc={t('realtimeViewer')} tab="logs" icon={<LogActionIcon />} onNavigate={navigateToPanel} />
      <QuickAction label={t('taskBoard')} desc={t('flowQueueControl')} tab="tasks" icon={<TaskActionIcon />} onNavigate={navigateToPanel} />
      <QuickAction label={t('memory')} desc={t('knowledgeRecall')} tab="memory" icon={<MemoryActionIcon />} onNavigate={navigateToPanel} />
      {isLocal
        ? <QuickAction label={t('sessions')} desc={t('claudeCodex')} tab="sessions" icon={<SessionIcon />} onNavigate={navigateToPanel} />
        : <QuickAction label={t('orchestration')} desc={t('workflowsPipelines')} tab="agents" icon={<PipelineActionIcon />} onNavigate={navigateToPanel} />}
    </section>
  )
}
