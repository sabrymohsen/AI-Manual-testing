import { NextResponse } from "next/server"
import { registerUser, setSessionCookie } from "@/lib/auth"
import { registerSchema } from "@/schemas"
import { badRequestResponse } from "@/lib/api-guards"
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit"
import { generateCsrfToken } from "@/lib/csrf"

export async function POST(request: Request) {
  try {
    // Rate limit: 3 registration attempts per IP per hour
    const clientId = getClientIdentifier(request)
    const rateLimit = await checkRateLimit(`register:${clientId}`, {
      windowMs: 60 * 60 * 1000,
      maxRequests: 3,
      keyPrefix: "ratelimit",
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)) } }
      )
    }

    const body = await request.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { email, password, name } = parsed.data
    const session = await registerUser(email, password, name)
    setSessionCookie(session.token)

    // Generate CSRF token for subsequent requests
    const csrfToken = generateCsrfToken()

    const response = NextResponse.json({ user: session.user, csrfToken }, { status: 201 })
    response.cookies.set("csrf_token", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed"
    const status = message === "Email already registered" ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
