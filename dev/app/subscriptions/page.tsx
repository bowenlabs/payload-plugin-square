'use client'

import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { useAuth } from '../_auth/AuthContext.js'

interface SubscriptionPhase {
  uid?: string
  cadence?: string
  periods?: number
  recurringPriceMoney: { amount: number; currency: string }
  ordinal?: number
}

interface SubscriptionVariation {
  id: string
  name?: string
  phases: SubscriptionPhase[]
}

interface SubscriptionPlan {
  id: string
  name?: string
  variations: SubscriptionVariation[]
}

function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function cadenceLabel(cadence?: string) {
  const map: Record<string, string> = {
    DAILY: 'day',
    WEEKLY: 'week',
    EVERY_TWO_WEEKS: '2 weeks',
    THIRTY_DAYS: '30 days',
    SIXTY_DAYS: '60 days',
    NINETY_DAYS: '90 days',
    MONTHLY: 'month',
    EVERY_TWO_MONTHS: '2 months',
    QUARTERLY: 'quarter',
    EVERY_FOUR_MONTHS: '4 months',
    EVERY_SIX_MONTHS: '6 months',
    ANNUAL: 'year',
    EVERY_TWO_YEARS: '2 years',
  }
  return cadence ? (map[cadence] ?? cadence.toLowerCase()) : 'period'
}

export default function SubscriptionsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)

  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const [subscribeSuccess, setSubscribeSuccess] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/square/subscriptions/plans')
        if (!res.ok) throw new Error('Failed to load plans')
        const data = (await res.json()) as { plans: SubscriptionPlan[] }
        setPlans(data.plans)
      } catch {
        setPlansError('Could not load subscription plans.')
      } finally {
        setPlansLoading(false)
      }
    })()
  }, [])

  const handleSubscribe = async (variationId: string) => {
    if (!user) {
      router.push('/login')
      return
    }
    setSubscribing(variationId)
    setSubscribeError(null)
    setSubscribeSuccess(null)

    // In a real storefront, collect a card nonce via Square Web Payments SDK.
    // Here we use the sandbox test nonce for demonstration.
    const sourceId = 'cnon:card-nonce-ok'

    try {
      const res = await fetch('/api/square/subscriptions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sourceId,
          planVariationId: variationId,
          userId: (user as { id?: string }).id,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setSubscribeError(data.error ?? 'Subscription failed')
      } else {
        setSubscribeSuccess('Subscription created! View it in your account.')
      }
    } catch {
      setSubscribeError('Network error — please try again.')
    } finally {
      setSubscribing(null)
    }
  }

  if (plansLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading plans…</div>
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700 }}>Subscriptions</h1>
      <p style={{ margin: '0 0 32px', fontSize: 14, color: '#6b7280' }}>
        Subscribe for recurring access. Your card is saved securely in Square — it never touches our servers.
      </p>

      {plansError && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: 14,
            marginBottom: 24,
          }}
        >
          {plansError}
        </div>
      )}

      {subscribeSuccess && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#f0fdf4',
            color: '#166534',
            fontSize: 14,
            marginBottom: 24,
          }}
        >
          {subscribeSuccess}
        </div>
      )}

      {subscribeError && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: 14,
            marginBottom: 24,
          }}
        >
          {subscribeError}
        </div>
      )}

      {!plansLoading && plans.length === 0 && !plansError && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #e5e7eb',
          }}
        >
          <p style={{ margin: 0, color: '#9ca3af', fontSize: 14 }}>
            No subscription plans are configured in Square yet.
            <br />
            Create a <strong>Subscription Plan</strong> in your Square Dashboard to get started.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {plans.map((plan) =>
          plan.variations.map((variation) => {
            const firstPhase = variation.phases[0]
            if (!firstPhase) return null
            const isSubscribing = subscribing === variation.id

            return (
              <div
                key={variation.id}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  padding: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>
                    {variation.name ?? plan.name ?? 'Subscription Plan'}
                  </h2>
                  <p style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280' }}>
                    Billed every {cadenceLabel(firstPhase.cadence)}
                    {variation.phases.length > 1 && ` · ${variation.phases.length} phases`}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 28, fontWeight: 800 }}>
                      {formatPrice(firstPhase.recurringPriceMoney.amount, firstPhase.recurringPriceMoney.currency)}
                    </span>
                    <span style={{ fontSize: 14, color: '#9ca3af' }}>
                      / {cadenceLabel(firstPhase.cadence)}
                    </span>
                  </div>
                </div>

                <button
                  disabled={isSubscribing}
                  onClick={() => void handleSubscribe(variation.id)}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: isSubscribing ? '#9ca3af' : '#111',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: isSubscribing ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {isSubscribing ? 'Subscribing…' : 'Subscribe'}
                </button>
              </div>
            )
          })
        )}
      </div>

      {!authLoading && !user && (
        <p style={{ marginTop: 24, fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
          <a href="/login" style={{ color: '#111', fontWeight: 600 }}>Sign in</a> to subscribe.
        </p>
      )}
    </div>
  )
}
