'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

export interface CartItem {
  variationId: string
  productId: string
  productName: string
  variationName: string
  unitPrice: number
  quantity: number
  imageUrl?: string
}

interface CartContextValue {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  updateQty: (variationId: string, qty: number) => void
  removeItem: (variationId: string) => void
  clear: () => void
  total: number
  count: number
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('square-cart')
      if (stored) setItems(JSON.parse(stored) as CartItem[])
    } catch {}
  }, [])

  const persist = (next: CartItem[]) => {
    setItems(next)
    localStorage.setItem('square-cart', JSON.stringify(next))
  }

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.variationId === item.variationId)
      const next = existing
        ? prev.map((i) =>
            i.variationId === item.variationId ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [...prev, { ...item, quantity: 1 }]
      localStorage.setItem('square-cart', JSON.stringify(next))
      return next
    })
  }, [])

  const updateQty = useCallback((variationId: string, qty: number) => {
    setItems((prev) => {
      const next =
        qty <= 0
          ? prev.filter((i) => i.variationId !== variationId)
          : prev.map((i) => (i.variationId === variationId ? { ...i, quantity: qty } : i))
      localStorage.setItem('square-cart', JSON.stringify(next))
      return next
    })
  }, [])

  const removeItem = useCallback((variationId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.variationId !== variationId)
      localStorage.setItem('square-cart', JSON.stringify(next))
      return next
    })
  }, [])

  const clear = useCallback(() => {
    persist([])
  }, [])

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
  const count = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clear, total, count }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
