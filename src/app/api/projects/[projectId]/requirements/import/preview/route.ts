import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"
import { z } from "zod"

const previewImportSchema = z.object({
  rows: z.array(z.any()).min(1, "rows is required"),
  mapping: z.record(z.string(), z.any()).refine((v) => Object.keys(v).length > 0, { message: "mapping is required" }),
})

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const parsed = previewImportSchema.safeParse(body)

    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { rows, mapping } = parsed.data

    // Load existing structures for comparison
    const existingRequirements = await prisma.requirement.findMany({ where: { projectId: params.projectId } })
    const existingEpics = await prisma.epic.findMany({ where: { projectId: params.projectId } })
    const existingFeatures = await prisma.feature.findMany({ where: { projectId: params.projectId } })

    // Epic / Feature cell values match by key or title/name (case-insensitive)
    const findEpic = (ref: string) => {
      const refLower = ref.toLowerCase()
      return existingEpics.find(
        (e) => e.epicKey.toLowerCase() === refLower || e.title.toLowerCase() === refLower
      )
    }
    const findFeature = (ref: string) => {
      const refLower = ref.toLowerCase()
      return existingFeatures.find(
        (f) => f.featureKey.toLowerCase() === refLower || f.name.toLowerCase() === refLower
      )
    }

    let createdReqsCount = 0
    let updatedReqsCount = 0
    const epicsToCreate = new Set<string>()
    const featuresToCreate = new Set<string>()

    const previewRows: any[] = []
    const skippedRows: any[] = []

    rows.forEach((row: any, index: number) => {
      const rowNum = index + 2 // 1-based index plus header row

      const reqKey = mapping.requirementKey ? String(row[Number(mapping.requirementKey)] || "").trim() : ""
      const title = mapping.title ? String(row[Number(mapping.title)] || "").trim() : ""
      const description = mapping.description ? String(row[Number(mapping.description)] || "").trim() : ""
      const criteria = mapping.acceptanceCriteria ? String(row[Number(mapping.acceptanceCriteria)] || "").trim() : ""

      const epicRef = mapping.epic ? String(row[Number(mapping.epic)] || "").trim() : ""
      const featureRef = mapping.feature ? String(row[Number(mapping.feature)] || "").trim() : ""

      const priority = mapping.priority ? String(row[Number(mapping.priority)] || "").trim() : "Medium"
      const status = mapping.status ? String(row[Number(mapping.status)] || "").trim() : "Draft"
      const figmaUrl = mapping.figmaUrl ? String(row[Number(mapping.figmaUrl)] || "").trim() : ""
      const externalUrl = mapping.externalUrl ? String(row[Number(mapping.externalUrl)] || "").trim() : ""
      const externalSystem = mapping.externalSystem ? String(row[Number(mapping.externalSystem)] || "").trim() : ""

      if (!reqKey || !title) {
        skippedRows.push({ rowNum, reason: "Missing Key or Title" })
        return
      }

      const exists = existingRequirements.find(r => r.requirementKey.toLowerCase() === reqKey.toLowerCase())
      if (exists) {
        updatedReqsCount++
      } else {
        createdReqsCount++
      }

      // Epics referenced but not found are auto-created on confirm
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

      // Same implicit-creation behavior for the Feature layer
      let featureAction: "Link" | "Create" | null = null
      let resolvedFeature = ""
      if (featureRef) {
        const featureMatch = findFeature(featureRef)
        if (featureMatch) {
          featureAction = "Link"
          resolvedFeature = `${featureMatch.featureKey} — ${featureMatch.name}`
        } else {
          featureAction = "Create"
          resolvedFeature = featureRef
          featuresToCreate.add(featureRef)
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
        feature: featureRef || null,
        featureAction,
        resolvedFeature: resolvedFeature || null,
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
        createdEpics: epicsToCreate.size,
        createdFeatures: featuresToCreate.size,
        skippedRowsCount: skippedRows.length
      },
      newStructures: {
        epics: Array.from(epicsToCreate),
        features: Array.from(featuresToCreate)
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to parse preview" },
      { status: 500 }
    )
  }
}
