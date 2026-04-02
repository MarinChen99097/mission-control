'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useMissionControl } from '@/store'
import type { DashboardData } from '../widget-primitives'

interface MarketingAction {
  id: string
  icon: string
  labelKey: string
  descKey: string
  messageKey: string
}

const MARKETING_ACTIONS: MarketingAction[] = [
  { id: 'create-lp', icon: '📄', labelKey: 'createLandingPage', descKey: 'createLandingPageDesc', messageKey: 'msgCreateLP' },
  { id: 'brand-diagnosis', icon: '🔬', labelKey: 'brandDiagnosis', descKey: 'brandDiagnosisDesc', messageKey: 'msgDiagnosis' },
  { id: 'social-posts', icon: '📱', labelKey: 'socialPosts', descKey: 'socialPostsDesc', messageKey: 'msgSocialPosts' },
  { id: 'market-research', icon: '📊', labelKey: 'marketResearch', descKey: 'marketResearchDesc', messageKey: 'msgResearch' },
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MarketingActionsWidget({ data: _data }: { data: DashboardData }) {
  const t = useTranslations('marketingActions')
  const { setChatPanelOpen, setActiveConversation, setChatInput } = useMissionControl()

  const handleAction = useCallback((action: MarketingAction) => {
    setChatInput(t(action.messageKey))
    setChatPanelOpen(true)
    setActiveConversation('agent_secretary')
  }, [setChatPanelOpen, setActiveConversation, setChatInput, t])

  return (
    <section className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('aiPowered')}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {MARKETING_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            className="group flex items-start gap-2.5 p-3 rounded-lg border border-border/50 bg-background/50 hover:border-primary/40 hover:bg-primary/[0.05] transition-all duration-200 text-left"
          >
            <span className="text-lg mt-0.5 group-hover:scale-110 transition-transform duration-200">
              {action.icon}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground">{t(action.labelKey)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t(action.descKey)}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
