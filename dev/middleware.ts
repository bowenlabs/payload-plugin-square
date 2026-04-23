// Superseded by proxy.ts (Next.js 16+ renamed the file convention).
// This file is intentionally a no-op — see proxy.ts for the active implementation.
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(_req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  // Empty matcher — this middleware never runs on any route.
  matcher: [],
}
