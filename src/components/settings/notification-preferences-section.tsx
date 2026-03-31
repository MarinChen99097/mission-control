'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'

const STORAGE_KEY = 'mc_notification_prefs'

interface NotificationPrefs {
  taskComplete: boolean
  agentError: boolean
  deploySuccess: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  taskComplete: true,
  agentError: true,
  deploySuccess: true,
}

function loadPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw)
    return {
      taskComplete: typeof parsed.taskComplete === 'boolean' ? parsed.taskComplete : DEFAULT_PREFS.taskComplete,
      agentError: typeof parsed.agentError === 'boolean' ? parsed.agentError : DEFAULT_PREFS.agentError,
      deploySuccess: typeof parsed.deploySuccess === 'boolean' ? parsed.deploySuccess : DEFAULT_PREFS.deploySuccess,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function NotificationPreferencesSection() {
  const t = useTranslations('settings')
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setPrefs(loadPrefs())
    setMounted(true)
  }, [])

  const toggle = useCallback((key: keyof NotificationPrefs) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // storage full or blocked
      }
      return next
    })
  }, [])

  if (!mounted) {
    return <div className="bg-card border border-border rounded-lg p-4 h-[140px] animate-pulse" />
  }

  const items: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
    { key: 'taskComplete', label: t('notifTaskComplete'), desc: t('notifTaskCompleteDesc') },
    { key: 'agentError', label: t('notifAgentError'), desc: t('notifAgentErrorDesc') },
    { key: 'deploySuccess', label: t('notifDeploySuccess'), desc: t('notifDeploySuccessDesc') },
  ]

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-foreground mb-1">{t('notifTitle')}</h3>
      <p className="text-xs text-muted-foreground mb-4">{t('notifDesc')}</p>

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.key} className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
            <button
              onClick={() => toggle(item.key)}
              className={`w-10 h-5 rounded-full relative transition-colors select-none shrink-0 ${
                prefs[item.key] ? 'bg-primary' : 'bg-muted'
              }`}
              role="switch"
              aria-checked={prefs[item.key]}
              aria-label={`Toggle ${item.label}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  prefs[item.key] ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
