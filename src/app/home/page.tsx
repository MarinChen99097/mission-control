'use client'

import Link from 'next/link'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { locales, localeNames, type Locale } from '@/i18n/config'

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

function GridPattern() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.06)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.06)_1px,transparent_1px)] bg-[size:60px_60px]" />
      {/* Central glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
      {/* Gradient overlay from top */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-transparent" />
      {/* Side accent glows */}
      <div className="absolute -top-32 -left-32 w-[400px] h-[400px] rounded-full bg-[hsl(var(--void-violet)/0.04)] blur-[100px]" />
      <div className="absolute -top-32 -right-32 w-[400px] h-[400px] rounded-full bg-[hsl(var(--void-mint)/0.04)] blur-[100px]" />
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group relative p-6 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/40 hover:bg-primary/[0.07] hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-0.5">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
        {icon}
      </div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
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

function MobileMenu({ onClose }: { onClose: () => void }) {
  const t = useTranslations('home.nav')
  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-16 left-0 right-0 z-50 border-b border-border bg-card/95 backdrop-blur-md shadow-xl p-4 flex flex-col gap-3">
        <button
          onClick={() => { smoothScrollTo('features'); onClose() }}
          className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-3 rounded-lg hover:bg-secondary"
        >
          {t('features')}
        </button>
        <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-3 rounded-lg hover:bg-secondary" onClick={onClose}>
          {t('pricing')}
        </Link>
        <button
          onClick={() => { smoothScrollTo('security'); onClose() }}
          className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-3 rounded-lg hover:bg-secondary"
        >
          {t('security')}
        </button>
        <div className="border-t border-border pt-3 flex gap-2">
          <Link href="/login" className="flex-1">
            <Button variant="ghost" size="sm" className="w-full">{t('signIn')}</Button>
          </Link>
          <Link href="/register" className="flex-1">
            <Button size="sm" className="w-full">{t('getStarted')}</Button>
          </Link>
        </div>
      </div>
    </>
  )
}

/* ---------- main page ---------- */

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden hover:border-primary/30 transition-colors duration-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-primary/[0.03] transition-colors duration-200"
        aria-expanded={open}
      >
        <span className="font-medium text-foreground text-sm sm:text-base pr-4">{question}</span>
        <svg
          className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`grid transition-all duration-200 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">{answer}</p>
        </div>
      </div>
    </div>
  )
}

function UseCaseCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group relative p-5 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/40 hover:bg-primary/[0.07] hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-0.5">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 text-primary group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
        {icon}
      </div>
      <h3 className="font-semibold text-foreground mb-1.5 text-sm">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  )
}

export default function HomePage() {
  const t = useTranslations('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleNavClick = useCallback((id: string) => {
    smoothScrollTo(id)
  }, [])

  return (
    <div className="min-h-screen overflow-auto bg-background text-foreground scroll-smooth">
      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">OC</span>
            </div>
            <span className="font-semibold text-foreground tracking-tight">OrgOfClaws</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <button onClick={() => handleNavClick('features')} className="hover:text-foreground transition-colors">
              {t('nav.features')}
            </button>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              {t('nav.pricing')}
            </Link>
            <button onClick={() => handleNavClick('security')} className="hover:text-foreground transition-colors">
              {t('nav.security')}
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NavLanguageSwitcher />

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">{t('nav.signIn')}</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">{t('nav.getStarted')}</Button>
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={t('nav.menu')}
              aria-expanded={mobileMenuOpen}
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

        {/* Mobile dropdown */}
        {mobileMenuOpen && <MobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </nav>

      {/* Hero */}
      <section className="relative pt-16 sm:pt-24 pb-16 sm:pb-20 px-4 sm:px-6">
        <GridPattern />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/50 bg-card/50 backdrop-blur-sm text-xs text-muted-foreground mb-6 sm:mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {t('hero.badge')}
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
            {t('hero.titleLine1')}
            <br />
            <span className="bg-gradient-to-r from-primary via-[hsl(var(--void-mint))] to-primary bg-clip-text text-transparent">
              {t('hero.titleLine2')}
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2">
            {t('hero.description')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href="/register">
              <Button size="lg" className="text-base px-8 h-12 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-200 w-full sm:w-auto">
                {t('hero.ctaStart')}
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg" className="text-base px-8 h-12 hover:bg-primary/5 hover:border-primary/40 transition-all duration-200 w-full sm:w-auto">
                {t('hero.ctaPrice')}
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            {t('hero.priceNote')}
          </p>
        </div>
      </section>

      {/* How it works - 3 steps */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10 sm:mb-12">
            {t('steps.title')}
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: '1', title: t('steps.step1Title'), desc: t('steps.step1Desc') },
              { step: '2', title: t('steps.step2Title'), desc: t('steps.step2Desc') },
              { step: '3', title: t('steps.step3Title'), desc: t('steps.step3Desc') },
            ].map((item) => (
              <div key={item.step} className="text-center group">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-xl flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  {item.step}
                </div>
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">{t('features.title')}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto px-2">
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            <FeatureCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>}
              title={t('features.alwaysOnline')}
              desc={t('features.alwaysOnlineDesc')}
            />
            <FeatureCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>}
              title={t('features.isolation')}
              desc={t('features.isolationDesc')}
            />
            <FeatureCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>}
              title={t('features.gdrive')}
              desc={t('features.gdriveDesc')}
            />
            <FeatureCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>}
              title={t('features.notion')}
              desc={t('features.notionDesc')}
            />
            <FeatureCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>}
              title={t('features.skills')}
              desc={t('features.skillsDesc')}
            />
            <FeatureCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>}
              title={t('features.backups')}
              desc={t('features.backupsDesc')}
            />
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border/40 scroll-mt-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">{t('security.title')}</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10 sm:mb-12 px-2">
            {t('security.subtitle')}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 text-left">
            {[
              { label: t('security.aes'), desc: t('security.aesDesc') },
              { label: t('security.tls'), desc: t('security.tlsDesc') },
              { label: t('security.isolated'), desc: t('security.isolatedDesc') },
              { label: t('security.soc'), desc: t('security.socDesc') },
            ].map((item) => (
              <div key={item.label} className="p-3 sm:p-4 rounded-lg border border-border/50 bg-card/50 hover:border-primary/30 hover:bg-primary/[0.04] transition-all duration-300">
                <div className="text-base sm:text-lg font-mono font-bold text-primary mb-1">{item.label}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-16 sm:py-20 px-4 sm:px-6 overflow-hidden">
        {/* Subtle background accent */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full bg-primary/[0.04] blur-[80px]" />
        </div>
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-muted-foreground mb-8 px-2">
            {t('cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href="/register">
              <Button size="lg" className="text-base px-8 h-12 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-200 w-full sm:w-auto">
                {t('cta.button')}
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg" className="text-base px-8 h-12 hover:bg-primary/5 hover:border-primary/40 transition-all duration-200 w-full sm:w-auto">
                {t('cta.compare')}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Before / After Comparison */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">{t('comparison.title')}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto px-2">{t('comparison.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {/* Without OrgOfClaws */}
            <div className="relative p-6 sm:p-8 rounded-2xl border-2 border-red-500/30 bg-red-500/[0.03]">
              <div className="absolute -top-3.5 left-6 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold tracking-wide uppercase">
                {t('comparison.without')}
              </div>
              <div className="mt-3 space-y-4">
                {(['setup', 'time', 'updates', 'data'] as const).map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{t(`comparison.without_${key}`)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* With OrgOfClaws */}
            <div className="relative p-6 sm:p-8 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/[0.03]">
              <div className="absolute -top-3.5 left-6 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide uppercase">
                {t('comparison.with')}
              </div>
              <div className="mt-3 space-y-4">
                {(['setup', 'time', 'updates', 'data'] as const).map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{t(`comparison.with_${key}`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">{t('useCases.title')}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto px-2">{t('useCases.subtitle')}</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            <UseCaseCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>}
              title={t('useCases.emailTitle')}
              desc={t('useCases.emailDesc')}
            />
            <UseCaseCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
              title={t('useCases.researchTitle')}
              desc={t('useCases.researchDesc')}
            />
            <UseCaseCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              title={t('useCases.taskTitle')}
              desc={t('useCases.taskDesc')}
            />
            <UseCaseCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>}
              title={t('useCases.codeTitle')}
              desc={t('useCases.codeDesc')}
            />
            <UseCaseCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
              title={t('useCases.dataTitle')}
              desc={t('useCases.dataDesc')}
            />
            <UseCaseCard
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>}
              title={t('useCases.messagingTitle')}
              desc={t('useCases.messagingDesc')}
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border/40">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">{t('faq.title')}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto px-2">{t('faq.subtitle')}</p>
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

      {/* Trust Badges */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">{t('trust.title')}</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {/* Google Cloud */}
            <div className="flex flex-col items-center text-center p-5 rounded-xl border border-border/50 bg-card/50 hover:border-primary/30 hover:bg-primary/[0.04] transition-all duration-300">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 text-primary">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                </svg>
              </div>
              <p className="text-xs sm:text-sm font-medium text-foreground">{t('trust.gcp')}</p>
            </div>

            {/* OpenClaw */}
            <div className="flex flex-col items-center text-center p-5 rounded-xl border border-border/50 bg-card/50 hover:border-primary/30 hover:bg-primary/[0.04] transition-all duration-300">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 text-primary">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </div>
              <p className="text-xs sm:text-sm font-medium text-foreground">{t('trust.openclaw')}</p>
            </div>

            {/* Encryption */}
            <div className="flex flex-col items-center text-center p-5 rounded-xl border border-border/50 bg-card/50 hover:border-primary/30 hover:bg-primary/[0.04] transition-all duration-300">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 text-primary">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <p className="text-xs sm:text-sm font-medium text-foreground">{t('trust.encryption')}</p>
            </div>

            {/* Monitoring */}
            <div className="flex flex-col items-center text-center p-5 rounded-xl border border-border/50 bg-card/50 hover:border-primary/30 hover:bg-primary/[0.04] transition-all duration-300">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 text-primary">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                </svg>
              </div>
              <p className="text-xs sm:text-sm font-medium text-foreground">{t('trust.monitoring')}</p>
            </div>
          </div>
        </div>
      </section>

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
                {t('footer.tagline')}
              </p>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/pricing" className="hover:text-foreground transition-colors">{t('footer.pricing')}</Link>
              <Link href="/login" className="hover:text-foreground transition-colors">{t('footer.signIn')}</Link>
              <Link href="/register" className="hover:text-foreground transition-colors">{t('footer.register')}</Link>
            </div>
          </div>
          <div className="mt-6 sm:mt-8 pt-6 border-t border-border/40 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {t('footer.copyright')}
          </div>
        </div>
      </footer>
    </div>
  )
}
