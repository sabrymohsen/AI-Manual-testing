import { describe, it, expect } from "vitest"
import { sanitizeHeaders, sanitizeUrl, sanitizeLogMessage } from "@/lib/sanitize"

describe("sanitize module", () => {
  describe("sanitizeHeaders", () => {
    it("should mask authorization header", () => {
      const result = sanitizeHeaders({ Authorization: "Bearer secret-token-123" })
      expect(result?.Authorization).toBe("***MASKED***")
    })

    it("should mask cookie header", () => {
      const result = sanitizeHeaders({ Cookie: "session=abc123" })
      expect(result?.Cookie).toBe("***MASKED***")
    })

    it("should keep non-sensitive headers", () => {
      const result = sanitizeHeaders({ "Content-Type": "application/json" })
      expect(result?.["Content-Type"]).toBe("application/json")
    })

    it("should handle null input", () => {
      expect(sanitizeHeaders(null)).toBeNull()
    })
  })

  describe("sanitizeUrl", () => {
    it("should mask token in query params", () => {
      const url = "https://example.com/api?token=abc123&key=value"
      const result = sanitizeUrl(url)
      expect(result).not.toContain("abc123")
      expect(result).toContain("***MASKED***")
    })

    it("should keep non-sensitive URLs", () => {
      const url = "https://example.com/page"
      expect(sanitizeUrl(url)).toBe(url)
    })
  })

  describe("sanitizeLogMessage", () => {
    it("should mask bearer tokens in log messages", () => {
      const msg = "Authorization: Bearer mytoken123"
      const result = sanitizeLogMessage(msg)
      expect(result).not.toContain("mytoken123")
      expect(result).toContain("***MASKED***")
    })

    it("should mask password values", () => {
      const msg = 'password=supersecret'
      const result = sanitizeLogMessage(msg)
      expect(result).not.toContain("supersecret")
    })
  })
})
