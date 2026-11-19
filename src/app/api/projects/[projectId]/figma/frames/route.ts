import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { fetchFigmaFrames } from "@/lib/figma/api-client"
import { decryptSecret } from "@/lib/crypto"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const { searchParams } = new URL(request.url)
    const customToken = searchParams.get("apiToken")

    // Fetch project and Figma config
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      include: { figmaConfig: true }
    })

    if (!project) {
      return notFoundResponse("Project not found")
    }

    let token = customToken || undefined

    if (!token && project.figmaConfig?.encryptedApiToken) {
      token = decryptSecret({
        encrypted: project.figmaConfig.encryptedApiToken,
        iv: project.figmaConfig.encryptionIv || "",
        authTag: project.figmaConfig.encryptionAuthTag || "",
        keyVersion: project.figmaConfig.keyVersion || "v1"
      })
    }

    if (!token) {
      // Fallback to process.env.FIGMA_API_TOKEN is handled inside fetchFigmaFrames
    }

    const figmaUrl = project.figmaUrl
    if (!figmaUrl) {
      return NextResponse.json({ error: "Figma URL is not configured for this project" }, { status: 400 })
    }

    // Parse file key from Figma URL
    // E.g. https://www.figma.com/file/FILE_KEY/... or figma.com/design/FILE_KEY/...
    const match = figmaUrl.match(/(?:file|design)\/([a-zA-Z0-9]{22,})/)
    if (!match) {
      return NextResponse.json({ error: "Invalid Figma URL format in project settings" }, { status: 400 })
    }
    const fileKey = match[1]

    const frames = await fetchFigmaFrames(fileKey, token)

    return NextResponse.json({ frames })
  } catch (err: any) {
    console.error("Figma frames fetch error:", err)
    let errMsg = err.message || "Failed to fetch Figma frames"
    if (errMsg.includes("403") || errMsg.includes("404") || errMsg.includes("401")) {
      errMsg = "Please make sure your Figma token has access to this file."
    }
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
