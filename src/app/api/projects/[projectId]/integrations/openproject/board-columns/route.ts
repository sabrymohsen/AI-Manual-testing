/**
 * GET /api/projects/[projectId]/integrations/openproject/board-columns?boardId=xxx
 *
 * Returns the columns of a specific OpenProject board by reading its grid widgets.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const { searchParams } = new URL(request.url)
  const boardId = searchParams.get("boardId")

  if (!boardId || isNaN(Number(boardId))) {
    return NextResponse.json({ error: "boardId query param is required" }, { status: 400 })
  }

  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId: params.projectId },
  })

  if (!integration?.apiTokenEncrypted) {
    return NextResponse.json({ error: "OpenProject integration is not configured" }, { status: 400 })
  }

  let token: string
  try {
    token = decryptSecret({
      encrypted: integration.apiTokenEncrypted,
      iv: integration.apiTokenIv,
      authTag: integration.apiTokenAuthTag,
      keyVersion: integration.apiTokenKeyVersion,
    })
  } catch {
    return NextResponse.json({ error: "Failed to decrypt API token" }, { status: 500 })
  }

  const client = new OpenProjectClient(
    integration.baseUrl,
    integration.openProjectProjectIdentifier,
    token
  )

  try {
    const columns = await client.getBoardColumns(Number(boardId))
    return NextResponse.json({ columns })
  } catch (err: any) {
    return NextResponse.json({ columns: [], error: err?.message || String(err) }, { status: 200 })
  }
}
