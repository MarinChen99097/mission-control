import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import crypto from 'node:crypto'

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events.
 * Currently handles: checkout.session.completed
 *
 * Signature verification requires STRIPE_WEBHOOK_SECRET to be configured.
 * Actual VM provisioning is handled by Service System's provisioning_v3.py.
 */

// In-memory idempotency guard (sufficient for single-instance Cloud Run)
const processedEvents = new Set<string>()
const MAX_PROCESSED_EVENTS = 10_000

function trackEvent(eventId: string): boolean {
  if (processedEvents.has(eventId)) return false
  if (processedEvents.size >= MAX_PROCESSED_EVENTS) {
    // Evict oldest 1000 entries in-place — O(k) with zero allocations
    let evicted = 0
    for (const id of processedEvents) {
      if (evicted >= 1000) break
      processedEvents.delete(id)
      evicted++
    }
  }
  processedEvents.add(eventId)
  return true
}

function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): boolean {
  try {
    // Parse the Stripe-Signature header
    const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, part) => {
      const [key, value] = part.split('=')
      if (key && value) acc[key.trim()] = value.trim()
      return acc
    }, {})

    const timestamp = parts['t']
    const signature = parts['v1']
    if (!timestamp || !signature) return false

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    // REJECT if webhook secret is not configured — never skip verification
    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook request')
      return NextResponse.json({ error: 'Webhook verification not configured' }, { status: 503 })
    }

    // Verify signature
    const sigHeader = request.headers.get('stripe-signature') || ''
    if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
      logger.warn('Invalid Stripe webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(rawBody)

    // Idempotency: skip duplicate events
    if (event.id && !trackEvent(event.id)) {
      logger.info({ eventId: event.id }, 'Duplicate Stripe webhook event — skipping')
      return NextResponse.json({ received: true })
    }

    logger.info({ eventType: event.type, eventId: event.id }, 'Received Stripe webhook event')

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data?.object
        const customerEmail = session?.customer_email || session?.customer_details?.email || 'unknown'
        const subscriptionId = session?.subscription || 'unknown'
        const tier = session?.metadata?.tier || 'unknown'
        const interval = session?.metadata?.interval || 'unknown'

        logger.info(
          { customerEmail, subscriptionId, tier, interval },
          'Stripe checkout completed',
        )

        // TODO: Trigger workspace provisioning via Service System's provisioning_v3.py
        // For now, just log the event. The actual provisioning flow:
        //   1. POST to /api/super/provision-jobs with customer info
        //   2. Service System creates the cloud laptop VM
        //   3. VM status is polled via /api/stripe/status

        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data?.object
        logger.info({ subscriptionId: subscription?.id, status: subscription?.status }, 'Stripe subscription updated')
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data?.object
        logger.info({ subscriptionId: subscription?.id }, 'Stripe subscription cancelled')
        // TODO: Handle workspace deprovisioning
        break
      }

      default:
        logger.info({ eventType: event.type }, 'Unhandled Stripe webhook event type')
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error({ err: error }, 'Stripe webhook processing error')
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
