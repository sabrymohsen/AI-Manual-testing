export interface FigmaUrlParts {
  fileKey: string
  nodeId?: string
}

export function parseFigmaUrl(url: string): FigmaUrlParts {
  try {
    const parsed = new URL(url)

    // Pattern: https://www.figma.com/file/ABC123/FileName
    // Pattern: https://www.figma.com/file/ABC123/FileName?node-id=123-456
    // Pattern: https://www.figma.com/design/ABC123/FileName
    // Pattern: https://www.figma.com/design/ABC123/FileName?node-id=123-456

    const fileMatch = parsed.pathname.match(/\/file\/([^/]+)/)
    const designMatch = parsed.pathname.match(/\/design\/([^/]+)/)

    const fileKey = fileMatch?.[1] || designMatch?.[1]

    if (!fileKey) {
      throw new Error("Invalid Figma URL: could not extract file key")
    }

    const nodeId = parsed.searchParams.get("node-id") || undefined

    return { fileKey, nodeId }
  } catch (error) {
    throw new Error(
      `Invalid Figma URL: ${error instanceof Error ? error.message : "parse error"}`
    )
  }
}
