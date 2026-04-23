'use client'

import Link from 'next/link'
import React from 'react'

import { useCart } from '../_cart/CartContext.js'

export function Nav() {
  const { count } = useCart()

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid #e5e7eb',
        background: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Link href="/" style={{ fontWeight: 700, fontSize: 18, textDecoration: 'none', color: '#111' }}>
        Square Store
      </Link>
      <Link
        href="/cart"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          textDecoration: 'none',
          color: '#111',
          fontFamily: 'sans-serif',
        }}
      >
        <span style={{ fontSize: 20 }}>🛒</span>
        {count > 0 && (
          <span
            style={{
              background: '#111',
              color: '#fff',
              borderRadius: '50%',
              width: 20,
              height: 20,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {count}
          </span>
        )}
      </Link>
    </nav>
  )
}
