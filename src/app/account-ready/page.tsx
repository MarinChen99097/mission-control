'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

/* ---------- sub-components ---------- */

function PulsingOrb() {
  return (
    <div className="relative w-24 h-24 mx-auto mb-8">
      {/* Outer glow rings */}
      <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2s' }} />
      <div className="absolute inset-2 rounded-full bg-primary/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
      {/* Core orb */}
      <div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary via-primary/80 to-[hsl(var(--void-mint))] shadow-lg shadow-primary/30 flex items-center justify-center">
        <svg className="w-8 h-8 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      </div>
    </div>
  )
}

function SuccessIcon() {
  return (
    <div className="relative w-24 h-24 mx-auto mb-8">
      <div className="absolute inset-0 rounded-full bg-emerald-500/10" />
      <div className="absolute inset-2 rounded-full bg-emerald-500/15" />
      <div className="absolute inset-4 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
    </div>
  )
}

function IntegrationCard({ icon, name, desc }: { icon: React.ReactNode; name: string; desc: string }) {
  return (
    <div className="group flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-card/50 hover:border-primary/40 hover:bg-primary/[0.05] transition-all duration-300 hover:-translate-y-0.5">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-foreground text-sm">{name}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

/* ---------- main page ---------- */

export default function AccountReadyPage() {
  const t = useTranslations('accountReady')
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [ready, setReady] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Simulate setup progress (in production, this would poll /api/stripe/status)
  const checkStatus = useCallback(async () => {
    if (!sessionId) {
      // No session ID means direct visit — show ready state
      setReady(true)
      return
    }

    // In production, you would poll:
    // const res = await fetch(`/api/stripe/status?session_id=${sessionId}`)
    // const data = await res.json()
    // if (data.ready) setReady(true)

    // For now, simulate readiness after ~15 seconds
    // This gives the visual "setting up" experience
  }, [sessionId])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  useEffect(() => {
    if (ready) return

    const timer = setInterval(() => {
      setElapsedSeconds((s) => {
        if (s >= 15) {
          setReady(true)
          clearInterval(timer)
          return s
        }
        return s + 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [ready])

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Subtle background pattern */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.04)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.04)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[150px]" />
      </div>

      {/* Navigation */}
      <nav className="relative border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">OC</span>
            </div>
            <span className="font-semibold text-foreground tracking-tight">OrgOfClaws</span>
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-16">
        <div className="w-full max-w-lg text-center">
          {!ready ? (
            /* ---------- Setting up state ---------- */
            <>
              <PulsingOrb />

              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                {t('settingUp')}
              </h1>

              <p className="text-muted-foreground mb-6 leading-relaxed">
                {t('settingUpDesc')}
              </p>

              {/* Progress indicators */}
              <div className="space-y-3 text-left max-w-sm mx-auto mb-8">
                {[
                  { label: t('stepPayment'), done: elapsedSeconds >= 2 },
                  { label: t('stepAccount'), done: elapsedSeconds >= 6 },
                  { label: t('stepAssistant'), done: elapsedSeconds >= 10 },
                  { label: t('stepConnections'), done: elapsedSeconds >= 14 },
                ].map((step) => (
                  <div key={step.label} className="flex items-center gap-3">
                    {step.done ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center shrink-0">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      </div>
                    )}
                    <span className={`text-sm ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                {t('usuallyTakes')}
              </p>
            </>
          ) : (
            /* ---------- Ready state ---------- */
            <>
              <SuccessIcon />

              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                {t('ready')}
              </h1>

              <p className="text-muted-foreground mb-8 leading-relaxed">
                {t('readyDesc')}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
                <Link href="/login">
                  <Button size="lg" className="text-base px-8 h-12 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-200 w-full sm:w-auto">
                    {t('goToDashboard')}
                  </Button>
                </Link>
              </div>

              {/* Integrations */}
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground mb-4 text-center">
                  {t('connectApps')}
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <IntegrationCard
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                      </svg>
                    }
                    name={t('integrationDrive')}
                    desc={t('integrationDriveDesc')}
                  />
                  <IntegrationCard
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    }
                    name={t('integrationNotion')}
                    desc={t('integrationNotionDesc')}
                  />
                  <IntegrationCard
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                      </svg>
                    }
                    name={t('integrationGithub')}
                    desc={t('integrationGithubDesc')}
                  />
                  <IntegrationCard
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    }
                    name={t('integrationGmail')}
                    desc={t('integrationGmailDesc')}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center mt-4">
                  {t('connectLater')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
