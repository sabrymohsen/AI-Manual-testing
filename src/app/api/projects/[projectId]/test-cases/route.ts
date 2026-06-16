import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

async function resolveHierarchyIds(projectId: string, data: {
  moduleId?: string | null
  featureId?: string | null
  componentId?: string | null
  module?: string | null
  featureName?: string | null
  componentName?: string | null
}) {
  let finalModuleId = data.moduleId || null
  let finalFeatureId = data.featureId || null
  let finalComponentId = data.componentId || null
  let moduleString = data.module || "General"

  // 1. Resolve Component Name if componentId is not specified
  if (!finalComponentId && data.componentName) {
    let featureIdToUse = finalFeatureId
    if (!featureIdToUse && data.featureName) {
      let moduleIdToUse = finalModuleId
      if (!moduleIdToUse && data.module) {
        let m = await prisma.projectModule.findFirst({
          where: { projectId, name: { equals: data.module.trim(), mode: "insensitive" } }
        })
        if (!m) {
          m = await prisma.projectModule.create({
            data: { projectId, name: data.module.trim() }
          })
        }
        moduleIdToUse = m.id
        moduleString = m.name
      }
      
      if (!moduleIdToUse) {
        let m = await prisma.projectModule.findFirst({
          where: { projectId, name: { equals: "General", mode: "insensitive" } }
        })
        if (!m) {
          m = await prisma.projectModule.create({
            data: { projectId, name: "General" }
          })
        }
        moduleIdToUse = m.id
        moduleString = m.name
      }

      let f = await prisma.projectFeature.findFirst({
        where: { projectId, moduleId: moduleIdToUse!, name: { equals: data.featureName.trim(), mode: "insensitive" } }
      })
      if (!f) {
        f = await prisma.projectFeature.create({
          data: { projectId, moduleId: moduleIdToUse!, name: data.featureName.trim() }
        })
      }
      featureIdToUse = f.id
    }

    if (featureIdToUse) {
      const parentFeature = await prisma.projectFeature.findUnique({
        where: { id: featureIdToUse }
      })
      if (parentFeature) {
        let c = await prisma.projectComponent.findFirst({
          where: { projectId, featureId: featureIdToUse, name: { equals: data.componentName.trim(), mode: "insensitive" } }
        })
        if (!c) {
          c = await prisma.projectComponent.create({
            data: {
              projectId,
              featureId: featureIdToUse,
              moduleId: parentFeature.moduleId,
              name: data.componentName.trim()
            }
          })
        }
        finalComponentId = c.id
        finalFeatureId = c.featureId
        finalModuleId = c.moduleId
      }
    }
  }

  // 2. Resolve Feature Name if featureId/componentId is not specified
  if (!finalComponentId && !finalFeatureId && data.featureName) {
    let moduleIdToUse = finalModuleId
    if (!moduleIdToUse && data.module) {
      let m = await prisma.projectModule.findFirst({
        where: { projectId, name: { equals: data.module.trim(), mode: "insensitive" } }
      })
      if (!m) {
        m = await prisma.projectModule.create({
          data: { projectId, name: data.module.trim() }
        })
      }
      moduleIdToUse = m.id
      moduleString = m.name
    }

    if (!moduleIdToUse) {
      let m = await prisma.projectModule.findFirst({
        where: { projectId, name: { equals: "General", mode: "insensitive" } }
      })
      if (!m) {
        m = await prisma.projectModule.create({
          data: { projectId, name: "General" }
        })
      }
      moduleIdToUse = m.id
      moduleString = m.name
    }

    let f = await prisma.projectFeature.findFirst({
      where: { projectId, moduleId: moduleIdToUse!, name: { equals: data.featureName.trim(), mode: "insensitive" } }
    })
    if (!f) {
      f = await prisma.projectFeature.create({
        data: { projectId, moduleId: moduleIdToUse!, name: data.featureName.trim() }
      })
    }
    finalFeatureId = f.id
    finalModuleId = f.moduleId
  }

  // 3. Resolve Module Name if moduleId/featureId/componentId not specified
  if (!finalComponentId && !finalFeatureId && !finalModuleId && data.module) {
    let m = await prisma.projectModule.findFirst({
      where: { projectId, name: { equals: data.module.trim(), mode: "insensitive" } }
    })
    if (!m) {
      m = await prisma.projectModule.create({
        data: { projectId, name: data.module.trim() }
      })
    }
    finalModuleId = m.id
    moduleString = m.name
  }

  // 4. Fill parent relations if componentId/featureId was passed directly
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
    if (m) moduleString = m.name
  }

  return {
    moduleId: finalModuleId,
    featureId: finalFeatureId,
    componentId: finalComponentId,
    module: moduleString
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const testModule = searchParams.get("module")
  const priority = searchParams.get("priority")
  const source = searchParams.get("source")
  const moduleId = searchParams.get("moduleId")
  const featureId = searchParams.get("featureId")
  const componentId = searchParams.get("componentId")

  const testCases = await prisma.testCase.findMany({
    where: {
      projectId: params.projectId,
      project: { userId: session.user.id },
      ...(testModule ? { module: testModule } : {}),
      ...(priority ? { priority: priority as any } : {}),
      ...(source ? { source: source as any } : {}),
      ...(moduleId ? { moduleId: moduleId === "null" ? null : moduleId } : {}),
      ...(featureId ? { featureId: featureId === "null" ? null : featureId } : {}),
      ...(componentId ? { componentId: componentId === "null" ? null : componentId } : {})
    },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      moduleRelation: true,
      feature: true,
      component: true
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ testCases })
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()

  // Handle bulk insert
  if (body.action === "bulk" && Array.isArray(body.testCases)) {
    try {
      const results = await prisma.$transaction(
        async (tx) => {
          const tcs = []
          for (const tc of body.testCases) {
            const { steps, featureName, componentName, moduleId, featureId, componentId, requirementKeys, ...testCaseData } = tc
            
            // Resolve hierarchy values using transaction client
            const resolved = await resolveHierarchyIds(params.projectId, {
              moduleId,
              featureId,
              componentId,
              module: testCaseData.module,
              featureName,
              componentName
            })

            let requirementIds: string[] = []
            if (requirementKeys && Array.isArray(requirementKeys)) {
              const reqs = await tx.requirement.findMany({
                where: {
                  projectId: params.projectId,
                  requirementKey: { in: requirementKeys.map((k: string) => String(k).trim()) }
                }
              })
              requirementIds = reqs.map(r => r.id)
            }

            const created = await tx.testCase.create({
              data: {
                ...testCaseData,
                projectId: params.projectId,
                moduleId: resolved.moduleId,
                featureId: resolved.featureId,
                componentId: resolved.componentId,
                module: resolved.module,
                steps: {
                  create: (steps || []).map((step: any, index: number) => ({
                    ...step,
                    stepNumber: index + 1,
                  })),
                },
                requirements: requirementIds.length > 0 ? {
                  create: requirementIds.map(reqId => ({
                    requirementId: reqId
                  }))
                } : undefined
              },
              include: {
                steps: true,
                requirements: {
                  include: { requirement: true }
                }
              },
            })
            tcs.push(created)
          }
          return tcs
        }
      )
      return NextResponse.json({ testCases: results }, { status: 201 })
    } catch (err: any) {
      console.error("Bulk import error:", err)
      return NextResponse.json({ error: err.message || "Failed to import test cases" }, { status: 500 })
    }
  }

  // Handle single test case creation
  const { steps, featureName, componentName, moduleId, featureId, componentId, requirementIds, ...testCaseData } = body

  const resolved = await resolveHierarchyIds(params.projectId, {
    moduleId,
    featureId,
    componentId,
    module: testCaseData.module,
    featureName,
    componentName
  })

  const testCase = await prisma.testCase.create({
    data: {
      ...testCaseData,
      projectId: params.projectId,
      moduleId: resolved.moduleId,
      featureId: resolved.featureId,
      componentId: resolved.componentId,
      module: resolved.module,
      steps: {
        create: (steps || []).map((step: any, index: number) => ({
          ...step,
          stepNumber: index + 1,
        })),
      },
      requirements: requirementIds && Array.isArray(requirementIds)
        ? {
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

  return NextResponse.json({ testCase }, { status: 201 })
}

export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { ids } = body
    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: "Invalid IDs list" }, { status: 400 })
    }

    await prisma.testCase.deleteMany({
      where: {
        projectId: params.projectId,
        id: { in: ids },
      },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Bulk delete error:", err)
    return NextResponse.json({ error: err.message || "Failed to delete test cases" }, { status: 500 })
  }
}

