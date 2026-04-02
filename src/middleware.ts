import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Route protection middleware.
 *
 * - Public routes: accessible without authentication
 * - Protected routes: require a valid session cookie
 * - Logged-in redirects: /login and /register redirect to / when authenticated
 */

// Routes that do not require authentication
const PUBLIC_PREFIXES = [
  '/home',
  '/pricing',
  '/login',
  '/register',
  '/setup',
  '/docs',
  '/api/auth/',
  '/_next/',
  '/brand/',
  '/favicon',
  '/icon',
  '/apple-icon',
  '/manifest',
  '/robots',
  '/sitemap',
]

// Static file extensions that should always pass through
const STATIC_EXTENSIONS = /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot|map|json)$/

// Session cookie names (must match session-cookie.ts)
const SESSION_COOKIE_NAMES = ['__Host-mc-session', 'mc-session']

function hasSessionCookie(request: NextRequest): boolean {
  for (const name of SESSION_COOKIE_NAMES) {
    if (request.cookies.get(name)?.value) return true
  }
  return false
}

function isPublicRoute(pathname: string): boolean {
  // Static assets always pass through
  if (STATIC_EXTENSIONS.test(pathname)) return true

  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix)) return true
  }

  return false
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = hasSessionCookie(request)

  // Public routes: allow through
  if (isPublicRoute(pathname)) {
    // If logged in and visiting /login or /register, redirect to dashboard
    if (hasSession && (pathname === '/login' || pathname === '/register')) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    // If logged in and visiting /setup, redirect to dashboard (setup already done)
    if (hasSession && pathname === '/setup') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Protected routes: require session cookie
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    // Preserve the original destination so login can redirect back
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icon.png, apple-icon.png (app icons)
     */
    '/((?!_next/static|_next/image).*)',
  ],
}
