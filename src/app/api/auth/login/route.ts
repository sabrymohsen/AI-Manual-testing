import { NextResponse } from "next/server"
import { loginUser } from "@/lib/auth"
import { loginSchema } from "@/schemas"
import { badRequestResponse } from "@/lib/api-guards"
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit"
import { generateCsrfToken } from "@/lib/csrf"

export async function POST(request: Request) {
  try {
    // Rate limit: 5 login attempts per IP per minute
    const clientId = getClientIdentifier(request)
    const rateLimit = await checkRateLimit(`login:${clientId}`, {
      windowMs: 60 * 1000,
      maxRequests: 5,
      keyPrefix: "ratelimit",
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)) } }
      )
    }

    const body = await request.json()
    const parsed = loginSchema.safeParse(body)

    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { email, password } = parsed.data
    const session = await loginUser(email, password)

    // Generate CSRF token for subsequent requests
    const csrfToken = generateCsrfToken()

    const response = NextResponse.json({ user: session.user, csrfToken })

    // Set session cookie directly on response so it's guaranteed to reach the browser
    response.cookies.set("session_token", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    })

    response.cookies.set("csrf_token", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
