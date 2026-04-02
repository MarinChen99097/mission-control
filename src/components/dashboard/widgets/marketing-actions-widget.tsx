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
  message: string
}

const MARKETING_ACTIONS: MarketingAction[] = [
  {
    id: 'create-lp',
    icon: '📄',
    labelKey: 'createLandingPage',
    descKey: 'createLandingPageDesc',
    message: '幫我做一個 Landing Page',
  },
  {
    id: 'brand-diagnosis',
    icon: '🔬',
    labelKey: 'brandDiagnosis',
    descKey: 'brandDiagnosisDesc',
    message: '幫我做品牌診斷',
  },
  {
    id: 'social-posts',
    icon: '📱',
    labelKey: 'socialPosts',
    descKey: 'socialPostsDesc',
    message: '幫我做社群貼文',
  },
  {
    id: 'market-research',
    icon: '📊',
    labelKey: 'marketResearch',
    descKey: 'marketResearchDesc',
    message: '幫我做市場研究',
  },
]

export function MarketingActionsWidget({ data }: { data: DashboardData }) {
  const t = useTranslations('marketingActions')
  const { setChatPanelOpen, setActiveConversation } = useMissionControl()

  const handleAction = useCallback((action: MarketingAction) => {
    // Store intent so chat picks it up as first message context
    try {
      sessionStorage.setItem('quick_action_message', action.message)
    } catch { /* SSR guard */ }
    setChatPanelOpen(true)
    setActiveConversation('agent_secretary')
  }, [setChatPanelOpen, setActiveConversation])

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
