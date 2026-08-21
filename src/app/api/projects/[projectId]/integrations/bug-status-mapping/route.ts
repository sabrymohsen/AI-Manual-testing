/**
 * GET → the project's saved app-bug-status → tracker-status mapping, the
 *       tracker's available statuses to choose from, and a suggestion to
 *       pre-fill the form when nothing is saved yet.
 * PUT → save the mapping. Body: { mapping: Record<AppBugStatus, statusId|null> }
 *
 * Provider-neutral: every provider implements getStatuses(), so this serves
 * OpenProject, Jira, Azure DevOps and ClickUp alike. Nothing about which status
 * means what is decided here — that is the user's choice, stored per project.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { loadIntegration } from "@/lib/integrations/core/load-integration"
import {
  APP_BUG_STATUSES,
  APP_BUG_STATUS_LABELS,
  readBugStatusMapping,
  suggestBugStatusMapping,
  type BugStatusMapping,
} from "@/lib/integrations/core/bug-status-mapping"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const loaded = await loadIntegration(params.projectId)
  if (!loaded) {
    return NextResponse.json(
      { error: "No project-management integration is configured for this project" },
      { status: 400 }
    )
  }

  let trackerStatuses: Array<{ id: string; name: string }> = []
  let statusError: string | null = null
  try {
    trackerStatuses = (await loaded.getClient().getStatuses()).map((s) => ({
      id: String(s.id),
      name: s.name,
    }))
  } catch (err: any) {
    statusError = err?.message || "Could not read the tracker's statuses"
  }

  const stored = readBugStatusMapping(loaded.statusMapping)
  const hasStored = Object.keys(stored).length > 0

  return NextResponse.json({
    provider: loaded.provider,
    appStatuses: APP_BUG_STATUSES.map((s) => ({ value: s, label: APP_BUG_STATUS_LABELS[s] })),
    trackerStatuses,
    statusError,
    mapping: hasStored ? stored : suggestBugStatusMapping(trackerStatuses),
    /** True when the rows above are a guess the user has not accepted yet. */
    isSuggestion: !hasStored,
  })
}

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const loaded = await loadIntegration(params.projectId)
  if (!loaded) {
    return NextResponse.json(
      { error: "No project-management integration is configured for this project" },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const incoming = body?.mapping
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "mapping is required" }, { status: 400 })
  }

  // Keep only known app statuses, and drop cleared rows rather than storing
  // empty strings — "not mapped" must be absent, not blank.
  const mapping: BugStatusMapping = {}
  for (const appStatus of APP_BUG_STATUSES) {
    const value = (incoming as Record<string, unknown>)[appStatus]
    if (typeof value === "string" && value.trim()) mapping[appStatus] = value.trim()
  }

  // Two app statuses sharing one tracker status would make them indistinguishable
  // once synced, and a later read could not tell which one a bug is really in.
  const seen = new Map<string, string>()
  for (const [appStatus, statusId] of Object.entries(mapping)) {
    const clash = seen.get(statusId!)
    if (clash) {
      return NextResponse.json(
        { error: `"${APP_BUG_STATUS_LABELS[clash as never]}" and "${APP_BUG_STATUS_LABELS[appStatus as never]}" cannot both map to the same tracker status.` },
        { status: 400 }
      )
    }
    seen.set(statusId!, appStatus)
  }

  const nextStatusMapping = { ...(loaded.statusMapping as object), bug: mapping }

  if (loaded.source === "unified") {
    await prisma.projectIntegration.update({
      where: { projectId: params.projectId },
      data: { statusMapping: nextStatusMapping as any },
    })
  } else {
    // The legacy OpenProject row has no JSON status map — bug statuses are only
    // supported on the unified integration row.
    return NextResponse.json(
      { error: "Reconnect this project through the integrations screen to map bug statuses." },
      { status: 400 }
    )
  }

  return NextResponse.json({ mapping, isSuggestion: false })
}
