import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireAuth, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"

const bodySchema = z.object({
  moduleId: z.string().optional(),
  featureId: z.string().optional(),
  componentId: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: { testCaseId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) {
    return unauthorizedResponse(auth.error)
  }

  const entity = await prisma.testCase.findFirst({
    where: { id: params.testCaseId, project: { userId: auth.session!.user.id } },
    select: { projectId: true }
  })
  if (!entity) {
    return notFoundResponse("Not found")
  }

  try {
    const body = await request.json()
    const parse = bodySchema.safeParse(body)
    if (!parse.success) {
      return badRequestResponse(parse.error.errors[0].message)
    }
    const { moduleId, featureId, componentId } = parse.data

    let finalModuleId = moduleId || null
    let finalFeatureId = featureId || null
    let finalComponentId = componentId || null
    let moduleNameString = "General"

    if (finalComponentId) {
      const component = await prisma.projectComponent.findUnique({
        where: { id: finalComponentId },
        include: {
          module: true
        }
      })
      if (!component) {
        return NextResponse.json({ error: "Component not found" }, { status: 404 })
      }
      finalFeatureId = component.featureId
      finalModuleId = component.moduleId
      moduleNameString = component.module?.name || "General"
    } else if (finalFeatureId) {
      const feature = await prisma.projectFeature.findUnique({
        where: { id: finalFeatureId },
        include: {
          module: true
        }
      })
      if (!feature) {
        return NextResponse.json({ error: "Feature not found" }, { status: 404 })
      }
      finalModuleId = feature.moduleId
      moduleNameString = feature.module?.name || "General"
    } else if (finalModuleId) {
      const projectModule = await prisma.projectModule.findUnique({
        where: { id: finalModuleId }
      })
      if (!projectModule) {
        return NextResponse.json({ error: "Module not found" }, { status: 404 })
      }
      moduleNameString = projectModule.name
    }

    const updated = await prisma.testCase.update({
      where: { id: params.testCaseId },
      data: {
        moduleId: finalModuleId,
        featureId: finalFeatureId,
        componentId: finalComponentId,
        module: moduleNameString
      }
    })

    return NextResponse.json({ testCase: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to move test case" }, { status: 500 })
  }
}
