'use client'

import Image from 'next/image'
import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'

import { useCart } from './_cart/CartContext.js'
import { useInventoryStream } from './_hooks/useInventoryStream.js'

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
}

function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function ItemCard({ item }: { item: CatalogItem }) {
  const { addItem } = useCart()
  const [selectedVariationId, setSelectedVariationId] = useState(
    item.variations[0]?.squareId ?? '',
  )
  const [added, setAdded] = useState(false)

  const selectedVariation = item.variations.find((v) => v.squareId === selectedVariationId)

  const handleAdd = () => {
    if (!selectedVariation) return
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
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Link href={`/item/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div
          style={{
            width: '100%',
            paddingTop: '66%',
            position: 'relative',
            background: '#f3f4f6',
          }}
        >
          {item.image?.url ? (
            <Image
              src={item.image.url}
              alt={item.image.alt ?? item.name}
              fill
              sizes="(min-width: 1100px) 340px, (min-width: 640px) 50vw, 100vw"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                fontSize: 32,
              }}
            >
              📦
            </div>
          )}
        </div>
      </Link>

      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link href={`/item/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{item.name}</h2>
        </Link>
        {item.description && (

          <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>
            {item.description}
          </p>
        )}

        {item.variations.length > 1 && (
          <select
            value={selectedVariationId}
            onChange={(e) => setSelectedVariationId(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            {item.variations.map((v) => (
              <option key={v.squareId} value={v.squareId}>
                {v.name} — {formatPrice(v.price, v.currency)}
              </option>
            ))}
          </select>
        )}

        {(() => {
          const outOfStock =
            selectedVariation?.inventoryCount !== undefined &&
            selectedVariation.inventoryCount <= 0

          return (
            <>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>
                  {selectedVariation ? formatPrice(selectedVariation.price, selectedVariation.currency) : '—'}
                </span>
                {outOfStock ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 99 }}>
                    Out of stock
                  </span>
                ) : selectedVariation?.inventoryCount !== undefined ? (
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {selectedVariation.inventoryCount} in stock
                  </span>
                ) : null}
              </div>

              <button
                onClick={handleAdd}
                disabled={outOfStock}
                style={{
                  padding: '10px',
                  borderRadius: 6,
                  border: 'none',
                  background: outOfStock ? '#e5e7eb' : added ? '#16a34a' : '#111',
                  color: outOfStock ? '#9ca3af' : '#fff',
                  fontWeight: 600,
                  cursor: outOfStock ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {outOfStock ? 'Out of stock' : added ? '✓ Added' : 'Add to Cart'}
              </button>
            </>
          )
        })()}
      </div>
    </div>
  )
}

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/catalog?limit=100&depth=1')
      .then((r) => r.json())
      .then((data: { docs?: CatalogItem[] }) => {
        setItems(data.docs ?? [])
      })
      .catch(() => setError('Failed to load catalog'))
      .finally(() => setLoading(false))
  }, [])

  const handleInventoryUpdate = useCallback(
    ({ variationSquareId, quantity }: { variationSquareId: string; quantity: number }) => {
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          variations: item.variations.map((v) =>
            v.squareId === variationSquareId ? { ...v, inventoryCount: quantity } : v,
          ),
        })),
      )
    },
    [],
  )

  const handleCatalogUpdate = useCallback(() => {
    fetch('/api/catalog?limit=100&depth=1')
      .then((r) => r.json())
      .then((data: { docs?: CatalogItem[] }) => setItems(data.docs ?? []))
      .catch(() => null)
  }, [])

  useInventoryStream({ onInventoryUpdate: handleInventoryUpdate, onCatalogUpdate: handleCatalogUpdate })

  if (loading) {
    return (
      <main style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading catalog…</main>
    )
  }

  if (error) {
    return <main style={{ padding: 40, color: 'red' }}>{error}</main>
  }

  if (items.length === 0) {
    return (
      <main style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        <p>No catalog items found.</p>
        <p style={{ fontSize: 13 }}>
          Trigger a sync at <code>POST /api/square/sync</code> or restart with{' '}
          <code>syncOnInit: true</code>.
        </p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 700 }}>Catalog</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 20,
        }}
      >
        {items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    </main>
  )
}
