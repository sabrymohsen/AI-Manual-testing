/**
 * Modules from the project's tracker.
 *
 *   GET  — the Epics/Features available to import, each marked with the module
 *          it is already linked to.
 *   POST — { action: "import", externalIds } creates/links modules for them;
 *          { action: "refresh" } brings already-linked modules back in step.
 *
 * Reading the list is member-level; creating modules needs the same permission
 * as creating one by hand, since that is exactly what it does.
 */
import { NextResponse } from "next/server"
import { requireProjectMember, requireProjectPermission, badRequestResponse } from "@/lib/api-guards"
import { listImportableModules, importModules, refreshLinkedModules } from "@/lib/integrations/core/import-modules"
import { z } from "zod"

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    return NextResponse.json(await listImportableModules(params.projectId))
  } catch (err: any) {
    // A tracker that is down or misconfigured must not break the modules panel;
    // the picker shows the reason and the local modules stay usable.
    return NextResponse.json(
      { provider: null, items: [], error: err?.message || "Could not reach the tracker" },
      { status: 502 }
    )
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), externalIds: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("refresh") }),
])

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  }

  try {
    if (parsed.data.action === "refresh") {
      return NextResponse.json(await refreshLinkedModules(params.projectId))
    }
    return NextResponse.json(await importModules(params.projectId, parsed.data.externalIds))
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Import failed" }, { status: 502 })
  }
}
