/**
 * Route guards for visual tests. Every route resolves the project from the
 * record it touches and checks membership there, so an id from another project
 * answers 404 — never "access denied", which would confirm the id exists.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, resolveProjectRole } from "@/lib/api-guards"

type Session = NonNullable<Awaited<ReturnType<typeof requireProjectMember>>["session"]>

export type Guard<T> = { ok: true; session: Session; projectId: string; record: T } | { ok: false; response: NextResponse }

function deny(status: number, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status: status === 401 ? 401 : 404 }) }
}

export async function guardProject(projectId: string): Promise<Guard<null>> {
  const auth = await requireProjectMember(projectId)
  if (auth.error || !auth.session) return deny(auth.status, auth.error || "Not found")
  return { ok: true, session: auth.session, projectId, record: null }
}

export async function guardVisualTest(testId: string) {
  const test = await prisma.visualTest.findUnique({ where: { id: testId } })
  if (!test) return deny(404, "Visual test not found") as Guard<typeof test & {}>
  const g = await guardProject(test.projectId)
  if (!g.ok) return g
  return { ok: true as const, session: g.session, projectId: test.projectId, record: test }
}

export async function guardVisualRun(runId: string) {
  const run = await prisma.visualTestRun.findUnique({ where: { id: runId } })
  if (!run) return deny(404, "Run not found") as Guard<typeof run & {}>
  const g = await guardProject(run.projectId)
  if (!g.ok) return g
  return { ok: true as const, session: g.session, projectId: run.projectId, record: run }
}

export async function guardVisualScreen(screenId: string) {
  const screen = await prisma.visualScreen.findUnique({
    where: { id: screenId },
    include: { run: { select: { projectId: true } } },
  })
  if (!screen) return deny(404, "Screen not found") as Guard<typeof screen & {}>
  const g = await guardProject(screen.run.projectId)
  if (!g.ok) return g
  return { ok: true as const, session: g.session, projectId: screen.run.projectId, record: screen }
}

/** Deleting a test or its regions is an admin action, same as the other destructive routes. */
export async function isProjectAdmin(projectId: string, userId: string): Promise<boolean> {
  const resolved = await resolveProjectRole(projectId, userId)
  return !!resolved && (resolved.globalRole === "Admin" || resolved.role === "Owner" || resolved.role === "Admin")
}

export function errorResponse(err: unknown, fallback = "Something went wrong") {
  const status = typeof (err as any)?.status === "number" ? (err as any).status : typeof (err as any)?.statusCode === "number" ? (err as any).statusCode : 500
  const message = (err as any)?.message || fallback
  if (status >= 500) console.error("[visual-tests]", err)
  return NextResponse.json({ error: status >= 500 && status !== 503 ? fallback : message }, { status })
}
