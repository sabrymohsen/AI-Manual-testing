import { saveFile } from "@/lib/storage"

const FIGMA_API_BASE = "https://api.figma.com/v1"

async function getFigmaToken(apiToken?: string): Promise<string> {
  const token = apiToken || process.env.FIGMA_API_TOKEN
  if (!token) {
    throw new Error("Figma API token not configured")
  }
  return token
}

export async function fetchFigmaImage(
  fileKey: string,
  nodeId?: string,
  apiToken?: string
): Promise<{ imagePath: string; nodeName?: string }> {
  const token = await getFigmaToken(apiToken)

  // Get node info
  let nodeName: string | undefined
  if (nodeId) {
    const nodeRes = await fetch(
      `${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!nodeRes.ok) {
      throw new Error(`Figma API error: ${nodeRes.status}`)
    }

    const nodeData = await nodeRes.json()
    const node = nodeData.nodes?.[nodeId]
    nodeName = node?.document?.name
  }

  // Get image export
  const imageParams = nodeId
    ? `?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`
    : "?format=png&scale=2"

  const imageRes = await fetch(
    `${FIGMA_API_BASE}/images/${fileKey}${imageParams}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!imageRes.ok) {
    throw new Error(`Figma image export error: ${imageRes.status}`)
  }

  const imageData = await imageRes.json()
  const imageUrl = nodeId
    ? imageData.images?.[nodeId]
    : imageData.images?.[Object.keys(imageData.images || {})[0]]

  if (!imageUrl) {
    throw new Error("No image URL returned from Figma API")
  }

  // Download the image
  const downloadRes = await fetch(imageUrl)
  if (!downloadRes.ok) {
    throw new Error("Failed to download Figma image")
  }

  const buffer = Buffer.from(await downloadRes.arrayBuffer())
  const safeNodeId = nodeId ? `-${nodeId.replace(/:/g, "-")}` : ""
  const imagePath = await saveFile("visual-checks/figma", `figma-${fileKey}${safeNodeId}.png`, buffer)

  return { imagePath, nodeName }
}

export interface FigmaFrameInfo {
  nodeId: string
  name: string
  type: string
  pageName: string
  width?: number
  height?: number
}

export async function fetchFigmaFrames(
  fileKey: string,
  apiToken?: string
): Promise<FigmaFrameInfo[]> {
  const token = await getFigmaToken(apiToken)

  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch Figma file structure: ${res.status}`)
  }

  const fileData = await res.json()
  const results: FigmaFrameInfo[] = []

  function traverse(node: any, pageName: string) {
    if (node.type === "FRAME" || node.type === "COMPONENT") {
      results.push({
        nodeId: node.id,
        name: node.name || "Unnamed Frame",
        type: node.type,
        pageName,
        width: node.absoluteBoundingBox?.width || undefined,
        height: node.absoluteBoundingBox?.height || undefined
      })
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child, pageName)
      }
    }
  }

  const doc = fileData.document
  if (doc && doc.children) {
    for (const page of doc.children) {
      const pageName = page.name || "Unnamed Page"
      if (page.children) {
        for (const child of page.children) {
          traverse(child, pageName)
        }
      }
    }
  }

  return results
}

export async function fetchFigmaImagesBulk(
  fileKey: string,
  nodeIds: string[],
  apiToken?: string
): Promise<Map<string, string>> {
  const token = await getFigmaToken(apiToken)
  const resultsMap = new Map<string, string>()

  if (nodeIds.length === 0) return resultsMap

  // Figma limits bulk image requests or we chunk them to avoid hitting URL limit size
  const chunks: string[][] = []
  const chunkSize = 50
  for (let i = 0; i < nodeIds.length; i += chunkSize) {
    chunks.push(nodeIds.slice(i, i + chunkSize))
  }

  for (const chunk of chunks) {
    const idsParam = chunk.map(encodeURIComponent).join(",")
    const res = await fetch(
      `${FIGMA_API_BASE}/images/${fileKey}?ids=${idsParam}&format=png&scale=2`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!res.ok) {
      throw new Error(`Failed to fetch bulk Figma images: ${res.status}`)
    }

    const data = await res.json()
    const images = data.images || {}

    for (const nodeId of chunk) {
      const imageUrl = images[nodeId]
      if (!imageUrl) continue

      const downloadRes = await fetch(imageUrl)
      if (!downloadRes.ok) continue

      const buffer = Buffer.from(await downloadRes.arrayBuffer())
      const safeNodeId = nodeId.replace(/:/g, "-")
      const imagePath = await saveFile("visual-checks/figma", `figma-${fileKey}-${safeNodeId}.png`, buffer)
      resultsMap.set(nodeId, imagePath)
    }
  }

  return resultsMap
}
