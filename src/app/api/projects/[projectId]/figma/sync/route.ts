import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { parseFigmaUrl } from "@/lib/figma/url-parser"
import { fetchFigmaImage } from "@/lib/figma/api-client"
import { encryptSecret } from "@/lib/crypto"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const { figmaUrl, apiToken } = await request.json()

    if (!figmaUrl) {
      return NextResponse.json({ error: "Figma URL is required" }, { status: 400 })
    }

    const parsed = parseFigmaUrl(figmaUrl)

    // Fetch the Figma image
    const { imagePath, nodeName } = await fetchFigmaImage(parsed.fileKey, parsed.nodeId)

    // Upsert Figma config
    const figmaConfigData: any = {
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId || null,
      lastFetchedAt: new Date(),
    }

    if (apiToken) {
      const encrypted = encryptSecret(apiToken)
      figmaConfigData.encryptedApiToken = encrypted.encrypted
      figmaConfigData.encryptionIv = encrypted.iv
      figmaConfigData.encryptionAuthTag = encrypted.authTag
      figmaConfigData.keyVersion = encrypted.keyVersion
    }

    await prisma.figmaConfig.upsert({
      where: { projectId: params.projectId },
      create: { ...figmaConfigData, projectId: params.projectId },
      update: figmaConfigData,
    })

    return NextResponse.json({
      figmaImagePath: imagePath,
      nodeName: nodeName || null,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Figma sync failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
