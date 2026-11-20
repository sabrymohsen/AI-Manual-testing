import { cleanEnvironment } from "@/lib/hub-runner"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { cleanScope, nextRunAfter, validTiming, type ScheduleTiming } from "@/lib/hub-schedule"

export const dynamic = "force-dynamic"

// GET /api/hub/schedules?projectId= — the project's schedules with their last result.
export async function GET(request: NextRequest) {
  const auth = await requireHubProject(request.nextUrl.searchParams.get("projectId"), "read")
  if (!auth.ok) return auth.response
  const schedules = await prisma.hubSchedule.findMany({ where: { projectId: auth.projectId }, orderBy: { createdAt: "asc" } })
  const refs = schedules.map((s) => s.lastBatchId).filter((x): x is string => !!x)
  const runs = refs.length
    ? await prisma.testExecution.findMany({
        where: { OR: [{ batchId: { in: refs } }, { id: { in: refs } }] },
        select: { id: true, batchId: true, status: true },
      })
    : []
  return NextResponse.json({
    schedules: schedules.map((s) => {
      const mine = runs.filter((r) => r.batchId === s.lastBatchId || r.id === s.lastBatchId)
      const lastStatus = !mine.length
        ? null
        : mine.some((r) => r.status === "Queued" || r.status === "Running")
          ? "Running"
          : mine.some((r) => r.status === "Failed")
            ? "Failed"
            : mine.some((r) => r.status === "Cancelled")
              ? "Cancelled"
              : "Passed"
      return { ...s, lastStatus }
    }),
  })
}

// POST /api/hub/schedules { projectId, name, frequency, timeOfDay?, everyHours?, scope?, browser?, environment? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const auth = await requireHubProject(String(body.projectId || ""), "write")
  if (!auth.ok) return auth.response

  const name = String(body.name || "").trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: "Name the schedule, e.g. Nightly regression" }, { status: 400 })
  const timing: ScheduleTiming = {
    frequency: body.frequency,
    timeOfDay: body.timeOfDay ?? null,
    everyHours: body.everyHours ? Number(body.everyHours) : null,
  }
  const bad = validTiming(timing)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const schedule = await prisma.hubSchedule.create({
    data: {
      projectId: auth.projectId,
      name,
      scope: cleanScope(body.scope) as any,
      browser: String(body.browser || "Headless"),
      environment: cleanEnvironment(body.environment),
      frequency: timing.frequency,
      timeOfDay: timing.frequency === "hourly" ? null : timing.timeOfDay,
      everyHours: timing.frequency === "hourly" ? timing.everyHours : null,
      enabled: body.enabled !== false,
      nextRunAt: nextRunAfter(timing, new Date()),
      createdById: auth.session.user.id,
      createdByName: auth.session.user.name || auth.session.user.email,
    },
  })
  return NextResponse.json({ schedule }, { status: 201 })
}
