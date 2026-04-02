import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * POST /api/stripe/checkout
 * Body: { tier: 'starter' | 'pro' | 'max', interval: 'monthly' | 'annual', email?: string }
 * Returns: { url: string } (Stripe Checkout URL)
 */

const PRICE_MAP: Record<string, string | undefined> = {
  'starter_monthly': process.env.STRIPE_PRICE_STARTER_MONTHLY,
  'starter_annual': process.env.STRIPE_PRICE_STARTER_ANNUAL,
  'pro_monthly': process.env.STRIPE_PRICE_PRO_MONTHLY,
  'pro_annual': process.env.STRIPE_PRICE_PRO_ANNUAL,
  'max_monthly': process.env.STRIPE_PRICE_MAX_MONTHLY,
  'max_annual': process.env.STRIPE_PRICE_MAX_ANNUAL,
}

const VALID_TIERS = new Set(['starter', 'pro', 'max'])
const VALID_INTERVALS = new Set(['monthly', 'annual'])

export async function POST(request: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      logger.warn('STRIPE_SECRET_KEY is not configured')
      return NextResponse.json(
        {
          error: 'Stripe is not configured yet. Please set STRIPE_SECRET_KEY and the price ID environment variables.',
        },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { tier, interval, email } = body as {
      tier?: string
      interval?: string
      email?: string
    }

    if (!tier || !VALID_TIERS.has(tier)) {
      return NextResponse.json({ error: 'Invalid tier. Must be one of: starter, pro, max' }, { status: 400 })
    }

    if (!interval || !VALID_INTERVALS.has(interval)) {
      return NextResponse.json({ error: 'Invalid interval. Must be one of: monthly, annual' }, { status: 400 })
    }

    const priceKey = `${tier}_${interval}`
    const priceId = PRICE_MAP[priceKey]
    if (!priceId) {
      logger.warn({ priceKey }, `Price ID not configured for ${priceKey}`)
      return NextResponse.json(
        {
          error: `Price ID not configured for ${tier} ${interval}. Please set STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()} environment variable.`,
        },
        { status: 503 },
      )
    }

    // Build URLs
    const origin = request.headers.get('origin') || request.nextUrl.origin
    const successUrl = `${origin}/account-ready?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${origin}/pricing`

    // Call Stripe REST API directly (no SDK dependency)
    const params = new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': successUrl,
      'cancel_url': cancelUrl,
      'metadata[tier]': tier,
      'metadata[interval]': interval,
    })

    if (email) {
      params.set('customer_email', email)
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const session = await stripeResponse.json()

    if (!stripeResponse.ok) {
      logger.error({ err: session.error }, `Stripe API error: ${session.error?.message || 'Unknown error'}`)
      return NextResponse.json(
        { error: session.error?.message || 'Failed to create checkout session' },
        { status: stripeResponse.status },
      )
    }

    logger.info({ sessionId: session.id, tier, interval }, 'Created Stripe checkout session')
    return NextResponse.json({ url: session.url })
  } catch (error) {
    logger.error({ err: error }, 'Stripe checkout unexpected error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
