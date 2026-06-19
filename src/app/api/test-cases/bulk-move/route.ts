import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireAuth, requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"

const bodySchema = z.object({
  testCaseIds: z.array(z.string().min(1)).min(1, "No test case IDs provided"),
  targetProjectId: z.string().min(1, "targetProjectId is required"),
  targetModuleId: z.string().optional().nullable(),
  targetFeatureId: z.string().optional().nullable(),
  targetComponentId: z.string().optional().nullable(),
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
    const {
      testCaseIds,
      targetProjectId,
      targetModuleId,
      targetFeatureId,
      targetComponentId
    } = parse.data

    const targetAuth = await requireProjectOwner(targetProjectId)
    if (targetAuth.error) {
      return notFoundResponse("Project not found or access denied")
    }

    // Retrieve the target module's name to update the module string column in TestCase if needed
    let moduleName: string | null = null
    if (targetModuleId) {
      const mod = await prisma.projectModule.findUnique({
        where: { id: targetModuleId }
      })
      moduleName = mod?.name || null
    }

    // Update all test cases
    const result = await prisma.testCase.updateMany({
      where: {
        id: { in: testCaseIds },
        project: { userId: session.user.id }
      },
      data: {
        projectId: targetProjectId,
        moduleId: targetModuleId || null,
        featureId: targetFeatureId || null,
        componentId: targetComponentId || null,
        module: moduleName || null
      }
    })

    return NextResponse.json({
      success: true,
      count: result.count
    })
  } catch (error: any) {
    console.error("Bulk move error:", error)
    return NextResponse.json({ error: error.message || "Failed to bulk move test cases" }, { status: 500 })
  }
}
