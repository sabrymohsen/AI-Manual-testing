import { NextRequest } from "next/server"
import { verifyCsrfToken } from "./csrf"

export function validateCsrf(request: NextRequest): boolean {
  // Check header first (for AJAX requests)
  const headerToken = request.headers.get("x-csrf-token")
  if (headerToken && verifyCsrfToken(headerToken)) {
    return true
  }

  // Check cookie (for form submissions)
  const cookieToken = request.cookies.get("csrf_token")?.value
  if (cookieToken && verifyCsrfToken(cookieToken)) {
    return true
  }

  return false
}
