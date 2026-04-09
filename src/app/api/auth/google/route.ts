import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { getDatabase, logAuditEvent } from '@/lib/db'
import { verifyGoogleIdToken } from '@/lib/google-auth'
import { getMcSessionCookieName, getMcSessionCookieOptions, isRequestSecure } from '@/lib/session-cookie'
import { loginLimiter } from '@/lib/rate-limit'
import { isMarketingBackendEnabled, mbGoogleAuth, mbGetMe, upsertMarketingUser } from '@/lib/marketing-backend'
import { logger } from '@/lib/logger'

function upsertAccessRequest(input: {
  email: string
  providerUserId: string
  displayName: string
  avatarUrl?: string
}) {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO access_requests (provider, email, provider_user_id, display_name, avatar_url, status, attempt_count, requested_at, last_attempt_at)
    VALUES ('google', ?, ?, ?, ?, 'pending', 1, (unixepoch()), (unixepoch()))
    ON CONFLICT(email, provider) DO UPDATE SET
      provider_user_id = excluded.provider_user_id,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      status = 'pending',
      attempt_count = access_requests.attempt_count + 1,
      last_attempt_at = (unixepoch())
  `).run(input.email.toLowerCase(), input.providerUserId, input.displayName, input.avatarUrl || null)
}

export async function POST(request: NextRequest) {
  const rateCheck = loginLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const body = await request.json().catch(() => ({}))
    const credential = String(body?.credential || '')

    const isSecureRequest = isRequestSecure(request)
    const cookieName = getMcSessionCookieName(isSecureRequest)

    // ─── Marketing Backend auth (OrgOfClaws mode) ───
    if (isMarketingBackendEnabled()) {
      try {
        const mbResult = await mbGoogleAuth(credential)

        if (!mbResult.access_token) {
          return NextResponse.json({ error: 'Google sign-in failed' }, { status: 401 })
        }

        // Get user profile
        let userProfile: any = {}
        try {
          userProfile = await mbGetMe(mbResult.access_token)
        } catch { /* non-fatal */ }

        const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        const userAgent = request.headers.get('user-agent') || undefined

        // Upsert local SQLite user + create local session so getUserFromRequest() works
        const { userId, sessionToken, expiresAt } = upsertMarketingUser(
          { email: userProfile.email || 'google-user', full_name: userProfile.full_name || 'Google User', avatar_url: userProfile.avatar_url },
          { provider: 'google', ipAddress, userAgent }
        )

        const response = NextResponse.json({
          user: {
            id: userId,
            username: userProfile.email || 'google-user',
            display_name: userProfile.full_name || 'Google User',
            role: 'admin',
            provider: 'google',
            email: userProfile.email || null,
            avatar_url: userProfile.avatar_url || null,
            workspace_id: 1,
            tenant_id: 1,
          },
        })

        // Store local session token as cookie (not MB JWT)
        response.cookies.set(cookieName, sessionToken, {
          ...getMcSessionCookieOptions({ maxAgeSeconds: expiresAt - Math.floor(Date.now() / 1000), isSecureRequest }),
        })

        // Store MB JWT in separate cookie for downstream service calls
        response.cookies.set('oc_token', mbResult.access_token, {
          httpOnly: true,
          secure: isSecureRequest,
          sameSite: 'lax',
          path: '/',
          maxAge: 43200,
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

        return response
      } catch (error: any) {
        logger.warn({ err: error?.message }, 'Marketing Backend Google auth failed, trying local fallback')
        // Fall through to local auth
      }
    }

    // ─── Local auth (self-hosted mode, fallback) ───
    const profile = await verifyGoogleIdToken(credential)

    const db = getDatabase()
    const email = String(profile.email || '').toLowerCase().trim()
    const sub = String(profile.sub || '').trim()
    const displayName = String(profile.name || email.split('@')[0] || 'Google User').trim()
    const avatar = profile.picture ? String(profile.picture) : null

    const row = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.role, u.provider, u.email, u.avatar_url, u.is_approved,
             u.created_at, u.updated_at, u.last_login_at, u.workspace_id, COALESCE(w.tenant_id, 1) as tenant_id
      FROM users u
      LEFT JOIN workspaces w ON w.id = u.workspace_id
      WHERE (provider = 'google' AND provider_user_id = ?) OR lower(email) = ?
      ORDER BY id ASC
      LIMIT 1
    `).get(sub, email) as any

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || undefined

    if (!row || Number(row.is_approved ?? 1) !== 1) {
      upsertAccessRequest({
        email,
        providerUserId: sub,
        displayName,
        avatarUrl: avatar || undefined,
      })

      logAuditEvent({
        action: 'google_login_pending_approval',
        actor: email,
        detail: { email, sub },
        ip_address: ipAddress,
        user_agent: userAgent,
      })

      return NextResponse.json(
        { error: 'Access request pending admin approval', code: 'PENDING_APPROVAL' },
        { status: 403 }
      )
    }

    db.prepare(`
      UPDATE users
      SET provider = 'google', provider_user_id = ?, email = ?, avatar_url = COALESCE(?, avatar_url), updated_at = (unixepoch())
      WHERE id = ?
    `).run(sub, email, avatar, row.id)

    const { token, expiresAt } = createSession(row.id, ipAddress, userAgent, row.workspace_id ?? 1)

    logAuditEvent({ action: 'login_google', actor: row.username, actor_id: row.id, ip_address: ipAddress, user_agent: userAgent })

    const response = NextResponse.json({
      user: {
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        role: row.role,
        provider: 'google',
        email,
        avatar_url: avatar,
        workspace_id: row.workspace_id ?? 1,
        tenant_id: row.tenant_id ?? 1,
      },
    })

    response.cookies.set(cookieName, token, {
      ...getMcSessionCookieOptions({ maxAgeSeconds: expiresAt - Math.floor(Date.now() / 1000), isSecureRequest }),
    })

    return response
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Google login failed' }, { status: 400 })
  }
}
