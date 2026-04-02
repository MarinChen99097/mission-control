import { NextResponse } from 'next/server'
import { createUser } from '@/lib/auth'
import { getDatabase, logAuditEvent } from '@/lib/db'
import { createRateLimiter, extractClientIp } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

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
const MIN_PASSWORD_LENGTH = 12

export async function POST(request: Request) {
  try {
    // Rate limit by IP
    const rateCheck = registerLimiter(request)
    if (rateCheck) return rateCheck

    const body = await request.json()
    const { username, email, password, displayName } = body

    // --- Input validation ---
    const errors: string[] = []

    if (!username || typeof username !== 'string') {
      errors.push('Username is required')
    } else if (!USERNAME_REGEX.test(username)) {
      errors.push('Username must be 3-28 characters: lowercase letters, numbers, dots, hyphens, underscores only')
    }

    if (!email || typeof email !== 'string') {
      errors.push('Email is required')
    } else if (!EMAIL_REGEX.test(email)) {
      errors.push('Invalid email format')
    }

    if (!password || typeof password !== 'string') {
      errors.push('Password is required')
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    }

    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      errors.push('Display name is required')
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], details: errors }, { status: 400 })
    }

    const db = getDatabase()
    const ipAddress = extractClientIp(request)
    const userAgent = request.headers.get('user-agent') || undefined

    // Check if username already exists
    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase())
    if (existingUsername) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 409 })
    }

    // Check if email already exists
    const existingEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email.toLowerCase())
    if (existingEmail) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    // Create user with role='viewer' and is_approved=0 (pending admin approval)
    const user = createUser(
      username.toLowerCase(),
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
    // Handle unique constraint violations from SQLite
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.message?.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'Username or email is already taken' }, { status: 409 })
    }
    logger.error({ err: error }, 'Registration error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
