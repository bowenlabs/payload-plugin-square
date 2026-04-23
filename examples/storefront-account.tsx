/**
 * Account page example — loyalty balance + order history
 *
 * Drop this into your Next.js App Router project at app/account/page.tsx.
 * It assumes:
 *  - You have an auth context that exposes the current user
 *  - The plugin's loyalty endpoint is enabled (loyalty: { programId: '...' })
 *  - The Payload `orders` collection is accessible via cookie auth
 *
 * Adapt the auth check and styling to match your application.
 */
'use client'

import { useEffect, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface RewardTier {
  id: string
  name: string
  pointsCost: number
}

interface LoyaltyData {
  balance: number
  customerId: string | null
  program: { id: string; name: string; rewardTiers: RewardTier[] } | null
  availableRewards: RewardTier[]
}

interface Order {
  id: string
  orderNumber: string
  status: string
  total: number
  currency: string
  createdAt: string
  lineItems: { productName: string; quantity: number; totalPrice: number }[]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null)
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    // Fetch loyalty balance (returns 404 if loyalty is not enabled in plugin config)
    void fetch('/api/square/loyalty/balance', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LoyaltyData | null) => setLoyalty(data))

    // Fetch order history — Payload returns only this user's orders (read access control)
    void fetch('/api/orders?limit=20&sort=-createdAt&depth=0', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { docs: Order[] }) => setOrders(data.docs))
  }, [])

  return (
    <main>
      {/* ── Loyalty card ──────────────────────────────────────────────────── */}
      {loyalty && (
        <section>
          <h2>{loyalty.program?.name ?? 'Loyalty'}</h2>
          <p>
            <strong>{loyalty.balance}</strong> points
          </p>

          {loyalty.program?.rewardTiers.map((tier) => (
            <div key={tier.id}>
              <span>{tier.name}</span>
              <span>{tier.pointsCost} pts</span>
              {tier.pointsCost <= loyalty.balance && <span> ✓ Available</span>}
            </div>
          ))}

          {loyalty.availableRewards.length > 0 && (
            <p>
              🎁 {loyalty.availableRewards.length} reward
              {loyalty.availableRewards.length !== 1 ? 's' : ''} available at checkout
            </p>
          )}
        </section>
      )}

      {/* ── Order history ─────────────────────────────────────────────────── */}
      <section>
        <h2>Orders</h2>
        {orders.length === 0 && <p>No orders yet.</p>}
        {orders.map((order) => (
          <details key={order.id}>
            <summary>
              {order.orderNumber} — {order.status} —{' '}
              {(order.total / 100).toLocaleString('en-US', { style: 'currency', currency: order.currency })}
            </summary>
            <ul>
              {order.lineItems.map((li, i) => (
                <li key={i}>
                  {li.productName} × {li.quantity} —{' '}
                  {(li.totalPrice / 100).toLocaleString('en-US', { style: 'currency', currency: order.currency })}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </main>
  )
}

// ── Redeeming a reward at checkout ────────────────────────────────────────
//
// Pass the reward tier ID in the cart when the customer selects a reward:
//
//   POST /api/square/checkout
//   {
//     sourceId: "payment-token",
//     cart: {
//       items: [...],
//       userId: currentUser.id,
//       loyaltyOptIn: true,
//       loyaltyRewardDefinitionId: selectedTier.id  // from availableRewards[]
//     }
//   }
//
// The plugin applies the discount to the Square order before charging.
