import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireProjectPermission, badRequestResponse, notFoundResponse } from "@/lib/api-guards"

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
})

async function findPlan(projectId: string, planId: string) {
  return prisma.testPlan.findFirst({ where: { id: planId, projectId }, select: { id: true } })
}

/** PATCH renames / re-describes a plan. */
export async function PATCH(request: Request, { params }: { params: { projectId: string; planId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!(await findPlan(params.projectId, params.planId))) return notFoundResponse("Plan not found")

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))

  const plan = await prisma.testPlan.update({ where: { id: params.planId }, data: parsed.data })
  return NextResponse.json({ plan })
}

/** DELETE removes the plan only — its test cases are untouched. */
export async function DELETE(_request: Request, { params }: { params: { projectId: string; planId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!(await findPlan(params.projectId, params.planId))) return notFoundResponse("Plan not found")

  await prisma.testPlan.delete({ where: { id: params.planId } })
  return NextResponse.json({ success: true })
}
