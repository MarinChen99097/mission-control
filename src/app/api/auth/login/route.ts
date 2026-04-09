import { NextResponse } from 'next/server'
import { authenticateUser, createSession } from '@/lib/auth'
import { logAuditEvent, needsFirstTimeSetup } from '@/lib/db'
import { getMcSessionCookieName, getMcSessionCookieOptions, isRequestSecure } from '@/lib/session-cookie'
import { loginLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { isMarketingBackendEnabled, mbLogin, mbGetMe, upsertMarketingUser } from '@/lib/marketing-backend'

export async function POST(request: Request) {
  try {
    const rateCheck = loginLimiter(request)
    if (rateCheck) return rateCheck

    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    const isSecureRequest = isRequestSecure(request)
    const cookieName = getMcSessionCookieName(isSecureRequest)
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || undefined

    // ─── Marketing Backend auth (OrgOfClaws mode) ───
    if (isMarketingBackendEnabled()) {
      try {
        const mbResult = await mbLogin(username, password)

        if (!mbResult.access_token) {
          return NextResponse.json({ error: 'Login failed' }, { status: 401 })
        }

        // Get user profile from Marketing Backend
        let userProfile: any = { email: username }
        try {
          userProfile = await mbGetMe(mbResult.access_token)
        } catch { /* non-fatal */ }

        // Upsert local SQLite user + create local session so getUserFromRequest() works
        const { userId, sessionToken, expiresAt } = upsertMarketingUser(
          { email: userProfile.email || username, full_name: userProfile.full_name || username, avatar_url: userProfile.avatar_url },
          { ipAddress, userAgent }
        )

        const response = NextResponse.json({
          user: {
            id: userId,
            username: userProfile.email || username,
            display_name: userProfile.full_name || username,
            role: 'admin',
            provider: 'marketing_backend',
            email: userProfile.email || username,
            avatar_url: userProfile.avatar_url || null,
            workspace_id: 1,
            tenant_id: 1,
          },
        })

        // Store local session token as cookie (not MB JWT — getUserFromRequest reads SQLite sessions)
        response.cookies.set(cookieName, sessionToken, {
          ...getMcSessionCookieOptions({ maxAgeSeconds: expiresAt - Math.floor(Date.now() / 1000), isSecureRequest }),
        })

        // Store MB JWT in separate cookie for downstream service calls
        response.cookies.set('oc_token', mbResult.access_token, {
          httpOnly: true,
          secure: isSecureRequest,
          sameSite: 'lax',
          path: '/',
          maxAge: 43200, // 12 hours
        })

        // Store refresh token in a separate cookie
        if (mbResult.refresh_token) {
          response.cookies.set('mc_refresh_token', mbResult.refresh_token, {
            httpOnly: true,
            secure: isSecureRequest,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 3600, // 30 days
          })
        }

        return response
      } catch (error: any) {
        logger.warn({ err: error?.message }, 'Marketing Backend login failed, trying local auth fallback')
        // Fall through to local auth as fallback
      }
    }

    // ─── Local auth (self-hosted mode, fallback) ───
    const user = authenticateUser(username, password)
    if (!user) {
      logAuditEvent({ action: 'login_failed', actor: username, ip_address: ipAddress, user_agent: userAgent })

      if (needsFirstTimeSetup()) {
        return NextResponse.json(
          {
            error: 'No admin account has been created yet',
            code: 'NO_USERS',
            hint: 'Visit /setup to create your admin account',
          },
          { status: 401 }
        )
      }

      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const { token, expiresAt } = createSession(user.id, ipAddress, userAgent, user.workspace_id)

    logAuditEvent({ action: 'login', actor: user.username, actor_id: user.id, ip_address: ipAddress, user_agent: userAgent })

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        provider: user.provider || 'local',
        email: user.email || null,
        avatar_url: user.avatar_url || null,
        workspace_id: user.workspace_id ?? 1,
        tenant_id: user.tenant_id ?? 1,
      },
    })

    response.cookies.set(cookieName, token, {
      ...getMcSessionCookieOptions({ maxAgeSeconds: expiresAt - Math.floor(Date.now() / 1000), isSecureRequest }),
    })

    return response
  } catch (error) {
    logger.error({ err: error }, 'Login error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
