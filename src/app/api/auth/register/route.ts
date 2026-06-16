import { NextResponse } from "next/server"
import { registerUser, setSessionCookie } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      )
    }

    const session = await registerUser(email, password, name)
    setSessionCookie(session.token)

    return NextResponse.json(
      { user: session.user },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed"
    const status = message === "Email already registered" ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
