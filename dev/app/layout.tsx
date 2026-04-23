import React from 'react'

import { CartProvider } from './_cart/CartContext.js'
import { Nav } from './_components/Nav.js'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#f9fafb' }}>
        <CartProvider>
          <Nav />
          {children}
        </CartProvider>
      </body>
    </html>
  )
}
