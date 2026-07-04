import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function requireProjectOwner(projectId: string): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { id: true },
  })

  if (!project) {
    return { error: "Project not found or access denied", status: 404, session: null }
  }

  return { error: null, status: 200, session }
}

export async function requireAuth(): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }
  return { error: null, status: 200, session }
}

// Gate for Pro-only features. Currently UNUSED — Live QA Session was made
// free for all users. Kept (with User.plan) so gating can be reintroduced
// without rebuilding the plumbing.
export async function requirePro(): Promise<
  | { error: string; status: number; session: null }
  | { error: null; status: 200; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
> {
  const session = await getSession()
  if (!session) {
    return { error: "Not authenticated", status: 401, session: null }
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  })
  if (user?.plan !== "Pro") {
    return { error: "Pro plan required", status: 403, session: null }
  }
  return { error: null, status: 200, session }
}

export function unauthorizedResponse(error: string = "Not authenticated") {
  return NextResponse.json({ error }, { status: 401 })
}

export function forbiddenResponse(error: string = "Access denied") {
  return NextResponse.json({ error }, { status: 403 })
}

export function notFoundResponse(error: string = "Not found") {
  return NextResponse.json({ error }, { status: 404 })
}

export function badRequestResponse(error: string = "Bad request") {
  return NextResponse.json({ error }, { status: 400 })
}

export function serverErrorResponse(error: string = "Internal server error") {
  return NextResponse.json({ error }, { status: 500 })
}
