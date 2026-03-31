import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { validateBody, createMessageSchema } from '@/lib/validation'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { scanForInjection } from '@/lib/injection-guard'
import { scanForSecrets } from '@/lib/secret-scanner'
import { logSecurityEvent } from '@/lib/security-events'
import { getLobsterBaseUrl } from '@/lib/lobster-api'

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const result = await validateBody(request, createMessageSchema)
    if ('error' in result) return result.error
    const { to, message } = result.data
    const from = auth.user.display_name || auth.user.username || 'system'

    // Scan message for injection
    const injectionReport = scanForInjection(message, { context: 'prompt' })
    if (!injectionReport.safe) {
      const criticals = injectionReport.matches.filter(m => m.severity === 'critical')
      if (criticals.length > 0) {
        logger.warn({ to, rules: criticals.map(m => m.rule) }, 'Blocked agent message: injection detected')
        return NextResponse.json(
          { error: 'Message blocked: potentially unsafe content detected', injection: criticals.map(m => ({ rule: m.rule, description: m.description })) },
          { status: 422 }
        )
      }
    }

    const secretHits = scanForSecrets(message)
    if (secretHits.length > 0) {
      try { logSecurityEvent({ event_type: 'secret_exposure', severity: 'critical', source: 'agent-message', agent_name: from, detail: JSON.stringify({ count: secretHits.length, types: secretHits.map(s => s.type) }), workspace_id: auth.user.workspace_id ?? 1, tenant_id: 1 }) } catch {}
    }

    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1;
    const agent = db
      .prepare('SELECT * FROM agents WHERE name = ? AND workspace_id = ?')
      .get(to, workspaceId) as any
    if (!agent) {
      return NextResponse.json({ error: 'Recipient agent not found' }, { status: 404 })
    }

    // Forward message to lobster via Gateway (Cloudflare tunnel)
    const lobsterUrl = getLobsterBaseUrl()
    let forwarded = false
    let forwardError: string | null = null

    if (lobsterUrl) {
      const gwToken = (
        process.env.OPENCLAW_GATEWAY_TOKEN ||
        process.env.OPENCLAW_TOKEN ||
        process.env.GATEWAY_TOKEN ||
        ''
      ).trim()

      try {
        const res = await fetch(`${lobsterUrl}/api/agent-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(gwToken ? { Authorization: `Bearer ${gwToken}` } : {}),
          },
          body: JSON.stringify({ from, to, message }),
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          forwarded = true
        } else {
          forwardError = `Gateway returned ${res.status}`
          logger.warn({ status: res.status }, 'Lobster agent-message endpoint returned error')
        }
      } catch (err: any) {
        forwardError = err?.message || 'Gateway unreachable'
        logger.warn({ err: err?.message }, 'Failed to forward message to lobster — saving locally only')
      }
    } else {
      forwardError = 'No gateway URL configured'
    }

    // Always save notification + activity locally regardless of gateway result
    db_helpers.createNotification(
      to,
      'message',
      'Direct Message',
      `${from}: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`,
      'agent',
      agent.id,
      workspaceId
    )

    db_helpers.logActivity(
      'agent_message',
      'agent',
      agent.id,
      from,
      `Sent message to ${to}`,
      { to },
      workspaceId
    )

    return NextResponse.json({
      success: true,
      forwarded,
      ...(forwardError ? { forward_warning: forwardError } : {}),
    })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/agents/message error')
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
