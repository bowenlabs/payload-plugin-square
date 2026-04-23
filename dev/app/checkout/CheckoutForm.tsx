'use client'

import { useRouter } from 'next/navigation'
import Script from 'next/script'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { useAuth } from '../_auth/AuthContext.js'
import type { CartItem } from '../_cart/CartContext.js'
import { useCart } from '../_cart/CartContext.js'

interface SquareCard {
  attach: (selector: string) => Promise<void>
  tokenize: () => Promise<{ status: string; token?: string; errors?: unknown[] }>
}

declare global {
  interface Window {
    Square?: {
      payments: (
        applicationId: string,
        locationId: string,
      ) => Promise<{ card: () => Promise<SquareCard> }>
    }
  }
}

interface Props {
  applicationId: string
  locationId: string
}

interface ShippingRate {
  id: string
  name: string
  amount: number
  estimatedDays?: number
}

interface ShippingAddress {
  firstName: string
  lastName: string
  address1: string
  address2: string
  city: string
  state: string
  zip: string
  country: string
  phone: string
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function OrderSummary({
  items,
  total,
  shippingAmount,
  shippingRateName,
}: {
  items: CartItem[]
  total: number
  shippingAmount?: number
  shippingRateName?: string
}) {
  const displayTotal = total + (shippingAmount ?? 0)
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>Order summary</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div key={item.variationId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: '#374151' }}>
              {item.productName}
              {item.variationName && item.variationName !== item.productName && (
                <span style={{ color: '#9ca3af' }}> · {item.variationName}</span>
              )}
              <span style={{ color: '#9ca3af' }}> × {item.quantity}</span>
            </span>
            <span style={{ fontWeight: 500 }}>{formatPrice(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
        {shippingAmount !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}>
            <span>Shipping{shippingRateName ? ` (${shippingRateName})` : ''}</span>
            <span>{shippingAmount === 0 ? 'Free' : formatPrice(shippingAmount)}</span>
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 700,
          fontSize: 16,
          borderTop: '1px solid #e5e7eb',
          marginTop: 12,
          paddingTop: 12,
        }}
      >
        <span>Total</span>
        <span>{formatPrice(displayTotal)}</span>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 14,
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 14,
  fontWeight: 500,
}

function SandboxHint() {
  const [open, setOpen] = useState(false)
  return (
    <div
      style={{
        border: '1px solid #fbbf24',
        borderRadius: 8,
        background: '#fffbeb',
        fontSize: 13,
        marginBottom: 4,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 600,
          fontSize: 13,
          color: '#92400e',
        }}
      >
        <span>Sandbox mode — test credentials</span>
        <span style={{ fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', color: '#78350f', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Test cards (any future exp, any CVV)</p>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <tbody>
              {[
                ['Visa', '4111 1111 1111 1111'],
                ['Mastercard', '5105 1051 0510 5100'],
                ['Amex', '3714 4963 5398 431'],
                ['Discover', '6011 1111 1111 1117'],
              ].map(([brand, num]) => (
                <tr key={brand}>
                  <td style={{ paddingRight: 12, color: '#92400e', fontWeight: 500 }}>{brand}</td>
                  <td style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{num}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '10px 0 4px', fontWeight: 600 }}>Payload admin login</p>
          <p style={{ margin: 0, fontFamily: 'monospace' }}>
            dev@payloadcms.com / test
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#a16207' }}>
            Admin panel: <a href="/admin" style={{ color: '#92400e' }}>/admin</a>
          </p>
        </div>
      )}
    </div>
  )
}

const emptyAddress: ShippingAddress = {
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
  phone: '',
}

export function CheckoutForm({ applicationId, locationId }: Props) {
  const { items, total, clear } = useCart()
  const { user } = useAuth()
  const router = useRouter()
  const cardRef = useRef<SquareCard | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [guestEmail, setGuestEmail] = useState('')
  const [loyaltyOptIn, setLoyaltyOptIn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cardReady, setCardReady] = useState(false)

  // Shipping state
  const [needsShipping, setNeedsShipping] = useState(false)
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>(emptyAddress)
  const [availableRates, setAvailableRates] = useState<ShippingRate[]>([])
  const [selectedRateId, setSelectedRateId] = useState('')
  const [ratesLoading, setRatesLoading] = useState(false)

  const selectedRate = availableRates.find((r) => r.id === selectedRateId)

  const initSquare = useCallback(async () => {
    if (!window.Square || !applicationId || cardRef.current) return
    try {
      const payments = await window.Square.payments(applicationId, locationId)
      const card = await payments.card()
      await card.attach('#card-container')
      cardRef.current = card
      setCardReady(true)
    } catch (err) {
      setStatus({ type: 'error', text: `Failed to initialize payment form: ${String(err)}` })
    }
  }, [applicationId, locationId])

  useEffect(() => {
    if (window.Square) void initSquare()
  }, [initSquare])

  // Fetch shipping rates when the address zip/state is filled in
  useEffect(() => {
    if (!needsShipping || !shippingAddress.zip) return
    const controller = new AbortController()
    setRatesLoading(true)
    void fetch(`/api/square/shipping/rates?cartTotal=${total}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as { rates: ShippingRate[] }
        setAvailableRates(data.rates ?? [])
        if (data.rates?.length && !selectedRateId) {
          setSelectedRateId(data.rates[0]!.id)
        }
      })
      .catch(() => {})
      .finally(() => setRatesLoading(false))
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsShipping, shippingAddress.zip, total])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!cardRef.current) {
      setStatus({ type: 'error', text: 'Payment form not ready yet' })
      return
    }

    setLoading(true)
    setStatus(null)

    try {
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK' || !result.token) {
        setStatus({ type: 'error', text: `Tokenization failed: ${JSON.stringify(result.errors)}` })
        return
      }

      const response = await fetch('/api/square/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: result.token,
          cart: {
            items: items.map((i) => ({
              productId: i.productId,
              variationId: i.variationId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
            userId: user?.id ?? undefined,
            guestEmail: !user && guestEmail ? guestEmail : undefined,
            loyaltyOptIn: loyaltyOptIn || undefined,
            shippingAddress: needsShipping ? shippingAddress : undefined,
            shippingRateId: needsShipping && selectedRateId ? selectedRateId : undefined,
          },
        }),
      })

      const data = (await response.json()) as {
        order?: { id?: string; orderNumber?: string; [key: string]: unknown }
        error?: string
        warning?: string
      }

      if (response.ok && data.order) {
        clear()
        sessionStorage.setItem(`square_order_${data.order.id}`, JSON.stringify(data.order))
        router.push(`/order/${data.order.id}`)
        return
      } else if (data.warning) {
        setStatus({ type: 'warning', text: data.warning })
      } else {
        setStatus({ type: 'error', text: data.error ?? 'Checkout failed' })
      }
    } catch (err) {
      setStatus({ type: 'error', text: `Unexpected error: ${String(err)}` })
    } finally {
      setLoading(false)
    }
  }

  if (!applicationId) {
    return (
      <div style={{ padding: 20, background: '#fef2f2', borderRadius: 8, color: '#b91c1c' }}>
        Add <code>NEXT_PUBLIC_SQUARE_APPLICATION_ID</code> to <code>dev/.env</code> to enable
        payments. Find it in your Square Developer Dashboard under your application.
      </div>
    )
  }

  const payTotal = total + (needsShipping && selectedRate ? selectedRate.amount : 0)

  return (
    <div>
      <Script
        src="https://sandbox.web.squarecdn.com/v1/square.js"
        strategy="afterInteractive"
        onLoad={() => void initSquare()}
      />

      <SandboxHint />

      <OrderSummary
        items={items}
        total={total}
        shippingAmount={needsShipping && selectedRate ? selectedRate.amount : undefined}
        shippingRateName={selectedRate?.name}
      />

      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {user ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: '#f0fdf4',
              fontSize: 14,
              color: '#166534',
            }}
          >
            ✓ Signed in as <strong>{user.email as string}</strong> — your order will be linked to your account.
          </div>
        ) : (
          <div>
            <label style={labelStyle}>
              Email <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — for receipt)</span>
            </label>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="guest@example.com"
              style={inputStyle}
            />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af' }}>
              Or{' '}
              <a href="/login" style={{ color: '#111' }}>
                sign in
              </a>{' '}
              to link this order to your account and earn loyalty points.
            </p>
          </div>
        )}

        <label
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14 }}
        >
          <input
            type="checkbox"
            checked={loyaltyOptIn}
            onChange={(e) => setLoyaltyOptIn(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
          />
          <span>
            <span style={{ fontWeight: 500 }}>Join the loyalty program</span>
            <span style={{ color: '#6b7280', display: 'block', fontSize: 13 }}>
              Earn points on this order and redeem them for discounts on future purchases.
            </span>
          </span>
        </label>

        {/* Shipping toggle */}
        <label
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14 }}
        >
          <input
            type="checkbox"
            checked={needsShipping}
            onChange={(e) => setNeedsShipping(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
          />
          <span>
            <span style={{ fontWeight: 500 }}>Ship this order</span>
            <span style={{ color: '#6b7280', display: 'block', fontSize: 13 }}>
              Enter a shipping address and choose a delivery option.
            </span>
          </span>
        </label>

        {/* Shipping address form */}
        {needsShipping && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Shipping address</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>First name</label>
                <input
                  style={inputStyle}
                  value={shippingAddress.firstName}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, firstName: e.target.value }))}
                  required={needsShipping}
                />
              </div>
              <div>
                <label style={labelStyle}>Last name</label>
                <input
                  style={inputStyle}
                  value={shippingAddress.lastName}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, lastName: e.target.value }))}
                  required={needsShipping}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Address</label>
              <input
                style={inputStyle}
                placeholder="Street address"
                value={shippingAddress.address1}
                onChange={(e) => setShippingAddress((a) => ({ ...a, address1: e.target.value }))}
                required={needsShipping}
              />
            </div>

            <div>
              <label style={labelStyle}>Apt, suite, etc. <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input
                style={inputStyle}
                value={shippingAddress.address2}
                onChange={(e) => setShippingAddress((a) => ({ ...a, address2: e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>City</label>
                <input
                  style={inputStyle}
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, city: e.target.value }))}
                  required={needsShipping}
                />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input
                  style={inputStyle}
                  placeholder="CA"
                  maxLength={2}
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, state: e.target.value.toUpperCase() }))}
                  required={needsShipping}
                />
              </div>
              <div>
                <label style={labelStyle}>ZIP</label>
                <input
                  style={inputStyle}
                  value={shippingAddress.zip}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, zip: e.target.value }))}
                  required={needsShipping}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Phone <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="tel"
                style={inputStyle}
                value={shippingAddress.phone}
                onChange={(e) => setShippingAddress((a) => ({ ...a, phone: e.target.value }))}
              />
            </div>

            {/* Shipping rate selection */}
            {shippingAddress.zip && (
              <div>
                <label style={labelStyle}>Shipping method</label>
                {ratesLoading ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>Loading rates…</p>
                ) : availableRates.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {availableRates.map((rate) => (
                      <label
                        key={rate.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          border: `1px solid ${selectedRateId === rate.id ? '#111' : '#d1d5db'}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        <input
                          type="radio"
                          name="shippingRate"
                          value={rate.id}
                          checked={selectedRateId === rate.id}
                          onChange={() => setSelectedRateId(rate.id)}
                        />
                        <span style={{ flex: 1 }}>
                          {rate.name}
                          {rate.estimatedDays && (
                            <span style={{ color: '#6b7280' }}> · {rate.estimatedDays} days</span>
                          )}
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {rate.amount === 0 ? 'Free' : formatPrice(rate.amount)}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
                    Shipping rates are not available. Proceeding without a selected rate.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <label style={labelStyle}>Card</label>
          <div
            id="card-container"
            style={{
              minHeight: 89,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: 8,
              background: '#fff',
            }}
          />
          {!cardReady && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af' }}>Loading payment form…</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !cardReady}
          style={{
            padding: '12px',
            borderRadius: 6,
            border: 'none',
            background: loading || !cardReady ? '#9ca3af' : '#111',
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            cursor: loading || !cardReady ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Processing…' : `Pay ${formatPrice(payTotal)}`}
        </button>

        {status && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 6,
              fontSize: 14,
              background:
                status.type === 'success'
                  ? '#f0fdf4'
                  : status.type === 'warning'
                    ? '#fffbeb'
                    : '#fef2f2',
              color:
                status.type === 'success'
                  ? '#166534'
                  : status.type === 'warning'
                    ? '#92400e'
                    : '#b91c1c',
            }}
          >
            {status.text}
          </div>
        )}
      </form>
    </div>
  )
}
