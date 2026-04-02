'use client'

import { useCallback, useEffect, useRef, useState, FormEvent } from 'react'
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

type LoginRequestBody =
  | { username: string; password: string }
  | { credential?: string }

type LoginErrorPayload = {
  code?: string
  error?: string
  hint?: string
}

function readLoginErrorPayload(value: unknown): LoginErrorPayload {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    error: typeof record.error === 'string' ? record.error : undefined,
    hint: typeof record.hint === 'string' ? record.hint : undefined,
  }
}

declare global {
  interface Window {
    google?: GoogleApi
  }
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function LoginPage() {
  const t = useTranslations('auth')
  const tc = useTranslations('common')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pendingApproval, setPendingApproval] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const googleCallbackRef = useRef<((response: GoogleCredentialResponse) => void) | null>(null)

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

  // Check if first-time setup is needed on page load — auto-redirect to /setup
  useEffect(() => {
    fetch('/api/setup')
      .then((res) => res.json())
      .then((data) => {
        if (data.needsSetup) {
          window.location.href = '/setup'
        }
      })
      .catch(() => {
        // Ignore — setup check is best-effort
      })
  }, [])

  const completeLogin = useCallback(async (path: string, body: LoginRequestBody) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = readLoginErrorPayload(await res.json().catch(() => null))
      if (data.code === 'PENDING_APPROVAL') {
        setPendingApproval(true)
        setNeedsSetup(false)
        setError('')
        setLoading(false)
        setGoogleLoading(false)
        return false
      }
      if (data.code === 'NO_USERS') {
        setNeedsSetup(true)
        setError('')
        setLoading(false)
        setGoogleLoading(false)
        return false
      }
      setError(data.error || t('loginFailed'))
      setPendingApproval(false)
      setNeedsSetup(false)
      setLoading(false)
      setGoogleLoading(false)
      return false
    }

    // Full reload ensures the session cookie is sent on all subsequent requests.
    // router.push() + refresh() can race and use stale RSC payloads.
    window.location.href = '/'
    return true
  }, [t])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Read DOM values directly to handle browser autofill (which doesn't fire onChange)
    const form = e.target as HTMLFormElement
    const formUsername = (form.elements.namedItem('username') as HTMLInputElement)?.value || username
    const formPassword = (form.elements.namedItem('password') as HTMLInputElement)?.value || password

    try {
      await completeLogin('/api/auth/login', { username: formUsername, password: formPassword })
    } catch {
      setError(t('networkError'))
      setLoading(false)
    }
  }

  // Initialize Google Sign-In SDK (hidden prompt mode)
  useEffect(() => {
    if (!googleClientId) return

    const onScriptLoad = () => {
      if (!window.google) return
      googleCallbackRef.current = async (response: GoogleCredentialResponse) => {
        setError('')
        setGoogleLoading(true)
        try {
          const ok = await completeLogin('/api/auth/google', { credential: response?.credential })
          if (!ok) return
        } catch {
          setError(t('googleSignInFailed'))
          setGoogleLoading(false)
        }
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
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
    script.onerror = () => setError(t('googleSignInFailed'))
    document.head.appendChild(script)
  }, [googleClientId, completeLogin, t])

  const handleGoogleSignIn = () => {
    if (!window.google || !googleReady) return
    setGoogleLoading(true)
    let callbackFired = false

    // Wrap callback to detect if prompt actually triggers
    const originalCallback = googleCallbackRef.current
    googleCallbackRef.current = (response: GoogleCredentialResponse) => {
      callbackFired = true
      googleCallbackRef.current = originalCallback
      originalCallback?.(response)
    }

    window.google.accounts.id.prompt()

    // Fallback: if no callback fires within 3s, assume popup was blocked
    setTimeout(() => {
      if (!callbackFired) {
        googleCallbackRef.current = originalCallback
        setGoogleLoading(false)
        setError(t('googlePopupBlocked'))
      }
    }, 3000)
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
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <a href="/pricing" className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors">{t('pricing')}</a>
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
          <h1 className="text-2xl font-semibold text-[#F8FAFC]">{t('welcomeBack')}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">{t('signInToContinue')}</p>
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
            <div className="text-sm font-medium text-amber-200">{t('accessRequestSubmitted')}</div>
            <p className="text-xs text-[#94A3B8] mt-1">
              {t('accessRequestDescription')}
            </p>
            <Button
              onClick={() => { setPendingApproval(false); setError(''); setGoogleLoading(false) }}
              variant="ghost"
              size="sm"
              className="mt-3 text-xs text-[#94A3B8] hover:text-[#F8FAFC]"
            >
              {t('tryAgain')}
            </Button>
          </div>
        )}

        {/* Needs setup banner */}
        {needsSetup && (
          <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
            <div className="flex justify-center mb-2">
              <svg className="w-8 h-8 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="text-sm font-medium text-blue-200">{t('noAdminAccount')}</div>
            <p className="text-xs text-[#94A3B8] mt-1">
              {t('noAdminDescription')}
            </p>
            <Button
              onClick={() => { window.location.href = '/setup' }}
              size="sm"
              className="mt-3"
            >
              {t('createAdminAccount')}
            </Button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div role="alert" className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Google Sign-In — PRIMARY CTA */}
        {googleClientId && (
          <div className={pendingApproval ? 'opacity-50 pointer-events-none' : ''}>
            <button
              type="button"
              onClick={handleGoogleSignIn}
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
                  <span>{t('signingIn')}</span>
                </>
              ) : (
                <>
                  <GoogleIcon className="w-5 h-5" />
                  <span>{t('continueWithGoogle')}</span>
                </>
              )}
            </button>
            {!googleReady && (
              <p className="text-center text-xs text-[#94A3B8] mt-2">{t('loadingGoogleSignIn')}</p>
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
            {showEmailForm ? tc('or') : t('orSignInWithEmail')}
          </button>
          <div className="h-px flex-1" style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }} />
        </div>

        {/* Email/password form — HIDDEN by default */}
        {showEmailForm && (
          <form onSubmit={handleSubmit} className={`space-y-4 ${pendingApproval ? 'opacity-50 pointer-events-none' : ''}`}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[#94A3B8] mb-1.5">{t('username')}</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm placeholder:text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 transition-colors"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(30, 41, 59, 0.5)',
                  color: '#F8FAFC',
                }}
                placeholder={t('enterUsername')}
                autoComplete="username"
                autoFocus
                required
                aria-required="true"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#94A3B8] mb-1.5">{t('password')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm placeholder:text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 transition-colors"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(30, 41, 59, 0.5)',
                  color: '#F8FAFC',
                }}
                placeholder={t('enterPassword')}
                autoComplete="current-password"
                required
                aria-required="true"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              size="lg"
              className="w-full rounded-lg h-10"
              style={{
                backgroundColor: '#6366F1',
                color: '#FFFFFF',
              }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('signingIn')}
                </>
              ) : (
                t('signIn')
              )}
            </Button>
          </form>
        )}

        {/* Footer links */}
        <p className="text-center text-sm text-[#94A3B8] mt-6">
          {t('noAccount')}{' '}
          <a href="/register" className="text-[#818CF8] hover:text-[#6366F1] hover:underline transition-colors">{t('createOne')}</a>
        </p>
        <p className="text-center text-xs text-[#475569] mt-2">{t('orchestrationTagline')}</p>
      </div>
    </div>
  )
}
