'use client'

import { useTheme } from 'next-themes'
import { type ReactNode, useEffect, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { THEMES, type ThemeMeta } from '@/lib/themes'

type AppearanceMode = 'dark' | 'light' | 'system'

/** Derive the mode from a theme id. */
function themeToMode(themeId: string | undefined): AppearanceMode {
  if (themeId === 'system') return 'system'
  const meta = THEMES.find(t => t.id === themeId)
  return meta?.group === 'light' ? 'light' : 'dark'
}

export function AppearanceSection() {
  const t = useTranslations('settings')
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<AppearanceMode>('dark')
  const pillRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Record<AppearanceMode, HTMLButtonElement | null>>({ dark: null, light: null, system: null })

  useEffect(() => { setMounted(true) }, [])

  // Sync mode from current theme
  useEffect(() => {
    if (mounted) setMode(themeToMode(theme))
  }, [mounted, theme])

  // Animate the pill indicator
  useEffect(() => {
    if (!mounted) return
    const btn = segmentRefs.current[mode]
    const pill = pillRef.current
    if (btn && pill) {
      pill.style.width = `${btn.offsetWidth}px`
      pill.style.transform = `translateX(${btn.offsetLeft}px)`
    }
  }, [mounted, mode])

  if (!mounted) {
    return <div className="bg-card border border-border rounded-lg p-4 h-[200px] animate-pulse" />
  }

  const darkThemes = THEMES.filter(t => t.group === 'dark')
  const lightThemes = THEMES.filter(t => t.group === 'light')

  // Determine which palette to show
  const paletteThemes: ThemeMeta[] = mode === 'light' ? lightThemes : darkThemes

  // When the user is in system mode, highlight the resolved theme
  const activeThemeId = theme === 'system' ? resolvedTheme : theme

  const handleModeChange = (newMode: AppearanceMode) => {
    setMode(newMode)
    if (newMode === 'system') {
      setTheme('system')
    } else {
      // Switch to the first theme in the group, or keep current if it matches
      const currentMeta = THEMES.find(t => t.id === theme)
      if (currentMeta?.group === newMode) return // already in the right group
      const firstInGroup = THEMES.find(t => t.group === newMode)
      if (firstInGroup) setTheme(firstInGroup.id)
    }
  }

  const handleThemeSelect = (themeId: string) => {
    setTheme(themeId)
    // If selecting a specific theme, exit system mode
    const meta = THEMES.find(t => t.id === themeId)
    if (meta) setMode(meta.group)
  }

  const segments: { key: AppearanceMode; label: string; icon: ReactNode }[] = [
    {
      key: 'dark',
      label: t('appearanceDark'),
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M13.5 8.5a5.5 5.5 0 01-7.5 5.1A5.5 5.5 0 018.5 2a5.5 5.5 0 005 6.5z" />
        </svg>
      ),
    },
    {
      key: 'light',
      label: t('appearanceLight'),
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" />
        </svg>
      ),
    },
    {
      key: 'system',
      label: t('appearanceSystem'),
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="12" height="9" rx="1.5" />
          <path d="M5.5 15h5M8 12v3" />
        </svg>
      ),
    },
  ]

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">{t('appearance')}</h3>
          <p className="text-2xs text-muted-foreground mt-0.5">{t('appearanceDesc')}</p>
        </div>
      </div>

      {/* Segmented Control */}
      <div className="relative inline-flex bg-secondary rounded-lg p-0.5">
        {/* Sliding pill */}
        <div
          ref={pillRef}
          className="absolute top-0.5 left-0 h-[calc(100%-4px)] rounded-md bg-background shadow-sm border border-border/50 transition-all duration-200 ease-out"
        />

        {segments.map(seg => (
          <button
            key={seg.key}
            ref={el => { segmentRefs.current[seg.key] = el }}
            onClick={() => handleModeChange(seg.key)}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 ${
              mode === seg.key
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/70'
            }`}
          >
            {seg.icon}
            {seg.label}
          </button>
        ))}
      </div>

      {mode === 'system' && resolvedTheme && (
        <p className="text-2xs text-muted-foreground mt-2">
          {t('appearanceSystemHint', { resolved: THEMES.find(tm => tm.id === resolvedTheme)?.label || resolvedTheme })}
        </p>
      )}

      {/* Theme palette */}
      <div className="mt-3">
        <p className="text-2xs text-muted-foreground mb-2">
          {mode === 'system' ? t('appearanceSystemThemes') : t('appearanceChooseTheme')}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {paletteThemes.map(tm => {
            const isActive = activeThemeId === tm.id
            return (
              <button
                key={tm.id}
                onClick={() => handleThemeSelect(tm.id)}
                className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all duration-150 ${
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-muted-foreground/40 bg-secondary/50 hover:bg-secondary'
                }`}
              >
                {/* Swatch */}
                <div className="relative">
                  <div
                    className="w-8 h-8 rounded-full border border-border/30 shadow-sm"
                    style={{ backgroundColor: tm.swatch }}
                  />
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 drop-shadow-md"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 8.5l3.5 3.5L13 4" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className={`text-2xs leading-tight text-center ${
                  isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`}>
                  {tm.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
