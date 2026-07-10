/**
 * GET /api/projects/[projectId]/integrations/provider
 *
 * Lightweight provider-identity lookup for dynamic UI labels — returns which
 * tool the project is connected to (unified model, else legacy OpenProject) so
 * surfaces can render "Sync to Jira", "ClickUp", etc. Auth: any signed-in user.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { providerName } from "@/lib/integrations/labels"

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const unified = await prisma.projectIntegration.findUnique({
    where: { projectId: params.projectId },
    select: { provider: true, enabled: true },
  })
  if (unified) {
    return NextResponse.json({
      provider: unified.provider,
      name: providerName(unified.provider),
      connected: unified.enabled,
    })
  }

  const op = await prisma.openProjectIntegration.findUnique({
    where: { projectId: params.projectId },
    select: { apiTokenEncrypted: true },
  })
  if (op?.apiTokenEncrypted) {
    return NextResponse.json({ provider: "OpenProject", name: "OpenProject", connected: true })
  }
  return NextResponse.json({ provider: null, name: "tracker", connected: false })
}
