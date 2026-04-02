import { NextResponse } from 'next/server'
import { requireRole, getUserById, updateUser, destroyAllUserSessions } from '@/lib/auth'
import { logAuditEvent } from '@/lib/db'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const MIN_PASSWORD_LENGTH = 12

export async function POST(request: Request) {
  try {
    // Rate limit
    const rateCheck = mutationLimiter(request)
    if (rateCheck) return rateCheck

    // Admin only
    const auth = requireRole(request, 'admin')
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { userId, newPassword } = body

    // Validate inputs
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json({ error: 'userId is required and must be a number' }, { status: 400 })
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'newPassword is required' }, { status: 400 })
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      )
    }

    // Check target user exists
    const targetUser = getUserById(userId)
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Prevent resetting password for non-local providers
    if (targetUser.provider && targetUser.provider !== 'local') {
      return NextResponse.json(
        { error: 'Cannot reset password for OAuth users. They must use their identity provider.' },
        { status: 400 }
      )
    }

    // Update password
    const updated = updateUser(userId, { password: newPassword })
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
    }

    // Revoke all sessions for the target user
    destroyAllUserSessions(userId)

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

    logAuditEvent({
      action: 'admin_password_reset',
      actor: auth.user.username,
      actor_id: auth.user.id,
      target_type: 'user',
      target_id: userId,
      ip_address: ipAddress,
      detail: { target_username: targetUser.username },
    })

    logger.info(
      { admin: auth.user.username, targetUser: targetUser.username, targetUserId: userId },
      'Admin reset user password and revoked all sessions'
    )

    return NextResponse.json({
      ok: true,
      message: 'Password has been reset and all sessions revoked.',
    })
  } catch (error) {
    logger.error({ err: error }, 'Password reset error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
