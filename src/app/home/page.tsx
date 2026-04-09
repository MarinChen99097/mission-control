'use client'

import Link from 'next/link'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { locales, localeNames, type Locale } from '@/i18n/config'

/* ---------- landing page design tokens ---------- */

const landingColors = {
  '--landing-bg': '#050A14',
  '--landing-bg-alt': '#0A1628',
  '--landing-card': 'rgba(10, 30, 60, 0.6)',
  '--landing-card-solid': '#0C1E35',
  '--landing-border': 'rgba(30, 58, 95, 0.4)',
  '--landing-border-hover': 'rgba(59, 130, 246, 0.4)',
  '--landing-text': '#F0F4FF',
  '--landing-muted': '#8CA3C0',
  '--landing-accent': '#3B82F6',
  '--landing-accent-light': '#60A5FA',
  '--landing-gold': '#F5A623',
  '--landing-gold-light': '#FBBF24',
  '--landing-green': '#10B981',
  '--landing-red': '#EF4444',
} as React.CSSProperties

/* ---------- helpers ---------- */

function setLocaleCookie(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;SameSite=Lax`
  window.location.reload()
}

function smoothScrollTo(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/* ---------- sub-components ---------- */

function HeroOrb() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Central blue orb glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full blur-[160px] opacity-25"
        style={{ background: 'radial-gradient(ellipse, var(--landing-accent), #1E3A5F 50%, transparent 70%)' }}
      />
      {/* Gold accent glow — offset top-right for depth */}
      <div
        className="absolute top-[30%] right-[20%] w-[350px] h-[250px] rounded-full blur-[130px] opacity-15"
        style={{ background: 'var(--landing-gold)' }}
      />
      {/* Subtle cool glow bottom-left for balance */}
      <div
        className="absolute bottom-[20%] left-[15%] w-[250px] h-[200px] rounded-full blur-[120px] opacity-10"
        style={{ background: '#60A5FA' }}
      />
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(to right, var(--landing-muted) 1px, transparent 1px), linear-gradient(to bottom, var(--landing-muted) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  )
}

function SectionDivider() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <div
        className="h-px w-full"
        style={{
          background: 'linear-gradient(to right, transparent, var(--landing-border), transparent)',
        }}
      />
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  desc,
  tag,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  tag: string
}) {
  return (
    <div
      className="group relative p-6 rounded-xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(245,166,35,0.12),inset_0_0_0_1px_rgba(245,166,35,0.3)]"
      style={{
        background: 'var(--landing-card)',
        border: '1px solid var(--landing-border)',
      }}
    >
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300"
        style={{ background: 'rgba(59, 130, 246, 0.12)', color: 'var(--landing-accent-light)' }}
      >
        {icon}
      </div>
      <h3
        className="font-semibold text-[17px] mb-2"
        style={{ color: 'var(--landing-text)' }}
      >
        {title}
      </h3>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: 'var(--landing-muted)' }}
      >
        {desc}
      </p>
      <span
        className="inline-block text-xs px-2.5 py-1 rounded-full font-medium"
        style={{
          background: 'rgba(245, 166, 35, 0.1)',
          color: 'var(--landing-gold-light)',
        }}
      >
        {tag}
      </span>
    </div>
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
        className="flex items-center gap-1.5 text-sm transition-colors px-2 py-1.5 rounded-md"
        style={{ color: 'var(--landing-muted)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--landing-text)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--landing-muted)' }}
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
            className="absolute right-0 top-full mt-1.5 w-44 rounded-lg shadow-xl shadow-black/30 z-50 py-1 overflow-hidden"
            style={{
              background: 'var(--landing-card-solid)',
              border: '1px solid var(--landing-border)',
            }}
            role="listbox"
            aria-label="Select language"
          >
            {locales.map((loc) => (
              <button
                key={loc}
                onClick={() => { setLocaleCookie(loc); setOpen(false) }}
                role="option"
                aria-selected={currentLocale === loc}
                className="w-full flex items-center justify-between px-3 py-2 text-sm transition-colors"
                style={{
                  color: currentLocale === loc ? 'var(--landing-text)' : 'var(--landing-muted)',
                  background: currentLocale === loc ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (currentLocale !== loc) {
                    e.currentTarget.style.color = 'var(--landing-text)'
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentLocale !== loc) {
                    e.currentTarget.style.color = 'var(--landing-muted)'
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                <span className="text-xs">{localeNames[loc]}</span>
                {currentLocale === loc && (
                  <svg className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--landing-accent-light)' }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function MobileMenu({ onClose }: { onClose: () => void }) {
  const t = useTranslations('home.nav')
  return (
    <>
      <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ background: 'rgba(5, 10, 20, 0.8)' }} onClick={onClose} />
      <div
        className="fixed top-16 left-0 right-0 z-50 shadow-xl p-4 flex flex-col gap-3 backdrop-blur-md"
        style={{
          background: 'rgba(10, 22, 40, 0.95)',
          borderBottom: '1px solid var(--landing-border)',
        }}
      >
        <button
          onClick={() => { smoothScrollTo('features'); onClose() }}
          className="text-left text-sm transition-colors py-2 px-3 rounded-lg"
          style={{ color: 'var(--landing-muted)' }}
        >
          {t('features')}
        </button>
        <Link href="/pricing" className="text-sm transition-colors py-2 px-3 rounded-lg" style={{ color: 'var(--landing-muted)' }} onClick={onClose}>
          {t('pricing')}
        </Link>
        <button
          onClick={() => { smoothScrollTo('security'); onClose() }}
          className="text-left text-sm transition-colors py-2 px-3 rounded-lg"
          style={{ color: 'var(--landing-muted)' }}
        >
          {t('security')}
        </button>
        <div className="pt-3 flex gap-2" style={{ borderTop: '1px solid var(--landing-border)' }}>
          <Link href="/login" className="flex-1">
            <Button variant="ghost" size="sm" className="w-full" style={{ color: 'var(--landing-text)' }}>{t('signIn')}</Button>
          </Link>
          <Link href="/register" className="flex-1">
            <Button size="sm" className="w-full" style={{ background: 'var(--landing-gold)', color: '#0A1628' }}>{t('startFree')}</Button>
          </Link>
        </div>
      </div>
    </>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-lg overflow-hidden transition-colors duration-200"
      style={{ border: '1px solid var(--landing-border)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors duration-200"
        aria-expanded={open}
      >
        <span className="font-medium text-sm sm:text-base pr-4" style={{ color: 'var(--landing-text)' }}>{question}</span>
        <svg
          className={`w-5 h-5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--landing-muted)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`grid transition-all duration-200 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-sm leading-relaxed" style={{ color: 'var(--landing-muted)' }}>{answer}</p>
        </div>
      </div>
    </div>
  )
}

/* ---------- feature icons ---------- */

function MarketingIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
    </svg>
  )
}

function ResearchIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function AutomationIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function BrainIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}

function AnalyticsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}

/* ---------- main page ---------- */

export default function HomePage() {
  const t = useTranslations('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleNavClick = useCallback((id: string) => {
    smoothScrollTo(id)
  }, [])

  return (
    <div
      className="h-full overflow-y-auto scroll-smooth"
      style={{
        ...landingColors,
        background: 'var(--landing-bg)',
        color: 'var(--landing-text)',
      }}
    >
      {/* ========== Navigation ========== */}
      <nav
        className="backdrop-blur-md sticky top-0 z-50"
        style={{
          background: 'rgba(5, 10, 20, 0.88)',
          borderBottom: '1px solid var(--landing-border)',
        }}
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(59, 130, 246, 0.15)' }}
            >
              <span className="font-bold text-sm" style={{ color: 'var(--landing-accent-light)' }}>OC</span>
            </div>
            <span className="font-semibold tracking-tight" style={{ color: 'var(--landing-text)' }}>OrgOfClaws</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6 text-sm" style={{ color: 'var(--landing-muted)' }}>
            <button onClick={() => handleNavClick('features')} className="hover:opacity-100 transition-opacity">{t('nav.features')}</button>
            <Link href="/pricing" className="hover:opacity-100 transition-opacity">{t('nav.pricing')}</Link>
            <button onClick={() => handleNavClick('security')} className="hover:opacity-100 transition-opacity">{t('nav.security')}</button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NavLanguageSwitcher />

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" style={{ color: 'var(--landing-muted)' }}>{t('nav.signIn')}</Button>
              </Link>
              <Link href="/register">
                <Button
                  size="sm"
                  className="font-medium"
                  style={{ background: 'var(--landing-gold)', color: '#0A1628' }}
                >
                  {t('nav.startFree')}
                </Button>
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden flex items-center justify-center w-8 h-8 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={t('nav.menu')}
              aria-expanded={mobileMenuOpen}
              style={{ color: 'var(--landing-muted)' }}
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && <MobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </nav>

      {/* ========== Hero ========== */}
      <section className="relative pt-20 sm:pt-28 pb-20 sm:pb-28 px-4 sm:px-6">
        <HeroOrb />
        <div className="relative max-w-[1200px] mx-auto text-center">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium mb-8"
            style={{
              background: 'rgba(245, 166, 35, 0.1)',
              border: '1px solid rgba(245, 166, 35, 0.3)',
              color: 'var(--landing-gold)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--landing-gold)' }}
            />
            {t('hero.badge')}
          </div>

          {/* Headline */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.08]"
            style={{ letterSpacing: '-0.03em' }}
          >
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, var(--landing-accent-light), var(--landing-gold), var(--landing-accent))',
              }}
            >
              {t('hero.headline')}
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className="text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-10 px-2"
            style={{ color: 'var(--landing-muted)', lineHeight: '1.6' }}
          >
            {t('hero.subheadline')}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="text-base px-8 h-12 font-medium transition-all duration-200 hover:scale-[1.02] w-full sm:w-auto"
                style={{
                  background: 'linear-gradient(135deg, var(--landing-gold), #D4880F)',
                  color: '#0A1628',
                  boxShadow: '0 4px 24px rgba(245, 166, 35, 0.35)',
                }}
              >
                {t('hero.ctaPrimary')}
              </Button>
            </Link>
            <button
              onClick={() => smoothScrollTo('features')}
              className="text-base px-8 h-12 rounded-md font-medium transition-all duration-200 hover:scale-[1.02] w-full sm:w-auto"
              style={{
                border: '1px solid var(--landing-border)',
                color: 'var(--landing-text)',
                background: 'transparent',
              }}
            >
              {t('hero.ctaSecondary')}
            </button>
          </div>

          {/* Trust line */}
          <p
            className="text-xs mt-6"
            style={{ color: 'var(--landing-muted)' }}
          >
            {t('hero.trustLine')}
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* ========== Feature Showcase (6 cards) ========== */}
      <section id="features" className="py-24 sm:py-32 px-4 sm:px-6 scroll-mt-20">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-14 sm:mb-16">
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ color: 'var(--landing-text)', letterSpacing: '-0.02em' }}
            >
              {t('features.title')}
            </h2>
            <p
              className="max-w-xl mx-auto px-2"
              style={{ color: 'var(--landing-muted)' }}
            >
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={<MarketingIcon />}
              title={t('features.marketingTitle')}
              desc={t('features.marketingDesc')}
              tag={t('features.marketingTag')}
            />
            <FeatureCard
              icon={<ResearchIcon />}
              title={t('features.researchTitle')}
              desc={t('features.researchDesc')}
              tag={t('features.researchTag')}
            />
            <FeatureCard
              icon={<EmailIcon />}
              title={t('features.emailTitle')}
              desc={t('features.emailDesc')}
              tag={t('features.emailTag')}
            />
            <FeatureCard
              icon={<AutomationIcon />}
              title={t('features.automationTitle')}
              desc={t('features.automationDesc')}
              tag={t('features.automationTag')}
            />
            <FeatureCard
              icon={<BrainIcon />}
              title={t('features.aiTitle')}
              desc={t('features.aiDesc')}
              tag={t('features.aiTag')}
            />
            <FeatureCard
              icon={<AnalyticsIcon />}
              title={t('features.analyticsTitle')}
              desc={t('features.analyticsDesc')}
              tag={t('features.analyticsTag')}
            />
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ========== Social Proof / Numbers ========== */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8">
            {[
              { value: t('stats.modelsValue'), label: t('stats.modelsLabel') },
              { value: t('stats.sourcesValue'), label: t('stats.sourcesLabel') },
              { value: t('stats.agentsValue'), label: t('stats.agentsLabel') },
              { value: t('stats.uptimeValue'), label: t('stats.uptimeLabel') },
            ].map((stat) => (
              <div key={stat.label} className="text-center p-6">
                <div
                  className="text-3xl sm:text-4xl font-bold mb-2"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, var(--landing-accent-light), var(--landing-gold))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {stat.value}
                </div>
                <p className="text-sm" style={{ color: 'var(--landing-muted)' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ========== How It Works (3 steps) ========== */}
      <section className="py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          <h2
            className="text-3xl sm:text-4xl font-bold text-center mb-14"
            style={{ color: 'var(--landing-text)', letterSpacing: '-0.02em' }}
          >
            {t('steps.title')}
          </h2>
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-12">
            {(['1', '2', '3'] as const).map((step) => (
              <div key={step} className="text-center group">
                <div
                  className="w-14 h-14 rounded-full font-bold text-xl flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-all duration-300"
                  style={{
                    background: 'rgba(245, 166, 35, 0.1)',
                    color: 'var(--landing-gold)',
                    border: '1px solid rgba(245, 166, 35, 0.2)',
                  }}
                >
                  {step}
                </div>
                <h3
                  className="font-semibold text-lg mb-2"
                  style={{ color: 'var(--landing-text)' }}
                >
                  {t(`steps.step${step}Title`)}
                </h3>
                <p
                  className="text-sm"
                  style={{ color: 'var(--landing-muted)' }}
                >
                  {t(`steps.step${step}Desc`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ========== Before / After Comparison ========== */}
      <section className="py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ color: 'var(--landing-text)', letterSpacing: '-0.02em' }}
            >
              {t('comparison.title')}
            </h2>
            <p className="max-w-xl mx-auto" style={{ color: 'var(--landing-muted)' }}>
              {t('comparison.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {/* Without */}
            <div className="relative p-6 sm:p-8 rounded-2xl" style={{ border: '2px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.03)' }}>
              <div
                className="absolute -top-3.5 left-6 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase"
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#F87171' }}
              >
                {t('comparison.without')}
              </div>
              <div className="mt-3 space-y-4">
                {(['cost', 'tools', 'hours'] as const).map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                      <svg className="w-3.5 h-3.5" style={{ color: '#F87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--landing-muted)' }}>{t(`comparison.without_${key}`)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* With */}
            <div className="relative p-6 sm:p-8 rounded-2xl" style={{ border: '2px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.03)' }}>
              <div
                className="absolute -top-3.5 left-6 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase"
                style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34D399' }}
              >
                {t('comparison.with')}
              </div>
              <div className="mt-3 space-y-4">
                {(['cost', 'tools', 'hours'] as const).map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                      <svg className="w-3.5 h-3.5" style={{ color: '#34D399' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--landing-text)' }}>{t(`comparison.with_${key}`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ========== Security ========== */}
      <section id="security" className="py-24 sm:py-32 px-4 sm:px-6 scroll-mt-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2
            className="text-3xl sm:text-4xl font-bold mb-4"
            style={{ color: 'var(--landing-text)', letterSpacing: '-0.02em' }}
          >
            {t('security.title')}
          </h2>
          <p className="max-w-xl mx-auto mb-12" style={{ color: 'var(--landing-muted)' }}>
            {t('security.subtitle')}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5 text-left">
            {[
              { label: t('security.aes'), desc: t('security.aesDesc') },
              { label: t('security.tls'), desc: t('security.tlsDesc') },
              { label: t('security.isolated'), desc: t('security.isolatedDesc') },
              { label: t('security.soc'), desc: t('security.socDesc') },
            ].map((item) => (
              <div
                key={item.label}
                className="p-4 sm:p-5 rounded-xl transition-all duration-300"
                style={{
                  background: 'var(--landing-card)',
                  border: '1px solid var(--landing-border)',
                }}
              >
                <div
                  className="text-lg font-mono font-bold mb-1"
                  style={{ color: 'var(--landing-accent-light)' }}
                >
                  {item.label}
                </div>
                <div className="text-xs sm:text-sm" style={{ color: 'var(--landing-muted)' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ========== Pricing Preview ========== */}
      <section className="py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ color: 'var(--landing-text)', letterSpacing: '-0.02em' }}
            >
              {t('pricingPreview.title')}
            </h2>
            <p style={{ color: 'var(--landing-muted)' }}>
              {t('pricingPreview.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {/* Starter */}
            <div
              className="p-6 rounded-xl text-center"
              style={{ background: 'var(--landing-card)', border: '1px solid var(--landing-border)' }}
            >
              <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--landing-text)' }}>{t('pricingPreview.starterName')}</h3>
              <div className="mb-3">
                <span className="text-3xl font-bold" style={{ color: 'var(--landing-text)' }}>$10</span>
                <span className="text-sm" style={{ color: 'var(--landing-muted)' }}>/mo</span>
              </div>
              <Link href="/pricing">
                <Button
                  size="sm"
                  className="w-full"
                  style={{ border: '1px solid var(--landing-border)', background: 'transparent', color: 'var(--landing-text)' }}
                >
                  {t('pricingPreview.cta')}
                </Button>
              </Link>
            </div>

            {/* Pro */}
            <div
              className="p-6 rounded-xl text-center relative"
              style={{
                background: 'var(--landing-card)',
                border: '2px solid var(--landing-gold)',
                boxShadow: '0 0 30px rgba(245, 166, 35, 0.15)',
              }}
            >
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: 'var(--landing-gold)', color: '#0A1628' }}
              >
                {t('pricingPreview.popular')}
              </div>
              <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--landing-text)' }}>{t('pricingPreview.proName')}</h3>
              <div className="mb-3">
                <span className="text-3xl font-bold" style={{ color: 'var(--landing-text)' }}>$19</span>
                <span className="text-sm" style={{ color: 'var(--landing-muted)' }}>/mo</span>
              </div>
              <Link href="/pricing">
                <Button
                  size="sm"
                  className="w-full font-medium"
                  style={{ background: 'var(--landing-gold)', color: '#0A1628' }}
                >
                  {t('pricingPreview.cta')}
                </Button>
              </Link>
            </div>

            {/* Max */}
            <div
              className="p-6 rounded-xl text-center"
              style={{ background: 'var(--landing-card)', border: '1px solid var(--landing-border)' }}
            >
              <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--landing-text)' }}>{t('pricingPreview.maxName')}</h3>
              <div className="mb-3">
                <span className="text-3xl font-bold" style={{ color: 'var(--landing-text)' }}>$35</span>
                <span className="text-sm" style={{ color: 'var(--landing-muted)' }}>/mo</span>
              </div>
              <Link href="/pricing">
                <Button
                  size="sm"
                  className="w-full"
                  style={{ border: '1px solid var(--landing-border)', background: 'transparent', color: 'var(--landing-text)' }}
                >
                  {t('pricingPreview.cta')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ========== FAQ ========== */}
      <section className="py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ color: 'var(--landing-text)', letterSpacing: '-0.02em' }}
            >
              {t('faq.title')}
            </h2>
            <p style={{ color: 'var(--landing-muted)' }}>
              {t('faq.subtitle')}
            </p>
          </div>

          <div className="space-y-3">
            <FAQItem question={t('faq.q1')} answer={t('faq.a1')} />
            <FAQItem question={t('faq.q2')} answer={t('faq.a2')} />
            <FAQItem question={t('faq.q3')} answer={t('faq.a3')} />
            <FAQItem question={t('faq.q4')} answer={t('faq.a4')} />
            <FAQItem question={t('faq.q5')} answer={t('faq.a5')} />
            <FAQItem question={t('faq.q6')} answer={t('faq.a6')} />
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ========== Final CTA ========== */}
      <section className="relative py-24 sm:py-32 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-15"
            style={{ background: 'var(--landing-gold)' }}
          />
          <div
            className="absolute top-[40%] left-[30%] w-[400px] h-[300px] rounded-full blur-[140px] opacity-10"
            style={{ background: 'var(--landing-accent)' }}
          />
        </div>
        <div className="relative max-w-3xl mx-auto text-center">
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-bold mb-5"
            style={{ color: 'var(--landing-text)', letterSpacing: '-0.02em' }}
          >
            {t('cta.title')}
          </h2>
          <p className="mb-8 text-lg" style={{ color: 'var(--landing-muted)' }}>
            {t('cta.subtitle')}
          </p>
          <Link href="/register">
            <Button
              size="lg"
              className="text-base px-10 h-13 font-medium transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, var(--landing-gold), #D4880F)',
                color: '#0A1628',
                boxShadow: '0 4px 24px rgba(245, 166, 35, 0.35)',
              }}
            >
              {t('cta.button')}
            </Button>
          </Link>
        </div>
      </section>

      {/* ========== Footer ========== */}
      <footer style={{ borderTop: '1px solid var(--landing-border)' }} className="py-10 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ background: 'rgba(59, 130, 246, 0.15)' }}
                >
                  <span className="font-bold text-[10px]" style={{ color: 'var(--landing-accent-light)' }}>OC</span>
                </div>
                <span className="font-semibold text-sm" style={{ color: 'var(--landing-text)' }}>OrgOfClaws</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--landing-muted)' }}>
                {t('footer.tagline')}
              </p>
            </div>
            <div className="flex gap-6 text-sm" style={{ color: 'var(--landing-muted)' }}>
              <Link href="/pricing" className="hover:opacity-100 transition-opacity">{t('footer.pricing')}</Link>
              <Link href="/login" className="hover:opacity-100 transition-opacity">{t('footer.signIn')}</Link>
              <Link href="/register" className="hover:opacity-100 transition-opacity">{t('footer.register')}</Link>
            </div>
          </div>
          <div className="mt-8 pt-6 text-xs" style={{ borderTop: '1px solid var(--landing-border)', color: 'var(--landing-muted)' }}>
            &copy; {new Date().getFullYear()} {t('footer.copyright')}
          </div>
        </div>
      </footer>
    </div>
  )
}
