import Link from 'next/link'
import React from 'react'

import { CheckoutForm } from './CheckoutForm.js'

export default function CheckoutPage() {
  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/cart" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
          ← Back to cart
        </Link>
        <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 700 }}>Checkout</h1>
      </div>
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <CheckoutForm
          applicationId={process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? ''}
          locationId={process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? ''}
        />
      </div>
    </main>
  )
}
