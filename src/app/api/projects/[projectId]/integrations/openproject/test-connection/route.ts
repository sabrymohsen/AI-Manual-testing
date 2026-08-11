/**
 * POST /api/projects/[projectId]/integrations/openproject/test-connection
 *
 * Comprehensive connection test — validates URL, token, project, types, statuses, write perms.
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"
import { loadIntegration } from "@/lib/integrations/core/load-integration"
import { persistConnectionStatus, resolveOpenProject } from "@/lib/integrations/openproject/resolve"
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

  // If no token provided, reuse the saved one — from whichever row owns the
  // config (unified ProjectIntegration or the legacy OpenProject row).
  if (!token) {
    const resolved = await resolveOpenProject(params.projectId)
    if (resolved.ok) {
      token = resolved.apiToken
    } else if (resolved.status === 500) {
      return NextResponse.json({ error: "Failed to decrypt saved API token" }, { status: 500 })
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

    // Update last connection status on whichever row owns the config
    const loaded = await loadIntegration(params.projectId)
    if (loaded) {
      await persistConnectionStatus(loaded, result.success ? "connected" : "failed")
    }

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
