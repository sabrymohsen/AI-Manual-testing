import { describe, it, expect, vi, beforeAll } from "vitest"

// The module pulls in Prisma and the provider registry at import time; none of
// that is needed to exercise pure URL building.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/integrations/core/load-integration", () => ({ loadIntegration: vi.fn() }))

let absoluteAssetUrl: (ref: string) => string

beforeAll(async () => {
  process.env.NEXTAUTH_URL = "https://qa.example.com"
  ;({ absoluteAssetUrl } = await import("@/lib/integrations/core/sync-bug-report"))
})

describe("absoluteAssetUrl (bug Session Recording link)", () => {
  it("leaves an externally hosted recording URL untouched", () => {
    // The regression: APP_URL used to be glued onto the front of this, giving
    // "https://qa.example.comhttps://jam.dev/c/..." in the tracker description.
    expect(absoluteAssetUrl("https://jam.dev/c/abc-123")).toBe("https://jam.dev/c/abc-123")
    expect(absoluteAssetUrl("http://loom.com/share/xyz")).toBe("http://loom.com/share/xyz")
  })

  it("is case-insensitive about the scheme", () => {
    expect(absoluteAssetUrl("HTTPS://jam.dev/c/abc")).toBe("HTTPS://jam.dev/c/abc")
  })

  it("makes an uploaded file's path absolute against the app", () => {
    expect(absoluteAssetUrl("/uploads/videos/run-9.webm")).toBe(
      "https://qa.example.com/uploads/videos/run-9.webm"
    )
  })

  it("routes a storage-relative path through the authenticated file proxy", () => {
    expect(absoluteAssetUrl("recordings/liveqa-42.webm")).toBe(
      "https://qa.example.com/api/files/recordings%2Fliveqa-42.webm"
    )
  })

  it("does not double up the proxy prefix", () => {
    expect(absoluteAssetUrl("/api/files/recordings%2Fx.webm")).toBe(
      "https://qa.example.com/api/files/recordings%2Fx.webm"
    )
  })
})
