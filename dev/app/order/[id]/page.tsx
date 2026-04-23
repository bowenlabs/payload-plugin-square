'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import React, { useEffect, useState } from 'react'

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
  lineItems: LineItem[]
  guestEmail?: string
}

function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

export default function OrderConfirmationPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem(`square_order_${id}`)
    if (stored) {
      try {
        setOrder(JSON.parse(stored) as Order)
      } catch {
        // ignore
      }
    }
  }, [id])

  if (!order) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Order placed</h1>
        <p style={{ color: '#6b7280' }}>Your order has been confirmed.</p>
        <Link href="/" style={{ color: '#111', fontWeight: 600 }}>← Back to catalog</Link>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
      <div
        style={{
          background: '#f0fdf4',
          borderRadius: 12,
          padding: '24px 28px',
          marginBottom: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Payment successful</h1>
        <p style={{ margin: 0, color: '#166534', fontSize: 14 }}>
          Order <strong>{order.orderNumber}</strong> has been placed.
        </p>
        {order.guestEmail && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#15803d' }}>
            A confirmation has been sent to {order.guestEmail}.
          </p>
        )}
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>
          Order summary
        </div>
        <div style={{ padding: '0 20px' }}>
          {order.lineItems.map((li, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '14px 0',
                borderBottom: i < order.lineItems.length - 1 ? '1px solid #f3f4f6' : 'none',
                fontSize: 14,
              }}
            >
              <span>
                <span style={{ fontWeight: 500 }}>{li.productName}</span>
                {li.variationName && li.variationName !== li.productName && (
                  <span style={{ color: '#9ca3af' }}> · {li.variationName}</span>
                )}
                <span style={{ color: '#9ca3af' }}> × {li.quantity}</span>
              </span>
              <span>{formatPrice(li.totalPrice, order.currency)}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 14,
          }}
        >
          {order.tax !== undefined && order.tax > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                <span>Subtotal</span>
                <span>{formatPrice(order.subtotal, order.currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                <span>Tax</span>
                <span>{formatPrice(order.tax, order.currency)}</span>
              </div>
            </>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            <span>Total</span>
            <span>{formatPrice(order.total, order.currency)}</span>
          </div>
        </div>
      </div>

      <Link
        href="/"
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '12px',
          borderRadius: 6,
          background: '#111',
          color: '#fff',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Continue shopping
      </Link>
    </main>
  )
}
