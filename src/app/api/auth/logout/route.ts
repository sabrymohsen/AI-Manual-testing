import { NextResponse } from "next/server"
import { clearSessionCookie } from "@/lib/auth"

export async function POST(request: Request) {
  clearSessionCookie()
  const requestUrl = new URL(request.url)
  return NextResponse.redirect(new URL("/", requestUrl.origin), {
    status: 303,
  })
}
