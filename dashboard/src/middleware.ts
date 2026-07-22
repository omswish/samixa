import { NextRequest, NextResponse } from 'next/server';

function buildForwardedUrl(request: NextRequest, pathname: string) {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3001';
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
  return new URL(`${forwardedProto}://${forwardedHost}${pathname}`);
}

function getSurfaceSessionCookieName(surface: 'operator' | 'admin') {
  return surface === 'admin' ? 'itdash_session_admin' : 'itdash_session_operator';
}

export function middleware(request: NextRequest) {
  const surface = request.headers.get('x-itdash-surface') === 'admin' ? 'admin' : 'operator';
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(getSurfaceSessionCookieName(surface))?.value);

  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  if (pathname === '/login') {
    if (hasSessionCookie) {
      return NextResponse.redirect(buildForwardedUrl(request, surface === 'admin' ? '/admin' : '/'));
    }

    return NextResponse.next();
  }

  if (surface === 'admin' && pathname === '/') {
    return NextResponse.redirect(buildForwardedUrl(request, hasSessionCookie ? '/admin' : '/login'));
  }

  if (surface !== 'admin' && pathname.startsWith('/admin')) {
    return NextResponse.redirect(buildForwardedUrl(request, hasSessionCookie ? '/' : '/login'));
  }

  if (!hasSessionCookie) {
    return NextResponse.redirect(buildForwardedUrl(request, '/login'));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
