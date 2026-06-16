import { saveFile } from "@/lib/storage"

const FIGMA_API_BASE = "https://api.figma.com/v1"

async function getFigmaToken(): Promise<string> {
  const token = process.env.FIGMA_API_TOKEN
  if (!token) {
    throw new Error("Figma API token not configured")
  }
  return token
}

export async function fetchFigmaImage(
  fileKey: string,
  nodeId?: string
): Promise<{ imagePath: string; nodeName?: string }> {
  const token = await getFigmaToken()

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
  const imagePath = await saveFile("figma", `figma-${fileKey}.png`, buffer)

  return { imagePath, nodeName }
}
