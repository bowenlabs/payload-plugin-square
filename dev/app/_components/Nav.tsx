'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'

import { useAuth } from '../_auth/AuthContext.js'
import { useCart } from '../_cart/CartContext.js'

export function Nav() {
  const { count } = useCart()
  const { user, loading, logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {!loading && (
          user ? (
            <>
              <Link
                href="/account"
                style={{ fontSize: 14, textDecoration: 'none', color: '#374151' }}
              >
                👤 {user.email as string}
              </Link>
              <button
                onClick={() => void handleLogout()}
                style={{
                  fontSize: 14,
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              style={{ fontSize: 14, textDecoration: 'none', color: '#374151' }}
            >
              Log in
            </Link>
          )
        )}

        <Link
          href="/subscriptions"
          style={{ fontSize: 14, textDecoration: 'none', color: '#374151' }}
        >
          Plans
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
      </div>
    </nav>
  )
}
