import { cleanEnvironment } from "@/lib/hub-runner"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { cleanScope, nextRunAfter, validTiming, type ScheduleTiming } from "@/lib/hub-schedule"
import { startScopedRun, type RunScope } from "@/lib/hub-runs"

export const dynamic = "force-dynamic"

async function load(scheduleId: string) {
  const s = await prisma.hubSchedule.findUnique({ where: { id: scheduleId } })
  if (!s) return { s: null, auth: null }
  return { s, auth: await requireHubProject(s.projectId, "write") }
}

// PATCH — edit timing/scope/enabled. { runNow: true } starts it immediately.
export async function PATCH(request: NextRequest, { params }: { params: { scheduleId: string } }) {
  const { s, auth } = await load(params.scheduleId)
  if (!s || !auth) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({}))

  if (body.runNow) {
    const res = await startScopedRun(s.projectId, (s.scope ?? {}) as RunScope, {
      browser: s.browser,
      meta: {
        triggerSource: "schedule",
        triggeredById: auth.session.user.id,
        triggeredByName: `Schedule “${s.name}” (run now by ${auth.session.user.name || auth.session.user.email})`,
      },
    })
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: 404 })
    await prisma.hubSchedule.update({ where: { id: s.id }, data: { lastRunAt: new Date(), lastBatchId: res.batchId ?? res.executionIds[0] } })
    return NextResponse.json(res, { status: 202 })
  }

  const timing: ScheduleTiming = {
    frequency: body.frequency ?? s.frequency,
    timeOfDay: body.timeOfDay !== undefined ? body.timeOfDay : s.timeOfDay,
    everyHours: body.everyHours !== undefined ? Number(body.everyHours) || null : s.everyHours,
  }
  const bad = validTiming(timing)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const schedule = await prisma.hubSchedule.update({
    where: { id: s.id },
    data: {
      ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim().slice(0, 120) } : {}),
      ...(body.scope !== undefined ? { scope: cleanScope(body.scope) as any } : {}),
      ...(typeof body.browser === "string" ? { browser: body.browser } : {}),
      ...(body.environment !== undefined ? { environment: cleanEnvironment(body.environment) } : {}),
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      frequency: timing.frequency,
      timeOfDay: timing.frequency === "hourly" ? null : timing.timeOfDay,
      everyHours: timing.frequency === "hourly" ? timing.everyHours : null,
      nextRunAt: nextRunAfter(timing, new Date()),
    },
  })
  return NextResponse.json({ schedule })
}

export async function DELETE(_request: NextRequest, { params }: { params: { scheduleId: string } }) {
  const { s, auth } = await load(params.scheduleId)
  if (!s || !auth) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!auth.ok) return auth.response
  await prisma.hubSchedule.delete({ where: { id: s.id } })
  return NextResponse.json({ deleted: true })
}
