import { describe, it, expect } from "vitest"
import { parseFigmaUrl } from "@/lib/figma/url-parser"

describe("figma URL parser", () => {
  it("should parse file URL", () => {
    const result = parseFigmaUrl("https://www.figma.com/file/ABC123/MyDesign")
    expect(result.fileKey).toBe("ABC123")
    expect(result.nodeId).toBeUndefined()
  })

  it("should parse file URL with node-id", () => {
    const result = parseFigmaUrl("https://www.figma.com/file/ABC123/MyDesign?node-id=123-456")
    expect(result.fileKey).toBe("ABC123")
    expect(result.nodeId).toBe("123-456")
  })

  it("should parse design URL", () => {
    const result = parseFigmaUrl("https://www.figma.com/design/ABC123/MyDesign")
    expect(result.fileKey).toBe("ABC123")
  })

  it("should throw on invalid URL", () => {
    expect(() => parseFigmaUrl("https://example.com")).toThrow("Invalid Figma URL")
  })
})
