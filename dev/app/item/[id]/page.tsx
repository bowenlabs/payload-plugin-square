'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'

import { useCart } from '../../_cart/CartContext.js'
import { useInventoryStream } from '../../_hooks/useInventoryStream.js'

interface Variation {
  id: string
  squareId: string
  name: string
  price: number
  currency: string
  inventoryCount?: number
}

interface CatalogItem {
  id: string
  squareId: string
  name: string
  description?: string
  variations: Variation[]
  image?: { url: string; alt?: string } | null
  lastSyncedAt?: string
}

function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

export default function ItemPage() {
  const { id } = useParams<{ id: string }>()
  const { addItem } = useCart()
  const [item, setItem] = useState<CatalogItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVariationId, setSelectedVariationId] = useState('')
  const [added, setAdded] = useState(false)

  useEffect(() => {
    fetch(`/api/catalog/${id}?depth=1`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found')
        return r.json()
      })
      .then((data: CatalogItem) => {
        setItem(data)
        setSelectedVariationId(data.variations[0]?.squareId ?? '')
      })
      .catch(() => setItem(null))
      .finally(() => setLoading(false))
  }, [id])

  const handleInventoryUpdate = useCallback(
    ({ variationSquareId, quantity }: { variationSquareId: string; quantity: number }) => {
      setItem((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          variations: prev.variations.map((v) =>
            v.squareId === variationSquareId ? { ...v, inventoryCount: quantity } : v,
          ),
        }
      })
    },
    [],
  )

  const handleCatalogUpdate = useCallback(() => {
    fetch(`/api/catalog/${id}?depth=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CatalogItem | null) => { if (data) setItem(data) })
      .catch(() => null)
  }, [id])

  useInventoryStream({ onInventoryUpdate: handleInventoryUpdate, onCatalogUpdate: handleCatalogUpdate })

  if (loading) {
    return <main style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading…</main>
  }

  if (!item) {
    return (
      <main style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>Item not found.</p>
        <Link href="/" style={{ color: '#111', fontWeight: 600 }}>← Back to catalog</Link>
      </main>
    )
  }

  const selectedVariation = item.variations.find((v) => v.squareId === selectedVariationId)
  const outOfStock =
    selectedVariation?.inventoryCount !== undefined && selectedVariation.inventoryCount <= 0

  const handleAdd = () => {
    if (!selectedVariation || outOfStock) return
    addItem({
      variationId: selectedVariation.squareId,
      productId: item.squareId,
      productName: item.name,
      variationName: selectedVariation.name,
      unitPrice: selectedVariation.price,
      imageUrl: item.image?.url,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <Link href="/" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
        ← Back to catalog
      </Link>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 40,
          marginTop: 24,
        }}
      >
        {/* Image */}
        <div
          style={{
            position: 'relative',
            paddingTop: '75%',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#f3f4f6',
          }}
        >
          {item.image?.url ? (
            <Image
              src={item.image.url}
              alt={item.image.alt ?? item.name}
              fill
              sizes="(min-width: 900px) 420px, 100vw"
              style={{ objectFit: 'cover' }}
              priority
            loading="eager"
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 64,
                color: '#d1d5db',
              }}
            >
              📦
            </div>
          )}
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700 }}>{item.name}</h1>
            {item.description && (
              <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.6 }}>{item.description}</p>
            )}
          </div>

          {/* Variation selector */}
          {item.variations.length > 1 && (
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
                Option
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {item.variations.map((v) => {
                  const oos = v.inventoryCount !== undefined && v.inventoryCount <= 0
                  const active = v.squareId === selectedVariationId
                  return (
                    <button
                      key={v.squareId}
                      onClick={() => setSelectedVariationId(v.squareId)}
                      disabled={oos}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        border: active ? '2px solid #111' : '1px solid #d1d5db',
                        background: active ? '#111' : '#fff',
                        color: oos ? '#9ca3af' : active ? '#fff' : '#111',
                        fontWeight: active ? 600 : 400,
                        cursor: oos ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        textDecoration: oos ? 'line-through' : 'none',
                      }}
                    >
                      {v.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Price + stock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>
              {selectedVariation
                ? formatPrice(selectedVariation.price, selectedVariation.currency)
                : '—'}
            </span>
            {outOfStock ? (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#dc2626',
                  background: '#fef2f2',
                  padding: '3px 10px',
                  borderRadius: 99,
                }}
              >
                Out of stock
              </span>
            ) : selectedVariation?.inventoryCount !== undefined ? (
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {selectedVariation.inventoryCount} in stock
              </span>
            ) : null}
          </div>

          <button
            onClick={handleAdd}
            disabled={outOfStock}
            style={{
              padding: '14px',
              borderRadius: 8,
              border: 'none',
              background: outOfStock ? '#e5e7eb' : added ? '#16a34a' : '#111',
              color: outOfStock ? '#9ca3af' : '#fff',
              fontWeight: 700,
              fontSize: 16,
              cursor: outOfStock ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {outOfStock ? 'Out of stock' : added ? '✓ Added to cart' : 'Add to Cart'}
          </button>

          {item.lastSyncedAt && (
            <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
              Last synced {new Date(item.lastSyncedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
