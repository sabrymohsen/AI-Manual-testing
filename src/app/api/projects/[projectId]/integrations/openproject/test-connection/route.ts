/**
 * POST /api/projects/[projectId]/integrations/openproject/test-connection
 *
 * Comprehensive connection test — validates URL, token, project, types, statuses, write perms.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"
import { z } from "zod"

const testSchema = z.object({
  baseUrl: z.string().min(1),
  openProjectProjectIdentifier: z.string().min(1),
  apiToken: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const parsed = testSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    )
  }

  let token = parsed.data.apiToken || ""

  // If no token provided, try to load from saved integration
  if (!token) {
    const integration = await prisma.openProjectIntegration.findUnique({
      where: { projectId: params.projectId },
    })
    if (integration?.apiTokenEncrypted) {
      try {
        token = decryptSecret({
          encrypted: integration.apiTokenEncrypted,
          iv: integration.apiTokenIv,
          authTag: integration.apiTokenAuthTag,
          keyVersion: integration.apiTokenKeyVersion,
        })
      } catch {
        return NextResponse.json({ error: "Failed to decrypt saved API token" }, { status: 500 })
      }
    }
  }

  if (!token) {
    return NextResponse.json({ error: "API token is required" }, { status: 400 })
  }

  try {
    const client = new OpenProjectClient(
      parsed.data.baseUrl,
      parsed.data.openProjectProjectIdentifier,
      token
    )

    const result = await client.testConnection()

    // Update last connection status
    await prisma.openProjectIntegration.updateMany({
      where: { projectId: params.projectId },
      data: {
        lastConnectionStatus: result.success ? "connected" : "failed",
        lastConnectionCheckedAt: new Date(),
      },
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        projectName: result.projectName,
        types: result.types,
        statuses: result.statuses,
        versions: result.versions,
        canCreateWorkPackages: result.canCreateWorkPackages,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
          errors: result.errors,
          types: result.types,
          statuses: result.statuses,
        },
        { status: 400 }
      )
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Connection test failed" },
      { status: 500 }
    )
  }
}
