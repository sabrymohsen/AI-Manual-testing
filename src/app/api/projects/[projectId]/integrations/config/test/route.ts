/**
 * POST /api/projects/[projectId]/integrations/config/test
 *
 * Tests a provider connection and returns its metadata (types / statuses /
 * boards) for the mapping UI. Works with credentials typed into the form (before
 * saving) or, when apiToken is omitted, the saved encrypted token.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { connectionFromRow, providerFromConnection } from "@/lib/integrations/core/factory"
import type { ProviderConnection } from "@/lib/integrations/core/provider"
import type { ProviderId } from "@/lib/integrations/core/types"

const schema = z.object({
  provider: z.enum(["OpenProject", "Jira", "AzureDevOps", "ClickUp"]),
  baseUrl: z.string().optional(),
  externalProjectKey: z.string().min(1),
  username: z.string().nullable().optional(),
  apiToken: z.string().optional(),
})

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 })
  }
  const d = parsed.data

  let conn: ProviderConnection
  if (d.apiToken && d.apiToken.trim()) {
    conn = {
      provider: d.provider as ProviderId,
      baseUrl: (d.baseUrl ?? "").trim(),
      externalProjectKey: d.externalProjectKey.trim(),
      username: d.username ?? "",
      apiToken: d.apiToken.trim(),
      webhookSecret: null,
    }
  } else {
    // Reuse the saved token.
    const saved = await prisma.projectIntegration.findUnique({ where: { projectId: params.projectId } })
    if (!saved?.apiTokenEncrypted) {
      return NextResponse.json({ error: "No saved token — enter an API token to test" }, { status: 400 })
    }
    conn = connectionFromRow({
      provider: d.provider,
      baseUrl: (d.baseUrl ?? saved.baseUrl).trim(),
      externalProjectKey: d.externalProjectKey.trim(),
      username: d.username ?? saved.username,
      apiTokenEncrypted: saved.apiTokenEncrypted,
      apiTokenIv: saved.apiTokenIv,
      apiTokenAuthTag: saved.apiTokenAuthTag,
      apiTokenKeyVersion: saved.apiTokenKeyVersion,
    })
  }

  let result
  try {
    const provider = providerFromConnection(conn)
    result = await provider.testConnection()
  } catch (err: any) {
    result = { success: false, message: err?.message || "Connection failed", errors: [err?.message] }
  }

  // Persist last-connection status when a config row exists.
  await prisma.projectIntegration
    .updateMany({
      where: { projectId: params.projectId },
      data: {
        lastConnectionStatus: result.success ? "connected" : "failed",
        lastConnectionCheckedAt: new Date(),
      },
    })
    .catch(() => {})

  return NextResponse.json(result)
}
