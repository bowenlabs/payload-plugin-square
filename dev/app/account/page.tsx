'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../_auth/AuthContext.js'

// ── Types ────────────────────────────────────────────────────────────────────

interface Subscription {
  id: string
  squareSubscriptionId: string
  status: string
  planName?: string
  cadence?: string
  priceAmount?: number
  currency: string
  startDate?: string
  chargedThroughDate?: string
}

interface RewardTier {
  id: string
  name: string
  pointsCost: number
  discount?: unknown
}

interface LoyaltyData {
  balance: number
  customerId: string | null
  program: {
    id: string
    name: string
    rewardTiers: RewardTier[]
  } | null
  availableRewards: RewardTier[]
}

interface LineItem {
  productName: string
  variationName?: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface Order {
  id: string
  orderNumber: string
  status: string
  total: number
  subtotal: number
  tax?: number
  currency: string
  createdAt: string
  lineItems: LineItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  paid:               { background: '#f0fdf4', color: '#166534' },
  pending:            { background: '#fffbeb', color: '#92400e' },
  failed:             { background: '#fef2f2', color: '#b91c1c' },
  refunded:           { background: '#f5f3ff', color: '#6d28d9' },
  partially_refunded: { background: '#f5f3ff', color: '#6d28d9' },
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LoyaltyCard({ data }: { data: LoyaltyData }) {
  const { balance, program, availableRewards } = data

  return (
    <div
      style={{
        background: '#111',
        color: '#fff',
        borderRadius: 12,
        padding: 24,
        marginBottom: 32,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#9ca3af' }}>
            {program?.name ?? 'Loyalty Program'}
          </p>
          <p style={{ margin: 0, fontSize: 36, fontWeight: 700 }}>
            {balance.toLocaleString()} <span style={{ fontSize: 18, fontWeight: 400 }}>pts</span>
          </p>
        </div>
        <span style={{ fontSize: 28 }}>⭐</span>
      </div>

      {program && program.rewardTiers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Reward tiers
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {program.rewardTiers.map((tier) => {
              const canRedeem = tier.pointsCost <= balance
              return (
                <div
                  key={tier.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: canRedeem ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                    borderRadius: 8,
                    padding: '10px 14px',
                  }}
                >
                  <span style={{ fontSize: 14, color: canRedeem ? '#fff' : '#6b7280' }}>
                    {tier.name}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: canRedeem ? '#86efac' : '#6b7280',
                    }}
                  >
                    {tier.pointsCost.toLocaleString()} pts
                    {canRedeem && ' ✓'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {availableRewards.length > 0 && (
        <p style={{ margin: '16px 0 0', fontSize: 13, color: '#86efac' }}>
          🎁 You have {availableRewards.length} reward{availableRewards.length !== 1 ? 's' : ''} available to redeem at checkout.
        </p>
      )}

      {!program && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#9ca3af' }}>
          No loyalty program configured in Square yet.
        </p>
      )}
    </div>
  )
}

function OrderRow({ order }: { order: Order }) {
  const [open, setOpen] = useState(false)
  const style = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending!

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{order.orderNumber}</span>
          <span style={{ color: '#9ca3af', fontSize: 13, marginLeft: 10 }}>
            {formatDate(order.createdAt)}
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 99,
            ...style,
            flexShrink: 0,
          }}
        >
          {order.status.replace('_', ' ')}
        </span>
        <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
          {formatPrice(order.total, order.currency)}
        </span>
        <span style={{ color: '#9ca3af', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '14px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ color: '#9ca3af', fontSize: 12 }}>
                <th style={{ textAlign: 'left', paddingBottom: 8, fontWeight: 500 }}>Item</th>
                <th style={{ textAlign: 'center', paddingBottom: 8, fontWeight: 500 }}>Qty</th>
                <th style={{ textAlign: 'right', paddingBottom: 8, fontWeight: 500 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.lineItems?.map((li, i) => (
                <tr key={i}>
                  <td style={{ paddingBottom: 6, color: '#374151' }}>
                    {li.productName}
                    {li.variationName && li.variationName !== li.productName && (
                      <span style={{ color: '#9ca3af' }}> · {li.variationName}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', paddingBottom: 6, color: '#374151' }}>
                    {li.quantity}
                  </td>
                  <td style={{ textAlign: 'right', paddingBottom: 6, color: '#374151' }}>
                    {formatPrice(li.totalPrice, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid #f3f4f6' }}>
                <td colSpan={2} style={{ paddingTop: 10, color: '#6b7280', fontSize: 13 }}>
                  Subtotal
                </td>
                <td style={{ textAlign: 'right', paddingTop: 10, color: '#374151', fontSize: 13 }}>
                  {formatPrice(order.subtotal, order.currency)}
                </td>
              </tr>
              {!!order.tax && (
                <tr>
                  <td colSpan={2} style={{ color: '#6b7280', fontSize: 13 }}>Tax</td>
                  <td style={{ textAlign: 'right', color: '#374151', fontSize: 13 }}>
                    {formatPrice(order.tax, order.currency)}
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2} style={{ paddingTop: 8, fontWeight: 700 }}>Total</td>
                <td style={{ textAlign: 'right', paddingTop: 8, fontWeight: 700 }}>
                  {formatPrice(order.total, order.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null)
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  const fetchData = useCallback(async () => {
    // Loyalty balance
    try {
      const res = await fetch('/api/square/loyalty/balance', { credentials: 'include' })
      if (res.ok) {
        setLoyalty((await res.json()) as LoyaltyData)
      } else if (res.status === 404) {
        // Loyalty endpoint disabled in plugin config — that's fine
        setLoyalty(null)
      } else {
        setLoyaltyError('Could not load loyalty data.')
      }
    } catch {
      setLoyaltyError('Could not load loyalty data.')
    }

    // Orders
    try {
      const res = await fetch('/api/orders?limit=20&sort=-createdAt&depth=0', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = (await res.json()) as { docs: Order[] }
        setOrders(data.docs)
      }
    } finally {
      setOrdersLoading(false)
    }

    // Subscriptions
    try {
      const res = await fetch('/api/square/subscriptions', { credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as { subscriptions: Subscription[] }
        setSubscriptions(data.subscriptions)
      }
    } catch {
      // subscriptions endpoint may not be enabled — non-fatal
    }
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login')
    } else if (!authLoading && user) {
      void fetchData()
    }
  }, [authLoading, user, router, fetchData])

  if (authLoading || (!user && !authLoading)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>My Account</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>{user!.email as string}</p>
      </div>

      {/* Loyalty */}
      {loyaltyError ? (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: 14,
            marginBottom: 32,
          }}
        >
          {loyaltyError}
        </div>
      ) : loyalty ? (
        <LoyaltyCard data={loyalty} />
      ) : null}

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Subscriptions</h2>
            <Link href="/subscriptions" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>
              Browse plans →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subscriptions.map((sub) => {
              const statusStyles: Record<string, { background: string; color: string }> = {
                ACTIVE:      { background: '#f0fdf4', color: '#166534' },
                PENDING:     { background: '#fffbeb', color: '#92400e' },
                PAUSED:      { background: '#eff6ff', color: '#1d4ed8' },
                CANCELED:    { background: '#f9fafb', color: '#6b7280' },
                DEACTIVATED: { background: '#f9fafb', color: '#6b7280' },
              }
              const style = statusStyles[sub.status] ?? statusStyles.PENDING!
              return (
                <div
                  key={sub.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {sub.planName ?? 'Subscription Plan'}
                    </span>
                    {sub.cadence && (
                      <span style={{ color: '#9ca3af', fontSize: 13, marginLeft: 8 }}>
                        · {sub.cadence.toLowerCase()}
                      </span>
                    )}
                    {sub.chargedThroughDate && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                        Paid through{' '}
                        {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(sub.chargedThroughDate))}
                      </p>
                    )}
                  </div>
                  {sub.priceAmount !== undefined && (
                    <span style={{ fontWeight: 700, fontSize: 15 }}>
                      {formatPrice(sub.priceAmount, sub.currency)}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 99,
                      ...style,
                    }}
                  >
                    {sub.status.charAt(0) + sub.status.slice(1).toLowerCase()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Orders */}
      <div>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Order history</h2>
        {ordersLoading ? (
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Loading orders…</p>
        ) : orders.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              background: '#fff',
              borderRadius: 10,
              border: '1px solid #e5e7eb',
            }}
          >
            <p style={{ margin: '0 0 12px', color: '#9ca3af', fontSize: 14 }}>No orders yet.</p>
            <Link
              href="/"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                borderRadius: 6,
                background: '#111',
                color: '#fff',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Browse the store
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
