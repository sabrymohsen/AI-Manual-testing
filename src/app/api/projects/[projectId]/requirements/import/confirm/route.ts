import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"
import { z } from "zod"

const confirmImportSchema = z.object({
  previewRows: z.array(z.any()).min(1, "previewRows is required"),
})

/**
 * Spreadsheets carry free-form status/priority values ("Active", "P1", Arabic
 * labels, …). Normalize them onto the Prisma enums instead of failing the
 * whole import on the first unexpected value.
 */
function normalizeStatus(raw: unknown): "Draft" | "ReadyForTesting" | "InTesting" | "Covered" | "PartiallyCovered" | "Failed" | "Blocked" | "Deprecated" {
  const v = String(raw ?? "").trim().toLowerCase()
  if (!v) return "Draft"
  const exact: Record<string, any> = {
    draft: "Draft", readyfortesting: "ReadyForTesting", intesting: "InTesting",
    covered: "Covered", partiallycovered: "PartiallyCovered", failed: "Failed",
    blocked: "Blocked", deprecated: "Deprecated",
  }
  if (exact[v.replace(/[\s_-]/g, "")]) return exact[v.replace(/[\s_-]/g, "")]
  if (/active|approved|ready|open|new|todo|نشط|معتمد|جاهز/.test(v)) return "ReadyForTesting"
  if (/testing|progress|قيد/.test(v)) return "InTesting"
  if (/done|passed|complete|مكتمل|منجز/.test(v)) return "Covered"
  if (/fail|فشل/.test(v)) return "Failed"
  if (/block|hold|معلق|محظور/.test(v)) return "Blocked"
  if (/deprecat|obsolete|cancel|ملغي/.test(v)) return "Deprecated"
  return "Draft"
}

function normalizePriority(raw: unknown): "Low" | "Medium" | "High" | "Critical" {
  const v = String(raw ?? "").trim().toLowerCase()
  if (!v) return "Medium"
  if (/critical|urgent|highest|p0|p1|حرج|عاجل/.test(v)) return "Critical"
  if (/high|p2|عالي|مرتفع/.test(v)) return "High"
  if (/low|minor|p4|p5|منخفض|ضعيف/.test(v)) return "Low"
  if (/medium|normal|moderate|p3|متوسط|عادي/.test(v)) return "Medium"
  return "Medium"
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
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
    let epicCreated = 0
    let featureCreated = 0

    // Epics resolve by key OR title, features by key OR name (case-insensitive);
    // unmatched refs are auto-created with generated keys (implicit creation,
    // surfaced in the preview step).
    const epicsMap = new Map<string, string>() // key/title lowercase -> id
    const dbEpics = await prisma.epic.findMany({ where: { projectId: params.projectId } })
    dbEpics.forEach(e => {
      epicsMap.set(e.epicKey.toLowerCase(), e.id)
      epicsMap.set(e.title.toLowerCase(), e.id)
    })
    const takenEpicKeys = new Set(dbEpics.map(e => e.epicKey))
    const nextEpicKey = () => {
      let n = takenEpicKeys.size + 1
      while (takenEpicKeys.has(`EP-${n}`)) n++
      const key = `EP-${n}`
      takenEpicKeys.add(key)
      return key
    }

    const featuresMap = new Map<string, { id: string; epicId: string | null }>() // key/name lowercase -> feature
    const dbFeatures = await prisma.feature.findMany({ where: { projectId: params.projectId } })
    dbFeatures.forEach(f => {
      featuresMap.set(f.featureKey.toLowerCase(), { id: f.id, epicId: f.epicId })
      featuresMap.set(f.name.toLowerCase(), { id: f.id, epicId: f.epicId })
    })
    const takenFeatureKeys = new Set(dbFeatures.map(f => f.featureKey))
    const nextFeatureKey = () => {
      let n = takenFeatureKeys.size + 1
      while (takenFeatureKeys.has(`FT-${n}`)) n++
      const key = `FT-${n}`
      takenFeatureKeys.add(key)
      return key
    }

    await prisma.$transaction(async (tx) => {
      for (const row of previewRows) {
        const {
          requirementKey,
          title,
          description,
          acceptanceCriteria,
          epic: epicRef,
          feature: featureRef,
          priority,
          status,
          figmaUrl,
          externalUrl,
          externalSystem
        } = row

        // 1. Resolve / auto-create parent Epic
        let epicId: string | null = null
        if (epicRef && String(epicRef).trim()) {
          const refLower = String(epicRef).trim().toLowerCase()
          if (epicsMap.has(refLower)) {
            epicId = epicsMap.get(refLower)!
          } else {
            const newEpic = await tx.epic.create({
              data: {
                projectId: params.projectId,
                epicKey: nextEpicKey(),
                title: String(epicRef).trim()
              }
            })
            epicsMap.set(refLower, newEpic.id)
            epicsMap.set(newEpic.epicKey.toLowerCase(), newEpic.id)
            epicId = newEpic.id
            epicCreated++
          }
        }

        // 2. Resolve / auto-create Feature (created under the row's epic)
        let featureId: string | null = null
        if (featureRef && String(featureRef).trim()) {
          const refLower = String(featureRef).trim().toLowerCase()
          if (featuresMap.has(refLower)) {
            const feature = featuresMap.get(refLower)!
            featureId = feature.id
            // Assigning a feature auto-aligns the story's epic
            if (!epicId && feature.epicId) epicId = feature.epicId
          } else {
            const newFeature = await tx.feature.create({
              data: {
                projectId: params.projectId,
                featureKey: nextFeatureKey(),
                name: String(featureRef).trim(),
                epicId: epicId || null
              }
            })
            featuresMap.set(refLower, { id: newFeature.id, epicId: newFeature.epicId })
            featuresMap.set(newFeature.featureKey.toLowerCase(), { id: newFeature.id, epicId: newFeature.epicId })
            featureId = newFeature.id
            featureCreated++
          }
        }

        // 3. Create or Update Requirement
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
          priority: normalizePriority(priority),
          status: normalizeStatus(status),
          source: "ExcelImport" as any,
          epicId,
          featureId,
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
        createdEpics: epicCreated,
        createdFeatures: featureCreated
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to confirm import" },
      { status: 500 }
    )
  }
}
