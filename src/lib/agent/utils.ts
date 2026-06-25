export function isValidUrl(urlStr: string): boolean {
  try {
    new URL(urlStr)
    return true
  } catch {
    return false
  }
}

export function cleanText(text: string | null | undefined, limit = 100): string {
  if (!text) return ""
  return text.trim().substring(0, limit)
}
