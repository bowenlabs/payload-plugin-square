import { headers } from 'next/headers'
import React from 'react'

import { AuthProvider } from './_auth/AuthContext.js'
import { CartProvider } from './_cart/CartContext.js'
import { Nav } from './_components/Nav.js'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? '/'

  // Payload's admin layout renders its own <html>/<body> shell (via @payloadcms/next RootLayout).
  // Skipping our shell for admin routes prevents two <html> elements from nesting, which
  // causes browser parse errors and React hydration mismatches.
  if (pathname.startsWith('/admin')) {
    return <>{children}</>
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#f9fafb' }}>
        <AuthProvider>
          <CartProvider>
            <Nav />
            {children}
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
