'use client'

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { LanguageSwitcherSelect } from '@/components/ui/language-switcher'

interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleAccountsIdApi {
  initialize(config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
  }): void
  prompt(): void
}

interface GoogleApi {
  accounts: {
    id: GoogleAccountsIdApi
  }
}

declare global {
  interface Window {
    google?: GoogleApi
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

export default function RegisterPage() {
  const t = useTranslations('register')
  const tc = useTranslations('common')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const [pendingApproval, setPendingApproval] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const googleCallbackRef = useRef<((response: GoogleCredentialResponse) => void) | null>(null)

  const completeGoogleRegister = useCallback(async (credential: string) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      if (data.code === 'PENDING_APPROVAL') {
        setPendingApproval(true)
        setError('')
        setGoogleLoading(false)
        return
      }
      setError(data.error || t('registrationFailed'))
      setGoogleLoading(false)
      return
    }

    // Google user already existed and is approved — redirect to dashboard
    window.location.href = '/'
  }, [t])

  // Initialize Google Sign-In SDK
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    const onScriptLoad = () => {
      if (!window.google) return
      googleCallbackRef.current = async (response: GoogleCredentialResponse) => {
        setError('')
        setGoogleLoading(true)
        try {
          await completeGoogleRegister(response?.credential || '')
        } catch {
          setError(t('registrationFailed'))
          setGoogleLoading(false)
        }
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: GoogleCredentialResponse) => googleCallbackRef.current?.(response),
      })
      setGoogleReady(true)
    }

    const existing = document.querySelector('script[data-google-gsi="1"]') as HTMLScriptElement | null
    if (existing) {
      if (window.google) onScriptLoad()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.setAttribute('data-google-gsi', '1')
    script.onload = onScriptLoad
    document.head.appendChild(script)
  }, [completeGoogleRegister, t])

  const handleGoogleSignUp = () => {
    if (!window.google || !googleReady) return
    window.google.accounts.id.prompt()
  }

  // Derive username from email prefix
  function deriveUsername(emailValue: string): string {
    const prefix = emailValue.split('@')[0] || ''
    // Sanitize: lowercase, replace invalid chars with hyphens, truncate to 28
    return prefix
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28)
      .padEnd(3, '0') // Ensure minimum 3 characters
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    // Client-side validation (reduced fields)
    if (!displayName.trim()) { setError(t('displayNameRequired')); return }
    if (!email.trim()) { setError(t('emailRequired')); return }
    if (password.length < 12) { setError(t('passwordTooShort')); return }

    const username = deriveUsername(email)
    if (!/^[a-z0-9._-]{3,28}$/.test(username)) {
      setError(t('emailInvalidForUsername'))
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email: email.trim(),
          password,
          displayName: displayName.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || t('registrationFailed'))
        setLoading(false)
        return
      }

      setSuccess(true)
    } catch {
      setError(t('networkError'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div
        className="h-full overflow-y-auto flex items-center justify-center p-4 relative"
        style={{ backgroundColor: '#0A0A0F' }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-[140px] opacity-20"
            style={{ background: 'radial-gradient(ellipse, #10B981, transparent 70%)' }}
          />
        </div>
        <div
          className="w-full max-w-[400px] rounded-2xl p-8 text-center relative z-10"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#F8FAFC] mb-2">{t('successTitle')}</h2>
          <p className="text-sm text-[#94A3B8] mb-6">
            {t('successDescription')}
          </p>
          <Link href="/login">
            <Button
              className="w-full h-10 rounded-lg"
              style={{ backgroundColor: '#6366F1', color: '#FFFFFF' }}
            >
              {t('goToSignIn')}
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-auto flex items-center justify-center p-4 relative"
      style={{ backgroundColor: '#0A0A0F' }}
    >
      {/* Background glow orb */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-[140px] opacity-20"
          style={{ background: 'radial-gradient(ellipse, #6366F1, transparent 70%)' }}
        />
      </div>

      {/* Language switcher */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcherSelect />
      </div>

      {/* Glass card */}
      <div
        className="w-full max-w-[400px] rounded-2xl p-8 relative z-10"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(99, 102, 241, 0.1)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 0 80px rgba(99, 102, 241, 0.06), 0 25px 50px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Hero section */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#0A0A0F] border border-[rgba(30,41,59,0.5)] flex items-center justify-center mb-4">
            <Image
              src="/brand/mc-logo-128.png"
              alt="Mission Control logo"
              width={56}
              height={56}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold text-[#F8FAFC]">{t('heroTitle')}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">{t('heroSubtitle')}</p>
        </div>

        {/* Pending approval banner */}
        {pendingApproval && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
            <div className="flex justify-center mb-2">
              <svg className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <div className="text-sm font-medium text-amber-200">{t('successTitle')}</div>
            <p className="text-xs text-[#94A3B8] mt-1">
              {t('successDescription')}
            </p>
            <Link href="/login">
              <Button variant="ghost" size="sm" className="mt-3 text-xs text-[#94A3B8] hover:text-[#F8FAFC]">{t('goToSignIn')}</Button>
            </Link>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div role="alert" className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Google OAuth — PRIMARY CTA */}
        {GOOGLE_CLIENT_ID && (
          <div className={pendingApproval ? 'opacity-50 pointer-events-none' : ''}>
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={!googleReady || googleLoading || loading}
              className="w-full h-12 flex items-center justify-center gap-3 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.98]"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#3c4043',
                borderColor: '#dadce0',
              }}
            >
              {googleLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  <span>{t('signingUp')}</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>{t('continueWithGoogle')}</span>
                </>
              )}
            </button>
            {!googleReady && (
              <p className="text-center text-xs text-[#94A3B8] mt-2">{t('loadingGoogle')}</p>
            )}
          </div>
        )}

        {/* Divider — toggles email form */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }} />
          <button
            type="button"
            onClick={() => setShowEmailForm(!showEmailForm)}
            className="text-xs text-[#94A3B8] hover:text-[#818CF8] transition-colors whitespace-nowrap"
          >
            {showEmailForm ? tc('or') : t('orCreateWithEmail')}
          </button>
          <div className="h-px flex-1" style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }} />
        </div>

        {/* Email form — HIDDEN by default */}
        {showEmailForm && (
          <form onSubmit={handleSubmit} className={`space-y-4 ${pendingApproval ? 'opacity-50 pointer-events-none' : ''}`}>
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-[#94A3B8] mb-1.5">{t('displayNameLabel')}</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('displayNamePlaceholder')}
                className="w-full h-10 px-3 rounded-lg text-sm placeholder:text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 transition-colors"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(30, 41, 59, 0.5)',
                  color: '#F8FAFC',
                }}
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#94A3B8] mb-1.5">{t('emailLabel')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className="w-full h-10 px-3 rounded-lg text-sm placeholder:text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 transition-colors"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(30, 41, 59, 0.5)',
                  color: '#F8FAFC',
                }}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#94A3B8] mb-1.5">{t('passwordLabel')}</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  className="w-full h-10 px-3 pr-10 rounded-lg text-sm placeholder:text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 transition-colors"
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(30, 41, 59, 0.5)',
                    color: '#F8FAFC',
                  }}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg"
              style={{
                backgroundColor: '#6366F1',
                color: '#FFFFFF',
              }}
            >
              {loading ? t('creatingAccount') : t('createAccount')}
            </Button>
          </form>
        )}

        {/* Footer links */}
        <p className="text-center text-sm text-[#94A3B8] mt-6">
          {t('alreadyHaveAccount')}{' '}
          <Link href="/login" className="text-[#818CF8] hover:text-[#6366F1] hover:underline transition-colors">{t('signIn')}</Link>
        </p>

        {/* Trust line */}
        <p className="text-center text-xs text-[#475569] mt-3">{t('trustLine')}</p>
      </div>
    </div>
  )
}
