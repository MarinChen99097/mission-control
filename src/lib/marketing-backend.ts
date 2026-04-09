/**
 * Marketing Backend API client for OrgOfClaws.
 *
 * Proxies auth calls from Mission Control to the shared Landing AI
 * Marketing Backend V2, enabling unified login/register with JWT.
 *
 * When MARKETING_BACKEND_URL is not set, falls back to MC's local auth.
 */

import { randomBytes } from 'crypto'
import { getDatabase } from './db'
import { createSession, createUser } from './auth'

const MARKETING_BACKEND_URL = process.env.MARKETING_BACKEND_URL || process.env.NEXT_PUBLIC_MARKETING_BACKEND_URL || ''

export function isMarketingBackendEnabled(): boolean {
  return MARKETING_BACKEND_URL.length > 0
}

export function getMarketingBackendUrl(): string {
  return MARKETING_BACKEND_URL.replace(/\/$/, '')
}

interface MBLoginResult {
  access_token: string
  refresh_token?: string
  token_type: string
  is_existing_user?: boolean
}

interface MBUserProfile {
  id: string
  email: string
  full_name: string
  credits: number
  tier: string
  avatar_url?: string
  subscription_status?: string
}

/**
 * Login via Marketing Backend /auth/token (form-encoded, OAuth2 spec).
 */
export async function mbLogin(email: string, password: string): Promise<MBLoginResult> {
  const url = `${getMarketingBackendUrl()}/auth/token`
  const body = new URLSearchParams({ username: email, password })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const detail = data.detail || data.message || data.error || 'Login failed'
    throw new Error(detail)
  }

  return res.json()
}

/**
 * Register via Marketing Backend /auth/register.
 */
export async function mbRegister(data: {
  email: string
  password: string
  full_name: string
  terms_accepted: boolean
  verify_base_url?: string
}): Promise<MBLoginResult & { email_verification_required?: boolean }> {
  const url = `${getMarketingBackendUrl()}/auth/register`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    // MB returns detail as string or {code, message} object
    const detail = errData.detail
    const msg = typeof detail === 'object' && detail !== null
      ? (detail.code ? `${detail.code}: ${detail.message}` : JSON.stringify(detail))
      : (detail || errData.message || 'Registration failed')
    throw new Error(msg)
  }

  return res.json()
}

/**
 * Google OAuth via Marketing Backend /auth/google.
 */
export async function mbGoogleAuth(credential: string): Promise<MBLoginResult> {
  const url = `${getMarketingBackendUrl()}/auth/google`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.message || 'Google sign-in failed')
  }

  return res.json()
}

/**
 * Get user profile from Marketing Backend /auth/me.
 */
export async function mbGetMe(token: string): Promise<MBUserProfile> {
  const url = `${getMarketingBackendUrl()}/auth/me`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error('Not authenticated')
  }

  return res.json()
}

/**
 * Refresh token via Marketing Backend /auth/refresh.
 */
export async function mbRefreshToken(refreshToken: string): Promise<MBLoginResult> {
  const url = `${getMarketingBackendUrl()}/auth/refresh`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!res.ok) {
    throw new Error('Token refresh failed')
  }

  return res.json()
}

/**
 * Upsert a local SQLite user from Marketing Backend profile and create a session.
 *
 * After MB auth succeeds, MC needs a local user record so that getUserFromRequest()
 * works for all subsequent API calls. This bridges MB auth → MC local session.
 */
export function upsertMarketingUser(profile: {
  email: string
  full_name?: string
  avatar_url?: string | null
  id?: string
}, options?: {
  provider?: 'local' | 'google'
  ipAddress?: string
  userAgent?: string
}): { userId: number; sessionToken: string; expiresAt: number } {
  const db = getDatabase()
  const email = profile.email.toLowerCase().trim()
  const displayName = profile.full_name || email.split('@')[0] || 'User'
  const username = email.replace(/[^a-z0-9._-]/g, '-').slice(0, 28).padEnd(3, '0')
  const provider = options?.provider || 'local'

  // Check if user already exists by email
  const existing = db.prepare(`
    SELECT id, username FROM users WHERE lower(email) = ?
  `).get(email) as { id: number; username: string } | undefined

  let userId: number

  if (existing) {
    // Update profile fields
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      UPDATE users SET display_name = ?, avatar_url = COALESCE(?, avatar_url), provider = ?, updated_at = ?
      WHERE id = ?
    `).run(displayName, profile.avatar_url || null, provider, now, existing.id)
    userId = existing.id
  } else {
    // Create new user with random password (MB users don't use local password)
    const randomPassword = randomBytes(32).toString('hex')
    const user = createUser(username, randomPassword, displayName, 'admin', {
      provider,
      email,
      avatar_url: profile.avatar_url || null,
      is_approved: 1,
    })
    userId = user.id
  }

  // Create a local session
  const { token, expiresAt } = createSession(userId, options?.ipAddress, options?.userAgent)

  return { userId, sessionToken: token, expiresAt }
}
