'use client'

import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { useCart } from '../_cart/CartContext.js'

function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export default function CartPage() {
  const { items, updateQty, removeItem, total, clear } = useCart()

  if (items.length === 0) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: 18 }}>Your cart is empty.</p>
        <Link
          href="/"
          style={{ color: '#111', fontWeight: 600, textDecoration: 'underline' }}
        >
          Browse catalog
        </Link>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 700 }}>Cart</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map((item) => (
          <div
            key={item.variationId}
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 6,
                background: '#f3f4f6',
                flexShrink: 0,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {item.imageUrl ? (
                <Image src={item.imageUrl} alt={item.productName} fill sizes="64px" style={{ objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                  📦
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{item.productName}</div>
              {item.variationName && item.variationName !== item.productName && (
                <div style={{ fontSize: 13, color: '#6b7280' }}>{item.variationName}</div>
              )}
              <div style={{ fontSize: 13, color: '#6b7280' }}>{formatPrice(item.unitPrice)} each</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => updateQty(item.variationId, item.quantity - 1)}
                style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 16 }}
              >
                −
              </button>
              <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
              <button
                onClick={() => updateQty(item.variationId, item.quantity + 1)}
                style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 16 }}
              >
                +
              </button>
            </div>

            <div style={{ minWidth: 64, textAlign: 'right', fontWeight: 700 }}>
              {formatPrice(item.unitPrice * item.quantity)}
            </div>

            <button
              onClick={() => removeItem(item.variationId)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, padding: 4 }}
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          padding: '20px 24px',
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 18, fontWeight: 700 }}>
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={clear}
            style={{ flex: 1, padding: '10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#6b7280' }}
          >
            Clear cart
          </button>
          <Link
            href="/checkout"
            style={{
              flex: 2,
              padding: '10px',
              borderRadius: 6,
              background: '#111',
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
              display: 'block',
            }}
          >
            Checkout →
          </Link>
        </div>
      </div>
    </main>
  )
}
