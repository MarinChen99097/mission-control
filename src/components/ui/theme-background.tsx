'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { THEMES } from '@/lib/themes'

export function ThemeBackground() {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Use resolvedTheme to handle 'system' mode correctly.
  // When theme='system', resolvedTheme gives the actual theme based on OS preference.
  const effectiveTheme = resolvedTheme || theme

  // Sync the "dark" class on <html> so Tailwind dark: variants work.
  // next-themes applies the theme id as a single class; we add/remove
  // "dark" separately based on the theme's group.
  useEffect(() => {
    if (!mounted || !effectiveTheme) return
    const meta = THEMES.find(t => t.id === effectiveTheme)
    if (!meta) return // Unknown theme — trust FOUC script's current state
    const el = document.documentElement
    if (meta.group === 'dark') {
      el.classList.add('dark')
    } else {
      el.classList.remove('dark')
    }
  }, [mounted, effectiveTheme])

  if (!mounted) return null

  const meta = THEMES.find(t => t.id === effectiveTheme)
  const bgClass = meta?.background

  if (!bgClass) return null

  return (
    <div
      className={`${bgClass} fixed inset-0 -z-10 pointer-events-none`}
      aria-hidden="true"
    />
  )
}
