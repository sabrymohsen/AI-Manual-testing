const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-session-id",
])

const SENSITIVE_PARAMS = new Set([
  "password",
  "secret",
  "token",
  "api_key",
  "api_key_secret",
  "access_token",
  "refresh_token",
  "session_id",
  "auth_token",
])

const MASKED = "***MASKED***"

export function sanitizeHeaders(
  headers: Record<string, string> | null | undefined
): Record<string, string> | null {
  if (!headers) return null

  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = MASKED
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, MASKED)
      }
    }
    return parsed.toString()
  } catch {
    const masked = url
    for (const param of Array.from(SENSITIVE_PARAMS)) {
      const regex = new RegExp(`(${param}=)[^&]+`, "gi")
      return masked.replace(regex, `$1${MASKED}`)
    }
    return url
  }
}

export function sanitizeBody(
  body: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!body) return null
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
      sanitized[key] = MASKED
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeBody(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

export function sanitizeLogMessage(message: string): string {
  let sanitized = message
  for (const param of Array.from(SENSITIVE_PARAMS)) {
    const regex = new RegExp(`(${param}[=:]["']?)[^\\s"'&,;]+`, "gi")
    sanitized = sanitized.replace(regex, `$1${MASKED}`)
  }
  const headerRegex = /(Authorization|Bearer)\s+\S+/gi
  sanitized = sanitized.replace(headerRegex, `$1 ${MASKED}`)
  return sanitized
}
