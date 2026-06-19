import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

const confirmImportSchema = z.object({
  previewRows: z.array(z.any()).min(1, "previewRows is required"),
})

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const parsed = confirmImportSchema.safeParse(body)

    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { previewRows } = parsed.data

    let createdCount = 0
    let updatedCount = 0
    let moduleCreated = 0
    let featureCreated = 0
    let componentCreated = 0

    // Load existing folders for reference
    const modulesMap = new Map<string, string>() // name.toLowerCase() -> id
    const featuresMap = new Map<string, string>() // "moduleId:name.toLowerCase()" -> id
    const componentsMap = new Map<string, string>() // "featureId:name.toLowerCase()" -> id

    const dbModules = await prisma.projectModule.findMany({ where: { projectId: params.projectId } })
    dbModules.forEach(m => modulesMap.set(m.name.toLowerCase(), m.id))

    const dbFeatures = await prisma.projectFeature.findMany({ where: { projectId: params.projectId } })
    dbFeatures.forEach(f => featuresMap.set(`${f.moduleId}:${f.name.toLowerCase()}`, f.id))

    const dbComponents = await prisma.projectComponent.findMany({ where: { projectId: params.projectId } })
    dbComponents.forEach(c => componentsMap.set(`${c.featureId}:${c.name.toLowerCase()}`, c.id))

    // Let's run imports in transaction
    await prisma.$transaction(async (tx) => {
      for (const row of previewRows) {
        const {
          requirementKey,
          title,
          description,
          acceptanceCriteria,
          module: modName,
          feature: featName,
          component: compName,
          priority,
          status,
          figmaUrl,
          externalUrl,
          externalSystem
        } = row

        let moduleId: string | null = null
        let featureId: string | null = null
        let componentId: string | null = null

        // 1. Resolve Module
        if (modName && modName.trim()) {
          const mNameLower = modName.trim().toLowerCase()
          if (modulesMap.has(mNameLower)) {
            moduleId = modulesMap.get(mNameLower)!
          } else {
            const newMod = await tx.projectModule.create({
              data: {
                projectId: params.projectId,
                name: modName.trim(),
                orderIndex: dbModules.length + moduleCreated
              }
            })
            modulesMap.set(mNameLower, newMod.id)
            moduleId = newMod.id
            moduleCreated++
          }

          // 2. Resolve Feature
          if (moduleId && featName && featName.trim()) {
            const fNameLower = featName.trim().toLowerCase()
            const fKey = `${moduleId}:${fNameLower}`
            if (featuresMap.has(fKey)) {
              featureId = featuresMap.get(fKey)!
            } else {
              const newFeat = await tx.projectFeature.create({
                data: {
                  projectId: params.projectId,
                  moduleId: moduleId,
                  name: featName.trim(),
                  orderIndex: dbFeatures.length + featureCreated
                }
              })
              featuresMap.set(fKey, newFeat.id)
              featureId = newFeat.id
              featureCreated++
            }

            // 3. Resolve Component
            if (featureId && compName && compName.trim()) {
              const cNameLower = compName.trim().toLowerCase()
              const cKey = `${featureId}:${cNameLower}`
              if (componentsMap.has(cKey)) {
                componentId = componentsMap.get(cKey)!
              } else {
                const newComp = await tx.projectComponent.create({
                  data: {
                    projectId: params.projectId,
                    moduleId: moduleId,
                    featureId: featureId,
                    name: compName.trim(),
                    orderIndex: dbComponents.length + componentCreated
                  }
                })
                componentsMap.set(cKey, newComp.id)
                componentId = newComp.id
                componentCreated++
              }
            }
          }
        }

        // 4. Create or Update Requirement
        const existing = await tx.requirement.findFirst({
          where: {
            projectId: params.projectId,
            requirementKey: requirementKey.trim()
          }
        })

        const reqData = {
          title: title.trim(),
          description: description || null,
          acceptanceCriteria: acceptanceCriteria || null,
          priority: (priority || "Medium") as any,
          status: (status || "Draft") as any,
          source: "ExcelImport" as any,
          moduleId,
          featureId,
          componentId,
          figmaUrl: figmaUrl || null,
          externalUrl: externalUrl || null,
          externalSystem: externalSystem || null
        }

        if (existing) {
          await tx.requirement.update({
            where: { id: existing.id },
            data: reqData
          })
          updatedCount++
        } else {
          await tx.requirement.create({
            data: {
              projectId: params.projectId,
              requirementKey: requirementKey.trim(),
              ...reqData
            }
          })
          createdCount++
        }
      }
    })

    return NextResponse.json({
      success: true,
      summary: {
        createdRequirements: createdCount,
        updatedRequirements: updatedCount,
        createdModules: moduleCreated,
        createdFeatures: featureCreated,
        createdComponents: componentCreated
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to confirm import" },
      { status: 500 }
    )
  }
}
