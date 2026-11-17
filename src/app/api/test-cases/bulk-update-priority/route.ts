import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireAuth, unauthorizedResponse, badRequestResponse, usableProjectIds } from "@/lib/api-guards"

const bodySchema = z.object({
  testCaseIds: z.array(z.string().min(1)).min(1, "No test case IDs provided"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) {
    return unauthorizedResponse(auth.error)
  }
  const session = auth.session!

  try {
    const body = await request.json()
    const parse = bodySchema.safeParse(body)
    if (!parse.success) {
      return badRequestResponse(parse.error.errors[0].message)
    }
    const { testCaseIds, priority } = parse.data

    const candidates = await prisma.testCase.findMany({
      where: { id: { in: testCaseIds } },
      select: { id: true, projectId: true },
    })
    const allowed = await usableProjectIds(session.user.id, candidates.map((c) => c.projectId), "write")
    const result = await prisma.testCase.updateMany({
      where: {
        id: { in: candidates.filter((c) => allowed.has(c.projectId)).map((c) => c.id) },
      },
      data: {
        priority: priority as any
      }
    })

    return NextResponse.json({
      success: true,
      count: result.count
    })
  } catch (error: any) {
    console.error("Bulk update priority error:", error)
    return NextResponse.json({ error: error.message || "Failed to update priorities" }, { status: 500 })
  }
}
