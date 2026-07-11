import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { logUserActivity } from "@/lib/user-activity"
import { z } from "zod"

const profileSelect = {
  id: true,
  email: true,
  name: true,
  plan: true,
  role: true,
  trialStartedAt: true,
  trialEndsAt: true,
  avatarUrl: true,
  bio: true,
  jobTitle: true,
  department: true,
  phone: true,
  timezone: true,
  language: true,
  theme: true,
} as const

// GET /api/me            -> session user + token (lightweight, used app-wide)
// GET /api/me?full=1     -> adds stats + recent activity for the profile page
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const userId = auth.session!.user.id

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  })
  if (!user) return unauthorizedResponse("User not found")

  const trialActive = !!user.trialEndsAt && user.trialEndsAt.getTime() > Date.now()
  const trialDaysRemaining = user.trialEndsAt
    ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0

  const payload: Record<string, unknown> = {
    user: { ...user, trialActive, trialDaysRemaining },
    token: auth.session!.token,
  }

  const full = new URL(request.url).searchParams.get("full")
  if (full) {
    const [ownedProjects, memberProjects, tasksAssigned, tasksCompleted, activity] = await Promise.all([
      prisma.project.count({ where: { userId } }),
      prisma.projectMember.count({ where: { userId } }),
      prisma.task.count({ where: { assignees: { some: { id: userId } } } }),
      prisma.task.count({ where: { assignees: { some: { id: userId } }, status: "DONE" } }),
      prisma.userActivity.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { project: { select: { id: true, name: true } } },
      }),
    ])
    payload.stats = {
      projects: ownedProjects + memberProjects,
      tasksAssigned,
      tasksCompleted,
    }
    payload.activity = activity
  }

  return NextResponse.json(payload)
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  department: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  timezone: z.string().max(64).optional(),
  language: z.string().max(10).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  bio: z.string().max(500).nullable().optional(),
})

// PATCH /api/me -> update editable profile fields
export async function PATCH(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const userId = auth.session!.user.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: parsed.data,
    select: profileSelect,
  })

  logUserActivity(userId, "PROFILE_UPDATED", "Updated profile details")

  return NextResponse.json({ user })
}
