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
