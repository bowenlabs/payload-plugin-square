/**
 * Checkout form example — Square Web Payments SDK + loyalty reward selector
 *
 * This is a minimal but complete checkout form. It shows:
 *  - Square card iframe initialisation
 *  - Tokenising and sending the cart to the plugin's checkout endpoint
 *  - Loyalty opt-in checkbox
 *  - Reward selector for customers who have redeemable points
 *
 * The Square Web Payments SDK must be loaded in your page (or layout):
 *
 *   <Script src="https://web.squarecdn.com/v1/square.js" strategy="beforeInteractive" />
 *   (use the sandbox URL in dev: https://sandbox.web.squarecdn.com/v1/square.js)
 */
'use client'

import { useEffect, useRef, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  variationId: string
  quantity: number
  unitPrice: number // cents
}

interface RewardTier {
  id: string
  name: string
  pointsCost: number
}

interface CheckoutFormProps {
  applicationId: string
  locationId: string
  items: CartItem[]
  userId?: string        // pass when user is logged in
  guestEmail?: string    // pass for guest checkout
}

// ── Component ────────────────────────────────────────────────────────────────

export function CheckoutForm({ applicationId, locationId, items, userId, guestEmail }: CheckoutFormProps) {
  const cardRef = useRef<{ tokenize: () => Promise<{ status: string; token?: string }> } | null>(null)
  const [cardReady, setCardReady] = useState(false)
  const [loyaltyOptIn, setLoyaltyOptIn] = useState(false)
  const [availableRewards, setAvailableRewards] = useState<RewardTier[]>([])
  const [selectedRewardId, setSelectedRewardId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialise the Square card iframe
  useEffect(() => {
    if (!window.Square) return
    void (async () => {
      const payments = await window.Square!.payments(applicationId, locationId)
      const card = await payments.card()
      await card.attach('#square-card')
      cardRef.current = card
      setCardReady(true)
    })()
  }, [applicationId, locationId])

  // Load available loyalty rewards when user opts in
  useEffect(() => {
    if (!loyaltyOptIn || !userId) return
    void fetch('/api/square/loyalty/balance', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { availableRewards: RewardTier[] }) => {
        setAvailableRewards(data.availableRewards ?? [])
      })
  }, [loyaltyOptIn, userId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cardRef.current) return
    setLoading(true)
    setError(null)

    try {
      const { status, token } = await cardRef.current.tokenize()
      if (status !== 'OK' || !token) {
        setError('Card tokenisation failed — please try again.')
        return
      }

      const response = await fetch('/api/square/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: token,
          cart: {
            items,
            userId,
            guestEmail,
            loyaltyOptIn: loyaltyOptIn || undefined,
            loyaltyRewardDefinitionId: selectedRewardId,
          },
        }),
      })

      const data = (await response.json()) as { order?: { id: string }; error?: string }

      if (response.ok && data.order) {
        // Redirect to confirmation page
        window.location.href = `/order/${data.order.id}`
      } else {
        setError(data.error ?? 'Checkout failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)

  return (
    <form onSubmit={(e) => void handleSubmit(e)}>
      {/* Card field */}
      <div id="square-card" style={{ minHeight: 89 }} />
      {!cardReady && <p>Loading payment form…</p>}

      {/* Loyalty opt-in (only shown for logged-in users) */}
      {userId && (
        <label>
          <input
            type="checkbox"
            checked={loyaltyOptIn}
            onChange={(e) => {
              setLoyaltyOptIn(e.target.checked)
              setSelectedRewardId(undefined)
            }}
          />
          {' '}Earn loyalty points on this order
        </label>
      )}

      {/* Reward selector (shown after opt-in if rewards are available) */}
      {loyaltyOptIn && availableRewards.length > 0 && (
        <fieldset>
          <legend>Redeem a reward</legend>
          <label>
            <input
              type="radio"
              name="reward"
              value=""
              checked={!selectedRewardId}
              onChange={() => setSelectedRewardId(undefined)}
            />
            {' '}No reward
          </label>
          {availableRewards.map((tier) => (
            <label key={tier.id}>
              <input
                type="radio"
                name="reward"
                value={tier.id}
                checked={selectedRewardId === tier.id}
                onChange={() => setSelectedRewardId(tier.id)}
              />
              {' '}{tier.name} ({tier.pointsCost} pts)
            </label>
          ))}
        </fieldset>
      )}

      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}

      <button type="submit" disabled={loading || !cardReady}>
        {loading ? 'Processing…' : `Pay $${(total / 100).toFixed(2)}`}
      </button>
    </form>
  )
}

// ── TypeScript augmentation for window.Square ──────────────────────────────
declare global {
  interface Window {
    Square?: {
      payments: (
        applicationId: string,
        locationId: string,
      ) => Promise<{
        card: () => Promise<{
          attach: (selector: string) => Promise<void>
          tokenize: () => Promise<{ status: string; token?: string }>
        }>
      }>
    }
  }
}
