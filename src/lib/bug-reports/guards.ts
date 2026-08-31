import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { requireProjectMember, resolveProjectRole } from "@/lib/api-guards"
import type { ProjectPermission } from "@/lib/permissions"

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
 * Resolves the bug's project and requires the caller to be allowed to change it.
 *
 * Authorisation runs through the RBAC engine rather than project ownership.
 * Ownership was never the right test: a project Admin, a Member who files and
 * triages defects all day, and a Global Admin were all refused, while the whole
 * point of the Members feature is that a project has more than one person in
 * it. Only the project creator could touch a bug.
 *
 * `canEditBoard` is the permission every role that works on defects holds; the
 * destructive routes ask for something stricter by passing their own.
 */
export async function authorizeBugWrite(
  bugId: string,
  permission: ProjectPermission = "canEditBoard"
): Promise<Allowed | Denied> {
  const bug = await prisma.bugReport.findUnique({
    where: { id: bugId },
    select: { projectId: true },
  })

  // Same 404 whether the bug is absent or belongs to someone else, so the
  // endpoint can't be used to probe which bug ids exist.
  if (!bug?.projectId) return deny("Bug report not found", 404)

  const session = await getSession()
  if (!session) return deny("Not authenticated", 401)

  const resolved = await resolveProjectRole(bug.projectId, session.user.id)
  if (!resolved || resolved.role === null) return deny("Bug report not found", 404)
  if (!resolved.permissions[permission]) {
    return deny(`Missing permission: ${permission}`, 403)
  }

  return { ok: true, projectId: bug.projectId }
}

type BulkDenied = { ok: false; response: NextResponse }
type BulkAllowed = { ok: true; projectIds: string[] }

/**
 * The same check for a batch of bugs, which is what every /api/bug-reports/bulk-*
 * route needs.
 *
 * Each of those routes hand-rolled the same block: load the bugs, load the
 * projects where `userId === session.user.id`, and refuse if any bug fell
 * outside. That is ownership again — it silently excluded Admins, Members and
 * Global Admins from every bulk action on the board.
 *
 * A selection spanning several projects is checked per project and refused
 * unless the caller is allowed in ALL of them: a partially-applied bulk edit is
 * worse than a refused one, because nothing on screen says which half landed.
 */
export async function authorizeBugsWrite(
  bugIds: string[],
  permission: ProjectPermission = "canEditBoard"
): Promise<BulkAllowed | BulkDenied> {
  const session = await getSession()
  if (!session) return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) }

  const bugs = await prisma.bugReport.findMany({
    where: { id: { in: bugIds } },
    select: { projectId: true },
  })

  const projectIds = Array.from(
    new Set(bugs.map((b) => b.projectId).filter(Boolean) as string[])
  )

  // Ids that matched no bug, or bugs with no project, are not silently allowed:
  // the caller asked to change something that cannot be authorised.
  if (bugs.length !== bugIds.length || bugs.some((b) => !b.projectId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "One or more bug reports were not found" }, { status: 404 }),
    }
  }

  for (const projectId of projectIds) {
    const resolved = await resolveProjectRole(projectId, session.user.id)
    if (!resolved || resolved.role === null) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Access denied to one or more bug reports" },
          { status: 403 }
        ),
      }
    }
    if (!resolved.permissions[permission]) {
      return {
        ok: false,
        response: NextResponse.json({ error: `Missing permission: ${permission}` }, { status: 403 }),
      }
    }
  }

  return { ok: true, projectIds }
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
