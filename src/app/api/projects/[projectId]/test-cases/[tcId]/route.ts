import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const testCase = await prisma.testCase.findFirst({
    where: { id: params.tcId, projectId: params.projectId },
        include: {
      steps: { orderBy: { stepNumber: "asc" } },
      requiredCredential: {
        select: { id: true, roleName: true },
      },
      requirements: {
        include: {
          requirement: true
        }
      }
    },
  })

  if (!testCase) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 })
  }

  return NextResponse.json({ testCase })
}

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const { steps, moduleId, featureId, componentId, requirementIds, ...testCaseData } = body

  let moduleName = testCaseData.module || "General"
  let finalModuleId = moduleId || null
  let finalFeatureId = featureId || null
  let finalComponentId = componentId || null

  if (finalComponentId && (!finalFeatureId || !finalModuleId)) {
    const c = await prisma.projectComponent.findUnique({ where: { id: finalComponentId } })
    if (c) {
      finalFeatureId = c.featureId
      finalModuleId = c.moduleId
    }
  } else if (finalFeatureId && !finalModuleId) {
    const f = await prisma.projectFeature.findUnique({ where: { id: finalFeatureId } })
    if (f) {
      finalModuleId = f.moduleId
    }
  }

  if (finalModuleId) {
    const m = await prisma.projectModule.findUnique({ where: { id: finalModuleId } })
    if (m) {
      moduleName = m.name
    }
  }

  const testCase = await prisma.testCase.update({
    where: { id: params.tcId },
    data: {
      ...testCaseData,
      moduleId: finalModuleId,
      featureId: finalFeatureId,
      componentId: finalComponentId,
      module: moduleName,
      steps: steps
        ? {
            deleteMany: {},
            create: steps.map((step: any, index: number) => ({
              ...step,
              stepNumber: index + 1,
            })),
          }
        : undefined,
      requirements: requirementIds && Array.isArray(requirementIds)
        ? {
            deleteMany: {},
            create: requirementIds.map((reqId: string) => ({
              requirementId: reqId
            }))
          }
        : undefined
    },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
    },
  })

  return NextResponse.json({ testCase })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  await prisma.testCase.delete({ where: { id: params.tcId } })

  return NextResponse.json({ success: true })
}
