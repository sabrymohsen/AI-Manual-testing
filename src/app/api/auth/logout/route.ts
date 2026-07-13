import { NextResponse } from "next/server"
import { clearSessionCookie } from "@/lib/auth"

export async function POST() {
  clearSessionCookie()
  // Relative Location, NOT new URL("/", request.url): behind Railway's proxy
  // request.url carries the internal container host (e.g. abc22d290081:8080),
  // which the browser can't reach. A relative redirect always lands on
  // whatever host the user is actually browsing.
  return new NextResponse(null, { status: 303, headers: { Location: "/" } })
}
