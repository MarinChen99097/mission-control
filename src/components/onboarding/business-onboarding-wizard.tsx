'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useMissionControl } from '@/store'
import { BUSINESS_ONBOARDING_STEPS } from '@/lib/onboarding-flow'

interface BusinessProfile {
  brandName: string
  productDescription: string
  websiteUrl: string
}

const GOALS = [
  { id: 'brand-awareness', icon: '📢', labelKey: 'brandAwareness', descKey: 'brandAwarenessDesc' },
  { id: 'lead-generation', icon: '🎯', labelKey: 'leadGeneration', descKey: 'leadGenerationDesc' },
  { id: 'sales-growth', icon: '📈', labelKey: 'salesGrowth', descKey: 'salesGrowthDesc' },
  { id: 'market-research', icon: '🔍', labelKey: 'marketResearch', descKey: 'marketResearchDesc' },
  { id: 'content-creation', icon: '🎨', labelKey: 'contentCreation', descKey: 'contentCreationDesc' },
  { id: 'not-sure', icon: '💡', labelKey: 'notSure', descKey: 'notSureDesc' },
] as const

const SERVICES = [
  { id: 'landing-page', icon: '📄', labelKey: 'landingPage', descKey: 'landingPageDesc', valueKey: 'landingPageValue' },
  { id: 'social-posts', icon: '📱', labelKey: 'socialPosts', descKey: 'socialPostsDesc', valueKey: 'socialPostsValue' },
  { id: 'brand-diagnosis', icon: '🔬', labelKey: 'brandDiagnosis', descKey: 'brandDiagnosisDesc', valueKey: 'brandDiagnosisValue' },
  { id: 'deep-research', icon: '📊', labelKey: 'deepResearch', descKey: 'deepResearchDesc', valueKey: 'deepResearchValue' },
  { id: 'reels-video', icon: '🎬', labelKey: 'reelsVideo', descKey: 'reelsVideoDesc', valueKey: 'reelsVideoValue' },
] as const

export function BusinessOnboardingWizard({ onClose }: { onClose: () => void }) {
  const t = useTranslations('businessOnboarding')
  const { setChatPanelOpen, setActiveConversation, setChatInput } = useMissionControl()
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [profile, setProfile] = useState<BusinessProfile>({
    brandName: '', productDescription: '', websiteUrl: '',
  })
  const [selectedGoal, setSelectedGoal] = useState('')
  const [selectedService, setSelectedService] = useState('')

  // SSR guard — createPortal needs document.body
  useEffect(() => { setMounted(true) }, [])

  const dismiss = useCallback(() => {
    setClosing(true)
    try { localStorage.setItem('business_onboarding_dismissed', '1') } catch { /* SSR */ }
    fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss_business_onboarding' }),
    }).catch(err => console.warn('Failed to save dismissal:', err))
    setTimeout(() => onClose(), 300)
  }, [onClose])

  const startChat = useCallback(() => {
    // Build initial message with collected profile data
    const parts: string[] = []
    if (profile.brandName) parts.push(`${t('profile.brandName')}: ${profile.brandName}`)
    if (profile.productDescription) parts.push(`${t('profile.productDescription')}: ${profile.productDescription}`)
    if (profile.websiteUrl) parts.push(`${t('profile.websiteUrl')}: ${profile.websiteUrl}`)
    const goalLabel = GOALS.find(g => g.id === selectedGoal)
    if (goalLabel) parts.push(`${t('goals.title')}: ${t(`goals.${goalLabel.labelKey}`)}`)
    const serviceLabel = SERVICES.find(s => s.id === selectedService)
    if (serviceLabel) parts.push(`${t('services.title')}: ${t(`services.${serviceLabel.labelKey}`)}`)

    // Set chat input via store (not sessionStorage)
    setChatInput(parts.join('\n'))

    setClosing(true)
    setTimeout(() => {
      onClose()
      setChatPanelOpen(true)
      setActiveConversation('agent_secretary')
    }, 300)
  }, [profile, selectedGoal, selectedService, onClose, setChatPanelOpen, setActiveConversation, setChatInput, t])

  if (!mounted) return null

  const currentStep = BUSINESS_ONBOARDING_STEPS[step]
  const totalSteps = BUSINESS_ONBOARDING_STEPS.length

  return createPortal(
    <div className={`fixed inset-0 z-[140] flex items-center justify-center transition-opacity duration-300 ${closing ? 'opacity-0' : 'opacity-100'}`}>
      <div className="absolute inset-0 bg-black/82 backdrop-blur-md" onClick={dismiss} />

      <div className="relative z-10 w-full max-w-lg mx-4 bg-background border border-border/50 rounded-xl shadow-2xl overflow-hidden">
        {/* Progress */}
        <div className="h-0.5 bg-surface-2">
          <div className="h-full bg-primary transition-all duration-500"
               style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>

        <div className="flex flex-col items-center gap-1 pt-4 pb-2">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-surface-2'
              }`} />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{currentStep?.title}</span>
        </div>

        <div className="px-6 py-4 min-h-[380px] max-h-[70vh] flex flex-col">
          {/* Step 1: Business Profile */}
          {step === 0 && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-semibold">{t('profile.title')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t('profile.description')}</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {t('profile.brandName')} *
                  </label>
                  <input
                    type="text"
                    value={profile.brandName}
                    onChange={e => setProfile(p => ({ ...p, brandName: e.target.value }))}
                    placeholder={t('profile.brandNamePlaceholder')}
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {t('profile.productDescription')}
                  </label>
                  <textarea
                    value={profile.productDescription}
                    onChange={e => setProfile(p => ({ ...p, productDescription: e.target.value }))}
                    placeholder={t('profile.productDescriptionPlaceholder')}
                    rows={2}
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {t('profile.websiteUrl')}
                    <span className="ml-2 text-primary/70">{t('profile.websiteUrlHint')}</span>
                  </label>
                  <input
                    type="url"
                    value={profile.websiteUrl}
                    onChange={e => setProfile(p => ({ ...p, websiteUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-surface-1 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-between mt-auto pt-4">
                <Button variant="ghost" size="sm" onClick={dismiss}>{t('skipForNow')}</Button>
                <Button size="sm" onClick={() => setStep(1)} disabled={!profile.brandName}>
                  {t('next')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Goal Selection */}
          {step === 1 && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-semibold">{t('goals.title')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t('goals.description')}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {GOALS.map(goal => (
                  <button
                    key={goal.id}
                    onClick={() => setSelectedGoal(goal.id)}
                    className={`p-3 rounded-lg border text-left transition-all text-sm ${
                      selectedGoal === goal.id
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <span className="text-lg">{goal.icon}</span>
                    <div className="font-medium mt-1">{t(`goals.${goal.labelKey}`)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t(`goals.${goal.descKey}`)}</div>
                  </button>
                ))}
              </div>

              <div className="flex justify-between mt-auto pt-4">
                <Button variant="ghost" size="sm" onClick={() => setStep(0)}>{t('back')}</Button>
                <Button size="sm" onClick={() => setStep(2)} disabled={!selectedGoal}>
                  {t('next')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Recommended Services */}
          {step === 2 && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-semibold">{t('services.title')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t('services.description')}</p>
              </div>

              <div className="space-y-2 overflow-y-auto max-h-[280px]">
                {SERVICES.map(service => (
                  <button
                    key={service.id}
                    onClick={() => setSelectedService(service.id)}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      selectedService === service.id
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{service.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{t(`services.${service.labelKey}`)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t(`services.${service.descKey}`)}</div>
                        <div className="text-xs text-primary/80 mt-1 font-medium">{t(`services.${service.valueKey}`)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex justify-between mt-auto pt-4">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>{t('back')}</Button>
                <Button size="sm" onClick={startChat}>
                  {t('startWithAgent')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
