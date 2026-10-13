import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This function can be marked `async` if using `await` inside
export function proxy(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;

  // Paths that are considered public auth pages
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
  
  // Public paths or Static assets that shouldn't be blocked
  const isPublicAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico') || pathname.startsWith('/api');

  // Oturum olsa da olmasa da açılabilen sayfalar: aydınlatma metni ve şifre sıfırlama
  // (sıfırlama bağlantısı e-postadan açılır; kullanıcı başka bir oturumdayken de çalışmalı).
  const isOpenPage = ['/gizlilik', '/forgot-password', '/reset-password'].some((p) => pathname.startsWith(p));

  if (isPublicAsset || isOpenPage) {
    return NextResponse.next();
  }

  // If no token exists, the user is unauthenticated
  if (!token) {
    // If they try to access protected paths (like /dashboard), redirect to /login
    if (!isAuthPage && pathname !== '/') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // Let them stay on public/auth pages
    return NextResponse.next();
  }

  // If token exists (authenticated), prevent access to login/register
  if (isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Root mapping
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

// Ensure the proxy only runs for paths underneath
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
