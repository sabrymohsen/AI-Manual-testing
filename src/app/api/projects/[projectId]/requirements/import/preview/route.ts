import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

const previewImportSchema = z.object({
  rows: z.array(z.any()).min(1, "rows is required"),
  mapping: z.record(z.string(), z.any()).refine((v) => Object.keys(v).length > 0, { message: "mapping is required" }),
})

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const parsed = previewImportSchema.safeParse(body)

    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { rows, mapping } = parsed.data

    // Load existing structures for comparison
    const existingModules = await prisma.projectModule.findMany({ where: { projectId: params.projectId } })
    const existingFeatures = await prisma.projectFeature.findMany({ where: { projectId: params.projectId } })
    const existingComponents = await prisma.projectComponent.findMany({ where: { projectId: params.projectId } })
    const existingRequirements = await prisma.requirement.findMany({ where: { projectId: params.projectId } })
    const existingEpics = await prisma.epic.findMany({ where: { projectId: params.projectId } })

    // Epic cell values match an existing epic by key or title (case-insensitive)
    const findEpic = (ref: string) => {
      const refLower = ref.toLowerCase()
      return existingEpics.find(
        (e) => e.epicKey.toLowerCase() === refLower || e.title.toLowerCase() === refLower
      )
    }

    let createdReqsCount = 0
    let updatedReqsCount = 0
    const epicsToCreate = new Set<string>()
    const modulesToCreate = new Set<string>()
    const featuresToCreate = new Set<string>() // formatted as "Module Name -> Feature Name"
    const componentsToCreate = new Set<string>() // formatted as "Module Name -> Feature Name -> Component Name"
    
    const previewRows: any[] = []
    const skippedRows: any[] = []
    const errors: string[] = []

    rows.forEach((row: any, index: number) => {
      const rowNum = index + 2 // 1-based index plus header row
      
      const reqKey = mapping.requirementKey ? String(row[Number(mapping.requirementKey)] || "").trim() : ""
      const title = mapping.title ? String(row[Number(mapping.title)] || "").trim() : ""
      const description = mapping.description ? String(row[Number(mapping.description)] || "").trim() : ""
      const criteria = mapping.acceptanceCriteria ? String(row[Number(mapping.acceptanceCriteria)] || "").trim() : ""
      
      const epicRef = mapping.epic ? String(row[Number(mapping.epic)] || "").trim() : ""
      const modName = mapping.module ? String(row[Number(mapping.module)] || "").trim() : ""
      const featName = mapping.feature ? String(row[Number(mapping.feature)] || "").trim() : ""
      const compName = mapping.component ? String(row[Number(mapping.component)] || "").trim() : ""
      
      const priority = mapping.priority ? String(row[Number(mapping.priority)] || "").trim() : "Medium"
      const status = mapping.status ? String(row[Number(mapping.status)] || "").trim() : "Draft"
      const figmaUrl = mapping.figmaUrl ? String(row[Number(mapping.figmaUrl)] || "").trim() : ""
      const externalUrl = mapping.externalUrl ? String(row[Number(mapping.externalUrl)] || "").trim() : ""
      const externalSystem = mapping.externalSystem ? String(row[Number(mapping.externalSystem)] || "").trim() : ""

      if (!reqKey || !title) {
        skippedRows.push({ rowNum, reason: "Missing Key or Title" })
        return
      }

      // Check if Key exists
      const exists = existingRequirements.find(r => r.requirementKey.toLowerCase() === reqKey.toLowerCase())
      if (exists) {
        updatedReqsCount++
      } else {
        createdReqsCount++
      }

      // Track epics to auto-create (referenced by key/name but not found)
      let epicAction: "Link" | "Create" | null = null
      let resolvedEpic = ""
      if (epicRef) {
        const epicMatch = findEpic(epicRef)
        if (epicMatch) {
          epicAction = "Link"
          resolvedEpic = `${epicMatch.epicKey} — ${epicMatch.title}`
        } else {
          epicAction = "Create"
          resolvedEpic = epicRef
          epicsToCreate.add(epicRef)
        }
      }

      // Track folders to create
      if (modName) {
        const modKey = modName.toLowerCase()
        const modExists = existingModules.some(m => m.name.toLowerCase() === modKey)
        if (!modExists) {
          modulesToCreate.add(modName)
        }

        if (featName) {
          const featKey = `${modName.toLowerCase()} -> ${featName.toLowerCase()}`
          const featExists = existingFeatures.some(
            f => f.name.toLowerCase() === featName.toLowerCase() && 
            existingModules.find(m => m.id === f.moduleId)?.name.toLowerCase() === modKey
          )
          if (!featExists) {
            featuresToCreate.add(`${modName} -> ${featName}`)
          }

          if (compName) {
            const compKey = `${modName.toLowerCase()} -> ${featName.toLowerCase()} -> ${compName.toLowerCase()}`
            const compExists = existingComponents.some(
              c => c.name.toLowerCase() === compName.toLowerCase() && 
              existingFeatures.find(f => f.id === c.featureId)?.name.toLowerCase() === featName.toLowerCase()
            )
            if (!compExists) {
              componentsToCreate.add(`${modName} -> ${featName} -> ${compName}`)
            }
          }
        }
      }

      previewRows.push({
        rowNum,
        requirementKey: reqKey,
        title,
        description,
        acceptanceCriteria: criteria,
        epic: epicRef || null,
        epicAction,
        resolvedEpic: resolvedEpic || null,
        module: modName || null,
        feature: featName || null,
        component: compName || null,
        priority,
        status,
        figmaUrl: figmaUrl || null,
        externalUrl: externalUrl || null,
        externalSystem: externalSystem || null,
        action: exists ? "Update" : "Create"
      })
    })

    return NextResponse.json({
      previewRows,
      skippedRows,
      summary: {
        totalRows: rows.length,
        createdRequirements: createdReqsCount,
        updatedRequirements: updatedReqsCount,
        createdModules: modulesToCreate.size,
        createdFeatures: featuresToCreate.size,
        createdComponents: componentsToCreate.size,
        createdEpics: epicsToCreate.size,
        skippedRowsCount: skippedRows.length
      },
      newStructures: {
        epics: Array.from(epicsToCreate),
        modules: Array.from(modulesToCreate),
        features: Array.from(featuresToCreate),
        components: Array.from(componentsToCreate)
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to parse preview" },
      { status: 500 }
    )
  }
}
