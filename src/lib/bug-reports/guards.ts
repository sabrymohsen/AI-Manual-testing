import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, requireProjectMember } from "@/lib/api-guards"

/**
 * Authorisation helpers for the `/api/bug-reports/[bugId]/*` routes.
 *
 * Those routes are addressed by bug id alone, with no project in the path, so
 * they can't call requireProjectOwner/Member directly — the project has to be
 * resolved from the bug first. Two of them (sync, sync/openproject) skipped that
 * step entirely and checked only that *a* user was logged in, then wrote
 * placement fields to whatever bug id was supplied and pushed it to the tracker.
 *
 * Everything that mutates a bug should go through `authorizeBugWrite`, and
 * anything that only reads through `authorizeBugRead`.
 */

type Denied = { ok: false; response: NextResponse }
type Allowed = { ok: true; projectId: string }

function deny(error: string, status: number): Denied {
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

/**
 * Resolves the bug's project and requires the caller to own it.
 *
 * Owner-level deliberately matches the rest of the bug write surface — the
 * status, comment, attachment and bulk routes all gate on project ownership.
 * This closes the hole without quietly widening who can change bugs.
 */
export async function authorizeBugWrite(bugId: string): Promise<Allowed | Denied> {
  const bug = await prisma.bugReport.findUnique({
    where: { id: bugId },
    select: { projectId: true },
  })

  // Same 404 whether the bug is absent or belongs to someone else, so the
  // endpoint can't be used to probe which bug ids exist.
  if (!bug?.projectId) return deny("Bug report not found", 404)

  const auth = await requireProjectOwner(bug.projectId)
  if (auth.error) return deny("Bug report not found", 404)

  return { ok: true, projectId: bug.projectId }
}

/** Resolves the bug's project and requires the caller to be a member of it. */
export async function authorizeBugRead(bugId: string): Promise<Allowed | Denied> {
  const bug = await prisma.bugReport.findUnique({
    where: { id: bugId },
    select: { projectId: true },
  })

  if (!bug?.projectId) return deny("Bug report not found", 404)

  const auth = await requireProjectMember(bug.projectId)
  if (auth.error) return deny("Bug report not found", 404)

  return { ok: true, projectId: bug.projectId }
}
