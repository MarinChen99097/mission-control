import { NextResponse } from 'next/server'
import { createUser } from '@/lib/auth'
import { getDatabase, logAuditEvent } from '@/lib/db'
import { createRateLimiter, extractClientIp } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { isMarketingBackendEnabled, mbRegister, mbGetMe } from '@/lib/marketing-backend'
import { getMcSessionCookieName, getMcSessionCookieOptions, isRequestSecure } from '@/lib/session-cookie'

// Stricter rate limit for registration: 5 per IP per hour
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  message: 'Too many registration attempts. Please try again later.',
  critical: true,
})

// Validation helpers
const USERNAME_REGEX = /^[a-z0-9._-]{3,28}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    // Rate limit by IP
    const rateCheck = registerLimiter(request)
    if (rateCheck) return rateCheck

    const body = await request.json()
    const { email, password, displayName, username: rawUsername } = body

    const ipAddress = extractClientIp(request)
    const userAgent = request.headers.get('user-agent') || undefined

    // ─── Marketing Backend registration (OrgOfClaws mode) ───
    if (isMarketingBackendEnabled()) {
      // Validate for MB: email + password(8+) + full_name
      const errors: string[] = []
      if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
        errors.push('Valid email is required')
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        errors.push('Password must be at least 8 characters')
      }
      if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
        errors.push('Display name is required')
      }
      if (errors.length > 0) {
        return NextResponse.json({ error: errors[0], details: errors }, { status: 400 })
      }

      try {
        const mbResult = await mbRegister({
          email: email.trim().toLowerCase(),
          password,
          full_name: displayName.trim(),
          terms_accepted: true,
        })

        // Handle email verification requirement
        if (mbResult.email_verification_required) {
          return NextResponse.json({
            ok: true,
            message: 'Account created. Please check your email to verify your account.',
            email_verification_required: true,
          }, { status: 201 })
        }

        if (!mbResult.access_token) {
          return NextResponse.json({
            ok: true,
            message: 'Account created. Please sign in.',
          }, { status: 201 })
        }

        // Get user profile
        let userProfile: { id?: string; email?: string; full_name?: string; avatar_url?: string } = { email }
        try {
          const profile = await mbGetMe(mbResult.access_token)
          userProfile = { id: profile.id, email: profile.email, full_name: profile.full_name, avatar_url: profile.avatar_url }
        } catch { /* non-fatal */ }

        const isSecureRequest = isRequestSecure(request)
        const cookieName = getMcSessionCookieName(isSecureRequest)

        const response = NextResponse.json({
          ok: true,
          user: {
            id: userProfile.id || 'mb-user',
            username: userProfile.email || email,
            display_name: userProfile.full_name || displayName,
            role: 'admin',
            provider: 'marketing_backend',
            email: userProfile.email || email,
            avatar_url: userProfile.avatar_url || null,
            workspace_id: 1,
            tenant_id: 1,
          },
        }, { status: 201 })

        // Set JWT cookie
        response.cookies.set(cookieName, mbResult.access_token, {
          ...getMcSessionCookieOptions({ maxAgeSeconds: 43200, isSecureRequest }),
        })

        if (mbResult.refresh_token) {
          response.cookies.set('mc_refresh_token', mbResult.refresh_token, {
            httpOnly: true,
            secure: isSecureRequest,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 3600,
          })
        }

        logger.info({ email: email.toLowerCase() }, 'User registered via Marketing Backend')
        return response
      } catch (error: any) {
        const message = error?.message || 'Registration failed'

        // Map common MB errors to user-friendly responses (do NOT fallthrough)
        if (message.includes('NOT_WHITELISTED')) {
          return NextResponse.json({
            error: 'This email is not authorized for access during beta period.',
            code: 'NOT_WHITELISTED',
          }, { status: 403 })
        }
        if (message.includes('already') || message.includes('exists')) {
          return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
        }
        if (message.includes('TERMS_NOT_ACCEPTED')) {
          return NextResponse.json({ error: 'Terms of service must be accepted' }, { status: 400 })
        }
        if (message.includes('PASSWORD')) {
          return NextResponse.json({ error: message }, { status: 400 })
        }

        // Unknown MB error — return it, do NOT fallthrough to SQLite
        // (Cloud Run has no SQLite setup, fallthrough would 500)
        logger.warn({ err: message }, 'Marketing Backend registration failed')
        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    // ─── Local auth (self-hosted mode, fallback) ───
    const username = rawUsername
      || email?.split('@')[0]?.toLowerCase()?.replace(/[^a-z0-9._-]/g, '-')?.slice(0, 28)?.padEnd(3, '0')
      || ''

    const errors: string[] = []
    if (!username || !USERNAME_REGEX.test(username)) {
      errors.push('Valid email is required')
    }
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
      errors.push('Valid email is required')
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      errors.push('Password must be at least 8 characters')
    }
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      errors.push('Display name is required')
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], details: errors }, { status: 400 })
    }

    const db = getDatabase()

    const existingEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email.toLowerCase())
    if (existingEmail) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const user = createUser(
      username,
      password,
      displayName.trim(),
      'viewer',
      {
        provider: 'local',
        email: email.toLowerCase(),
        is_approved: 0,
      }
    )

    logAuditEvent({
      action: 'self_registration',
      actor: user.username,
      actor_id: user.id,
      ip_address: ipAddress,
      user_agent: userAgent,
      detail: { email: email.toLowerCase() },
    })

    logger.info({ username: user.username, email: email.toLowerCase() }, 'New user self-registration (pending approval)')

    return NextResponse.json({
      ok: true,
      message: 'Account created. An admin will review your request.',
    }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.message?.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'Username or email is already taken' }, { status: 409 })
    }
    logger.error({ err: error }, 'Registration error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
