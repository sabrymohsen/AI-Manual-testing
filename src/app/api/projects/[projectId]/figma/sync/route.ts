import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { z } from "zod"
import { fetchFigmaImagesBulk } from "@/lib/figma/api-client"
import { encryptSecret, decryptSecret } from "@/lib/crypto"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const frames = await prisma.figmaFrame.findMany({
      where: {
        projectId: params.projectId,
      },
      orderBy: { name: "asc" }
    })

    return NextResponse.json({ frames })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch synced frames" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const syncSchema = z.object({
      frames: z.array(z.any()).min(1, "No frames provided to sync"),
      apiToken: z.string().optional(),
    })
    const parsed = syncSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const { frames, apiToken } = parsed.data

    // 1. Fetch project and figma config
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      include: { figmaConfig: true }
    })

    if (!project) {
      return notFoundResponse("Project not found")
    }

    const figmaUrl = project.figmaUrl
    if (!figmaUrl) {
      return NextResponse.json({ error: "Figma URL is not configured for this project" }, { status: 400 })
    }

    const match = figmaUrl.match(/(?:file|design)\/([a-zA-Z0-9]{22,})/)
    if (!match) {
      return NextResponse.json({ error: "Invalid Figma URL format in project settings" }, { status: 400 })
    }
    const fileKey = match[1]

    // Save token if provided
    if (apiToken) {
      const encrypted = encryptSecret(apiToken)
      await prisma.figmaConfig.upsert({
        where: { projectId: params.projectId },
        create: {
          projectId: params.projectId,
          encryptedApiToken: encrypted.encrypted,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          fileKey,
          lastFetchedAt: new Date()
        },
        update: {
          encryptedApiToken: encrypted.encrypted,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          fileKey,
          lastFetchedAt: new Date()
        }
      })
    }

    // Resolve decrypt token if not provided in request but exists in DB
    let token = apiToken || undefined
    if (!token && project.figmaConfig?.encryptedApiToken) {
      token = decryptSecret({
        encrypted: project.figmaConfig.encryptedApiToken,
        iv: project.figmaConfig.encryptionIv || "",
        authTag: project.figmaConfig.encryptionAuthTag || "",
        keyVersion: project.figmaConfig.keyVersion || "v1"
      })
    }

    // Download image assets in bulk
    const nodeIds = frames.map(f => f.nodeId)
    const imagesMap = await fetchFigmaImagesBulk(fileKey, nodeIds, token)

    // Upsert synced frame structures
    const syncedFrames = []
    for (const frame of frames) {
      const imagePath = imagesMap.get(frame.nodeId)
      if (!imagePath) continue // Skip if download failed

      const synced = await prisma.figmaFrame.upsert({
        where: {
          projectId_fileKey_nodeId: {
            projectId: params.projectId,
            fileKey,
            nodeId: frame.nodeId
          }
        },
        create: {
          projectId: params.projectId,
          fileKey,
          nodeId: frame.nodeId,
          name: frame.name,
          pageName: frame.pageName || null,
          width: frame.width || null,
          height: frame.height || null,
          referenceImagePath: imagePath,
          lastSyncedAt: new Date()
        },
        update: {
          name: frame.name,
          pageName: frame.pageName || null,
          width: frame.width || null,
          height: frame.height || null,
          referenceImagePath: imagePath,
          lastSyncedAt: new Date()
        }
      })
      syncedFrames.push(synced)
    }

    return NextResponse.json({ success: true, count: syncedFrames.length, frames: syncedFrames })
  } catch (error: any) {
    console.error("Figma sync error:", error)
    let errMsg = error.message || "Failed to sync Figma frames"
    if (errMsg.includes("403") || errMsg.includes("404") || errMsg.includes("401")) {
      errMsg = "Please make sure your Figma token has access to this file."
    }
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
