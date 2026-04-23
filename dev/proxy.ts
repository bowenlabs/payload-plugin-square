import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * Expose the current pathname as a request header so the root layout (a Server
 * Component) can detect admin routes and skip its own <html>/<body> shell —
 * preventing the double-html nesting that Payload's RootLayout would cause.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set('x-pathname', request.nextUrl.pathname)
  return response
}

export const config = {
  // Run on every route except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
