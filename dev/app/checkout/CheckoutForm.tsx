'use client'

import Script from 'next/script'
import React, { useCallback, useEffect, useRef, useState } from 'react'

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

function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function OrderSummary({ items, total }: { items: CartItem[]; total: number }) {
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
        <span>{formatPrice(total)}</span>
      </div>
    </div>
  )
}

export function CheckoutForm({ applicationId, locationId }: Props) {
  const { items, total, clear } = useCart()
  const cardRef = useRef<SquareCard | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [guestEmail, setGuestEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [cardReady, setCardReady] = useState(false)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)

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
            guestEmail: guestEmail || undefined,
          },
        }),
      })

      const data = (await response.json()) as {
        order?: { orderNumber?: string }
        error?: string
        warning?: string
      }

      if (response.ok && data.order) {
        setOrderNumber(data.order.orderNumber ?? null)
        setStatus({ type: 'success', text: `Order ${data.order.orderNumber} placed successfully!` })
        clear()
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

  if (orderNumber) {
    return (
      <div style={{ padding: 32, background: '#f0fdf4', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h2 style={{ margin: '0 0 8px' }}>Payment successful</h2>
        <p style={{ margin: 0, color: '#374151' }}>Order <strong>{orderNumber}</strong> has been placed.</p>
      </div>
    )
  }

  return (
    <div>
      <Script
        src="https://sandbox.web.squarecdn.com/v1/square.js"
        strategy="afterInteractive"
        onLoad={() => void initSquare()}
      />

      <OrderSummary items={items} total={total} />

      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            Email <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — guest checkout)</span>
          </label>
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder="guest@example.com"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            Card
          </label>
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
          {loading ? 'Processing…' : `Pay ${formatPrice(total)}`}
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
