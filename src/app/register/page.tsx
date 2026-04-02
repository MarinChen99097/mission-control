'use client'

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import Link from 'next/link'
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

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const [pendingApproval, setPendingApproval] = useState(false)
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    // Client-side validation
    if (!username.trim()) { setError(t('usernameRequired')); return }
    if (!/^[a-z0-9._-]{3,28}$/.test(username.trim())) { setError(t('usernameInvalid')); return }
    if (!email.trim()) { setError(t('emailRequired')); return }
    if (!displayName.trim()) { setError(t('displayNameRequired')); return }
    if (password.length < 12) { setError(t('passwordTooShort')); return }
    if (password !== confirmPassword) { setError(t('passwordsDoNotMatch')); return }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
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
      <div className="h-full overflow-y-auto flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">{t('successTitle')}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {t('successDescription')}
          </p>
          <Link href="/login">
            <Button className="w-full">{t('goToSignIn')}</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">OC</span>
            </div>
          </Link>
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        {pendingApproval && (
          <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
            <div className="flex justify-center mb-2">
              <svg className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <div className="text-sm font-medium text-amber-200">{t('successTitle')}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('successDescription')}
            </p>
            <Link href="/login">
              <Button variant="ghost" size="sm" className="mt-3 text-xs">{t('goToSignIn')}</Button>
            </Link>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Google OAuth */}
        {GOOGLE_CLIENT_ID && (
          <>
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={!googleReady || googleLoading || loading}
              className="w-full h-11 flex items-center justify-center gap-3 rounded-lg border border-border bg-white text-[#3c4043] text-sm font-medium hover:bg-gray-50 transition-colors mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {googleLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  {t('signUpWithGoogle')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {t('signUpWithGoogle')}
                </>
              )}
            </button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">{t('orSignUpWithEmail')}</span></div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm text-muted-foreground mb-1.5">{t('usernameLabel')}</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder={t('usernamePlaceholder')}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
              autoComplete="username"
              pattern="[a-z0-9._-]{3,28}"
              aria-describedby="username-hint"
            />
            <p id="username-hint" className="text-xs text-muted-foreground mt-1">{t('usernameHint')}</p>
          </div>

          <div>
            <label htmlFor="displayName" className="block text-sm text-muted-foreground mb-1.5">{t('displayNameLabel')}</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('displayNamePlaceholder')}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm text-muted-foreground mb-1.5">{t('emailLabel')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-muted-foreground mb-1.5">{t('passwordLabel')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm text-muted-foreground mb-1.5">{t('confirmPasswordLabel')}</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('confirmPasswordPlaceholder')}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
              minLength={12}
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('creatingAccount') : t('createAccount')}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t('alreadyHaveAccount')}{' '}
          <Link href="/login" className="text-primary hover:underline">{t('signIn')}</Link>
        </p>

        <div className="flex justify-center mt-4">
          <LanguageSwitcherSelect />
        </div>
      </div>
    </div>
  )
}
