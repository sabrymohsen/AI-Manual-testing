import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { canUseProject } from "@/lib/api-guards"

/**
 * Access rules for the Automation Hub.
 *
 * A hub test is JavaScript that runs on the server, so writing or running one
 * is equivalent to running code there. Before this module the single-script,
 * execution and recorder routes only checked "signed in" — anyone who
 * registered could create a shared script and run it with the server's
 * environment. The rules now:
 *
 *   read a project's tests/runs ........ any project member (incl. Viewer)
 *   write or run tests ................. Owner / Admin / Member (not Viewer)
 *   create/edit/delete SHARED examples . global Admin only
 *   run a shared example ............... inside a project you can write to;
 *                                        the run belongs to that project
 */

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>
type Fail = { ok: false; response: NextResponse }
type Mode = "read" | "write"

const fail = (status: number, error: string): Fail => ({ ok: false, response: NextResponse.json({ error }, { status }) })

export async function isGlobalAdmin(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return u?.role === "Admin"
}

async function session(): Promise<{ ok: true; session: Session } | Fail> {
  const s = await getSession()
  return s ? { ok: true, session: s } : fail(401, "Not authenticated")
}

/** Project-level hub access. 404 (not 403) for non-members so ids don't leak. */
export async function requireHubProject(projectId: string | null | undefined, mode: Mode) {
  const s = await session()
  if (!s.ok) return s
  if (!projectId) return fail(400, "projectId is required")
  if (!(await canUseProject(projectId, s.session.user.id, "read"))) return fail(404, "Project not found or access denied")
  if (mode === "write" && !(await canUseProject(projectId, s.session.user.id, "write"))) {
    return fail(403, "Viewers can't change or run automated tests")
  }
  return { ok: true as const, session: s.session, projectId }
}

/**
 * Access to one script. `runInProjectId` is the project a run happens in —
 * required for shared examples, which belong to no project.
 */
export async function requireHubScript(
  scriptId: string,
  mode: Mode | "run",
  runInProjectId?: string | null
) {
  const s = await session()
  if (!s.ok) return s
  const userId = s.session.user.id
  const script = await prisma.testScript.findUnique({ where: { id: scriptId } })
  if (!script) return fail(404, "Test script not found")

  if (script.projectId) {
    if (!(await canUseProject(script.projectId, userId, "read"))) return fail(404, "Test script not found")
    if (mode !== "read" && !(await canUseProject(script.projectId, userId, "write"))) {
      return fail(403, "Viewers can't change or run automated tests")
    }
    return { ok: true as const, session: s.session, script, projectId: script.projectId }
  }

  // Shared example (no project).
  if (mode === "read") return { ok: true as const, session: s.session, script, projectId: runInProjectId ?? null }
  if (mode === "write") {
    if (!(await isGlobalAdmin(userId))) return fail(403, "Only an admin can change shared example tests")
    return { ok: true as const, session: s.session, script, projectId: null }
  }
  // run
  if (!runInProjectId) return fail(400, "Choose the project to run this shared example in")
  if (!(await canUseProject(runInProjectId, userId, "write"))) return fail(403, "You can't run tests in this project")
  return { ok: true as const, session: s.session, script, projectId: runInProjectId }
}

/** Access to one run, via the project it belongs to. */
export async function requireHubExecution(executionId: string, mode: Mode) {
  const s = await session()
  if (!s.ok) return s
  const execution = await prisma.testExecution.findUnique({
    where: { id: executionId },
    include: { script: { select: { id: true, name: true, folder: true, projectId: true, type: true, code: true } } },
  })
  if (!execution) return fail(404, "Execution not found")
  const projectId = execution.projectId ?? execution.script?.projectId ?? null
  const userId = s.session.user.id
  if (!projectId) {
    // A run of a shared example from before runs recorded their project.
    if (!(await isGlobalAdmin(userId))) return fail(404, "Execution not found")
  } else {
    if (!(await canUseProject(projectId, userId, "read"))) return fail(404, "Execution not found")
    if (mode === "write" && !(await canUseProject(projectId, userId, "write"))) {
      return fail(403, "Viewers can't change automated runs")
    }
  }
  return { ok: true as const, session: s.session, execution, projectId }
}

/** Any project the user can write to (recorder sessions aren't tied to one project). */
export async function requireAnyHubWriter() {
  const s = await session()
  if (!s.ok) return s
  const userId = s.session.user.id
  if (await isGlobalAdmin(userId)) return { ok: true as const, session: s.session }
  const writable = await prisma.project.findFirst({
    where: {
      OR: [{ userId }, { projectMembers: { some: { userId, role: { notIn: ["Viewer", "viewer", "VIEWER"] } } } }],
    },
    select: { id: true },
  })
  if (!writable) return fail(403, "You need write access to a project to record tests")
  return { ok: true as const, session: s.session }
}

/**
 * Environment for a test run: only what Node/Playwright need to start, plus
 * the project's Data & Config variables. The run used to inherit the whole
 * server environment, so any test could print DATABASE_URL, NEXTAUTH_SECRET
 * or APP_ENCRYPTION_KEY.
 */
const PASS_THROUGH = [
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TZ",
  "TMPDIR", "TMP", "TEMP", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR",
  "PLAYWRIGHT_BROWSERS_PATH", "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "npm_config_cache",
  // Windows
  "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "ProgramFiles", "ProgramData", "WINDIR",
]

export function cleanRunEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test" }
  for (const k of PASS_THROUGH) if (process.env[k] !== undefined) env[k] = process.env[k]
  return { ...env, ...extra }
}

/** Projects the user can read, or "all" for a global Admin. */
export async function readableProjectIds(userId: string): Promise<string[] | "all"> {
  if (await isGlobalAdmin(userId)) return "all"
  const rows = await prisma.project.findMany({
    where: { OR: [{ userId }, { projectMembers: { some: { userId } } }] },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

/**
 * Prisma filter for runs the user may see: runs of their projects, plus runs
 * of their projects' own scripts recorded before runs stored a project.
 */
export async function visibleExecutionWhere(userId: string) {
  const ids = await readableProjectIds(userId)
  if (ids === "all") return {}
  return { OR: [{ projectId: { in: ids } }, { projectId: null, script: { projectId: { in: ids } } }] }
}

/** Ids of the runs the user may see (for tables that only store a run id). */
export async function visibleExecutionIds(userId: string): Promise<string[] | "all"> {
  const where = await visibleExecutionWhere(userId)
  if (!("OR" in where)) return "all"
  const rows = await prisma.testExecution.findMany({ where, select: { id: true } })
  return rows.map((r) => r.id)
}

/** Workspace-wide hub settings (providers, targets, data files, config): admins only. */
export async function requireHubAdmin() {
  const s = await session()
  if (!s.ok) return s
  if (!(await isGlobalAdmin(s.session.user.id))) {
    return fail(403, "Only an admin can change workspace-wide Automation Hub settings")
  }
  return { ok: true as const, session: s.session }
}

/**
 * Data & Config variables. Global ones feed every project's runs, so only an
 * admin may change or reveal them; a project's own variables belong to that
 * project's writers. Before this, any signed-in user could list every
 * project's variables and reveal any secret.
 */
export async function canManageEnvVar(
  userId: string,
  row: { scope: string; projectId: string | null },
  mode: "read" | "write"
): Promise<boolean> {
  if (row.scope !== "project" || !row.projectId) return mode === "read" || (await isGlobalAdmin(userId))
  return canUseProject(row.projectId, userId, mode)
}

/** Whether the user may see this run (via its project). */
export async function executionVisibleTo(userId: string, executionId: string | null | undefined): Promise<boolean> {
  if (!executionId) return isGlobalAdmin(userId)
  const e = await prisma.testExecution.findUnique({
    where: { id: executionId },
    select: { projectId: true, script: { select: { projectId: true } } },
  })
  if (!e) return isGlobalAdmin(userId)
  const projectId = e.projectId ?? e.script?.projectId ?? null
  if (!projectId) return isGlobalAdmin(userId)
  return canUseProject(projectId, userId, "read")
}

/** Archived trace ids are "<executionId>~<dir>"; anything else is a workspace trace. */
export async function traceVisibleTo(userId: string, traceId: string): Promise<boolean> {
  const decoded = decodeURIComponent(traceId)
  const i = decoded.indexOf("~")
  return executionVisibleTo(userId, i > 0 ? decoded.slice(0, i) : null)
}

/**
 * Visual Diff baseline access (comparisons inherit their baseline's project).
 * Baselines from before they had a project are visible to global Admins only.
 */
export async function requireVisualBaseline(baselineId: string | null | undefined, mode: Mode) {
  const s = await session()
  if (!s.ok) return s
  if (!baselineId) return fail(400, "baselineId is required")
  const baseline = await prisma.visualBaseline.findUnique({ where: { id: baselineId } })
  if (!baseline) return fail(404, "Baseline not found")
  const userId = s.session.user.id
  if (!baseline.projectId) {
    if (!(await isGlobalAdmin(userId))) return fail(404, "Baseline not found")
  } else {
    if (!(await canUseProject(baseline.projectId, userId, "read"))) return fail(404, "Baseline not found")
    if (mode === "write" && !(await canUseProject(baseline.projectId, userId, "write"))) {
      return fail(403, "Viewers can't change visual baselines")
    }
  }
  return { ok: true as const, session: s.session, baseline }
}

/** An evidence screenshot usable as a Visual Diff source in this project. */
export async function evidenceInProject(evidenceId: string, projectId: string) {
  const ev = await prisma.evidenceFile.findUnique({ where: { id: evidenceId } })
  if (!ev) return null
  const e = await prisma.testExecution.findUnique({
    where: { id: ev.testExecutionId },
    select: { projectId: true, script: { select: { projectId: true } } },
  })
  const owner = e ? e.projectId ?? e.script?.projectId ?? null : null
  return owner === projectId ? ev : null
}
