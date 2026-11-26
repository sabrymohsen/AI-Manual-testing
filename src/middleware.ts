import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifyToken } from "@/lib/auth"

const PUBLIC_PATHS = ["/", "/opengraph-image", "/icon.svg", "/favicon.png", "/apple-touch-icon.png", "/login", "/register", "/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/health"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith("/api/auth/"))) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/storage/") ||
    pathname.startsWith("/api/exports/") ||
    // CI pipelines call these with a project token instead of a session
    // cookie; the routes verify the token themselves (src/lib/hub-ci.ts).
    pathname.startsWith("/api/hub/ci/") ||
    // Public annotation share links (page + their statically-served images)
    pathname.startsWith("/share/") ||
    pathname.startsWith("/uploads/shares/")
  ) {
    return NextResponse.next()
  }

  // Check session token for protected routes
  const token = request.cookies.get("session_token")?.value
  
  let user = null
  if (token) {
    user = await verifyToken(token)
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    // Redirect against the PUBLIC origin. Behind Railway's proxy request.url
    // can carry the internal container host, which browsers can't reach —
    // honor x-forwarded-* when present.
    const host = request.headers.get("x-forwarded-host") ?? request.nextUrl.host
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")
    return NextResponse.redirect(`${proto}://${host}/login`)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
