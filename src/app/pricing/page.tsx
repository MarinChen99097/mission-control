'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { locales, localeNames, type Locale } from '@/i18n/config'
import { useRef, useEffect } from 'react'

/* ---------- types ---------- */

type Tier = 'starter' | 'pro' | 'max'
type Interval = 'monthly' | 'annual'

/* ---------- helpers ---------- */

function setLocaleCookie(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;SameSite=Lax`
  window.location.reload()
}

/* ---------- sub-components ---------- */

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-primary shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M1.5 8h13" />
      <path d="M8 1.5c1.93 2.13 3 4.47 3 6.5s-1.07 4.37-3 6.5" />
      <path d="M8 1.5c-1.93 2.13-3 4.47-3 6.5s1.07 4.37 3 6.5" />
    </svg>
  )
}

function NavLanguageSwitcher() {
  const currentLocale = useLocale() as Locale
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-secondary"
        aria-label="Language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <GlobeIcon />
        <span className="hidden sm:inline text-xs">{localeNames[currentLocale]}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1.5 w-44 rounded-lg bg-card border border-border shadow-xl shadow-black/20 z-50 py-1 overflow-hidden"
            role="listbox"
            aria-label="Select language"
          >
            {locales.map((loc) => (
              <button
                key={loc}
                onClick={() => { setLocaleCookie(loc); setOpen(false) }}
                role="option"
                aria-selected={currentLocale === loc}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                  currentLocale === loc
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <span className="text-xs">{localeNames[loc]}</span>
                {currentLocale === loc && (
                  <svg className="w-3.5 h-3.5 text-primary shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5l3.5 3.5L13 4" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- main page ---------- */

async function handleSubscribe(tier: Tier, interval: Interval) {
  try {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, interval }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else if (data.error) {
      alert(data.error)
    }
  } catch {
    alert('Something went wrong. Please try again.')
  }
}

export default function PricingPage() {
  const t = useTranslations('home.pricing')
  const tNav = useTranslations('home.nav')
  const tFooter = useTranslations('home.footer')
  const [annual, setAnnual] = useState(false)
  const [loadingTier, setLoadingTier] = useState<string | null>(null)

  const plans: Array<{
    tier: Tier
    name: string
    monthly: number
    annual: number
    machine: string
    ram: string
    disk: string
    description: string
    features: string[]
    cta: string
    highlighted: boolean
  }> = [
    {
      tier: 'starter',
      name: t('starterName'),
      monthly: 10,
      annual: 100,
      machine: '1 vCPU',
      ram: '4 GB RAM',
      disk: '30 GB',
      description: t('starterDesc'),
      features: [
        t('featureAssistant'),
        t('featureBackups'),
        t('featureDriveNotion'),
        t('featureSkills'),
        t('featureCancel'),
      ],
      cta: t('starterCta'),
      highlighted: false,
    },
    {
      tier: 'pro',
      name: t('proName'),
      monthly: 19,
      annual: 190,
      machine: '2 vCPU',
      ram: '8 GB RAM',
      disk: '50 GB',
      description: t('proDesc'),
      features: [
        t('featureAssistant'),
        t('featureBackups'),
        t('featureDriveNotion'),
        t('featureSkills'),
        t('featureCancel'),
      ],
      cta: t('proCta'),
      highlighted: true,
    },
    {
      tier: 'max',
      name: t('maxName'),
      monthly: 35,
      annual: 350,
      machine: '4 vCPU',
      ram: '16 GB RAM',
      disk: '100 GB',
      description: t('maxDesc'),
      features: [
        t('featureAssistant'),
        t('featureBackups'),
        t('featureDriveNotion'),
        t('featureSkills'),
        t('featureCancel'),
      ],
      cta: t('maxCta'),
      highlighted: false,
    },
  ]

  async function onSubscribe(tier: Tier) {
    setLoadingTier(tier)
    const interval: Interval = annual ? 'annual' : 'monthly'
    await handleSubscribe(tier, interval)
    setLoadingTier(null)
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">OC</span>
            </div>
            <span className="font-semibold text-foreground tracking-tight">OrgOfClaws</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <NavLanguageSwitcher />
            <Link href="/login">
              <Button variant="ghost" size="sm">{tNav('signIn')}</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">{tNav('getStarted')}</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="text-center pt-16 sm:pt-20 pb-10 sm:pb-12 px-4 sm:px-6">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
          {t('title')}
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed px-2">
          {t('subtitle')}
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3">
          <span className={`text-sm ${!annual ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {t('monthly')}
          </span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-primary' : 'bg-border'}`}
            role="switch"
            aria-checked={annual}
            aria-label={t('toggleBilling')}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-6' : ''}`} />
          </button>
          <span className={`text-sm ${annual ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {t('annual')} <span className="text-primary text-xs font-medium ml-1">{t('save17')}</span>
          </span>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
          {plans.map((plan) => {
            const displayPrice = annual ? Math.round(plan.annual / 12) : plan.monthly
            const totalAnnual = plan.annual
            const isLoading = loadingTier === plan.tier

            return (
              <div
                key={plan.tier}
                className={`relative rounded-xl border p-6 flex flex-col transition-all duration-300 hover:-translate-y-0.5 ${
                  plan.highlighted
                    ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/15'
                    : 'border-border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                    {t('popular')}
                  </div>
                )}

                <div className="mb-5">
                  <h3 className="text-lg font-semibold text-foreground mb-1">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <div className="mb-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">${displayPrice}</span>
                    <span className="text-muted-foreground text-sm">/{t('mo')}</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ${totalAnnual}/{t('yr')} ({t('billedAnnually')})
                    </p>
                  )}
                </div>

                {/* Machine specs */}
                <div className="flex gap-2 mb-5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground font-mono">
                    {plan.machine}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground font-mono">
                    {plan.ram}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground font-mono">
                    {plan.disk} {t('disk')}
                  </span>
                </div>

                <Button
                  className={`w-full mb-6 ${plan.highlighted ? '' : 'bg-secondary hover:bg-secondary/80'}`}
                  variant={plan.highlighted ? 'default' : 'secondary'}
                  onClick={() => onSubscribe(plan.tier)}
                  disabled={isLoading}
                >
                  {isLoading ? t('processing') : plan.cta}
                </Button>

                <div className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <CheckIcon />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* All plans include */}
        <div className="mt-12 sm:mt-16 text-center">
          <h3 className="text-lg font-semibold text-foreground mb-6">{t('allPlansInclude')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { icon: '24/7', label: t('includeAssistant') },
              { icon: 'BK', label: t('includeBackups') },
              { icon: 'INT', label: t('includeIntegrations') },
              { icon: 'SK', label: t('includeSkills') },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center p-3 rounded-lg border border-border/50 bg-card/50">
                <span className="text-xs font-mono font-bold text-primary mb-1.5">{item.icon}</span>
                <span className="text-xs text-muted-foreground text-center">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="text-2xl font-bold text-foreground text-center mb-10">{t('faqTitle')}</h2>
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h3 className="font-medium text-foreground mb-2">{t('faqQ1')}</h3>
            <p className="text-sm text-muted-foreground">{t('faqA1')}</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground mb-2">{t('faqQ2')}</h3>
            <p className="text-sm text-muted-foreground">{t('faqA2')}</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground mb-2">{t('faqQ3')}</h3>
            <p className="text-sm text-muted-foreground">{t('faqA3')}</p>
          </div>
          <div>
            <h3 className="font-medium text-foreground mb-2">{t('faqQ4')}</h3>
            <p className="text-sm text-muted-foreground">{t('faqA4')}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 sm:py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-bold text-[10px]">OC</span>
                </div>
                <span className="font-semibold text-foreground text-sm">OrgOfClaws</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {tFooter('tagline')}
              </p>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/pricing" className="hover:text-foreground transition-colors">{tFooter('pricing')}</Link>
              <Link href="/login" className="hover:text-foreground transition-colors">{tFooter('signIn')}</Link>
              <Link href="/register" className="hover:text-foreground transition-colors">{tFooter('register')}</Link>
            </div>
          </div>
          <div className="mt-6 sm:mt-8 pt-6 border-t border-border/40 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {tFooter('copyright')}
          </div>
        </div>
      </footer>
    </div>
  )
}
