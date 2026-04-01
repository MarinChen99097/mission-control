'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const PLANS = [
  {
    name: 'Starter',
    price: 20,
    description: 'Perfect for individuals getting started with AI agents.',
    features: [
      '0.5 vCPU / 1 GB RAM',
      '5 GB SSD storage',
      '$5 AI credits included',
      'Google Drive integration',
      'Up to 3 custom skills',
      'Daily backups',
      'Community support',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: 60,
    description: 'For professionals who need more power and integrations.',
    features: [
      '1 vCPU / 2 GB RAM',
      '20 GB SSD storage',
      '$15 AI credits included',
      'Google Drive integration',
      'Notion integration',
      'Up to 10 custom skills',
      'Daily backups (30-day retention)',
      'Email support',
      'Up to 3 team members',
    ],
    cta: 'Start Pro',
    highlighted: true,
  },
  {
    name: 'Max',
    price: 180,
    description: 'Enterprise-grade AI agent infrastructure for power users.',
    features: [
      '2 vCPU / 4 GB RAM',
      '50 GB SSD storage',
      '$50 AI credits included',
      'Google Drive integration',
      'Notion integration',
      'Unlimited custom skills',
      'Daily backups (90-day retention)',
      'Dedicated support',
      'Up to 10 team members',
      'Priority provisioning',
    ],
    cta: 'Go Max',
    highlighted: false,
  },
]

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-primary shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  )
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">OC</span>
            </div>
            <span className="font-semibold text-foreground">OrgOfClaws</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="text-center pt-20 pb-12 px-6">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Your own AI agent, running 24/7 in the cloud. No DevOps, no servers, no hassle.
          Every plan includes an isolated, secure container.
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3">
          <span className={`text-sm ${!annual ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-primary' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-6' : ''}`} />
          </button>
          <span className={`text-sm ${annual ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            Annual <span className="text-primary text-xs font-medium ml-1">Save 20%</span>
          </span>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const displayPrice = annual ? Math.round(plan.price * 0.8) : plan.price
            return (
              <div
                key={plan.name}
                className={`relative rounded-xl border p-6 flex flex-col ${
                  plan.highlighted
                    ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                    : 'border-border bg-card'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground mb-1">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">${displayPrice}</span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ${displayPrice * 12}/year (billed annually)
                    </p>
                  )}
                </div>

                <Button
                  className={`w-full mb-6 ${plan.highlighted ? '' : 'bg-secondary hover:bg-secondary/80'}`}
                  variant={plan.highlighted ? 'default' : 'secondary'}
                >
                  {plan.cta}
                </Button>

                <div className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <CheckIcon />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-foreground text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-6">
          <div>
            <h3 className="font-medium text-foreground mb-2">What is OpenClaw?</h3>
            <p className="text-sm text-muted-foreground">
              OpenClaw is an open-source AI assistant that lives on your computer (or in the cloud).
              It can see your screen, use your apps, and do real work for you. OrgOfClaws hosts it
              for you so you don&apos;t need to manage any infrastructure.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground mb-2">Can I cancel anytime?</h3>
            <p className="text-sm text-muted-foreground">
              Yes. All plans are month-to-month (or annual with 20% discount). Cancel anytime and
              your agent will remain active until the end of your billing period.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground mb-2">What are AI credits?</h3>
            <p className="text-sm text-muted-foreground">
              AI credits cover the cost of LLM API calls (Claude, Gemini, etc.) your agent makes.
              Each plan includes credits; you can purchase additional credits if needed.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground mb-2">Is my data secure?</h3>
            <p className="text-sm text-muted-foreground">
              Every user gets a completely isolated container. Your conversations, files, and API keys
              are never shared with other users. All data is encrypted at rest (AES-256) and in transit.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground mb-2">What cloud provider do you use?</h3>
            <p className="text-sm text-muted-foreground">
              We run on Google Cloud Platform (GCP) in the asia-east1 region (Taiwan), using GKE
              Autopilot for container orchestration and Cloud SQL for data storage.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} OrgOfClaws. Powered by Landing AI.</span>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
