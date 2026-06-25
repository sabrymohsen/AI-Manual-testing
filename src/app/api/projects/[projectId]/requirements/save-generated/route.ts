import { NextRequest, NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import type { GeneratedTestCaseFromReq } from "@/lib/requirements/rule-based-generator"

const VALID_ACTION_TYPES = new Set([
  "open_url","click","fill","select","select_custom","select_searchable","multi_select",
  "remove_multi_select_value","autocomplete_select","date_select","time_select","upload_file",
  "check","uncheck","radio_select","tab_select","menu_select","modal_open","modal_close",
  "table_row_select","pagination_next","pagination_previous","accordion_expand","accordion_collapse",
  "toggle_on","toggle_off","slider_set","wait_for_text","wait_for_url","assert_visible",
  "assert_hidden","assert_text","assert_url","assert_api_status","screenshot","custom_instruction",
])

const VALID_TARGET_TYPES = new Set([
  "test_id","role","text","label","placeholder","css","xpath","url","none",
])

function sanitize(val: any, valid: Set<string>, fallback: string): string {
  return typeof val === "string" && valid.has(val) ? val : fallback
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const {
      testCases,
      importId,
      moduleId,
      featureId,
      componentId,
      saveRequirements = true,
    }: {
      testCases: (GeneratedTestCaseFromReq & { selected?: boolean })[]
      importId?: string
      moduleId?: string
      featureId?: string
      componentId?: string
      saveRequirements?: boolean
    } = body

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return NextResponse.json({ error: "No test cases to save" }, { status: 400 })
    }

    const selectedCases = testCases.filter(tc => tc.selected !== false)
    if (selectedCases.length === 0) {
      return NextResponse.json({ error: "No test cases selected" }, { status: 400 })
    }

    const savedTestCases: any[] = []
    const savedRequirements: any[] = []

    // Resolve hierarchy by name if IDs not provided
    const resolvedModuleId = moduleId || null
    const resolvedFeatureId = featureId || null
    const resolvedComponentId = componentId || null

    await prisma.$transaction(async (tx) => {
      for (const tc of selectedCases) {
        // Resolve module from tc.module name if no explicit moduleId
        let tcModuleId = resolvedModuleId
        let tcFeatureId = resolvedFeatureId
        let tcComponentId = resolvedComponentId
        let tcModuleName = tc.module || "General"

        if (!tcModuleId && tc.module) {
          let mod = await tx.projectModule.findFirst({
            where: { projectId: params.projectId, name: { equals: tc.module, mode: "insensitive" } },
          })
          if (!mod) {
            mod = await tx.projectModule.create({
              data: { projectId: params.projectId, name: tc.module },
            })
          }
          tcModuleId = mod.id
          tcModuleName = mod.name
        }

        if (!tcFeatureId && tc.feature && tcModuleId) {
          let feat = await tx.projectFeature.findFirst({
            where: { projectId: params.projectId, moduleId: tcModuleId, name: { equals: tc.feature, mode: "insensitive" } },
          })
          if (!feat) {
            feat = await tx.projectFeature.create({
              data: { projectId: params.projectId, moduleId: tcModuleId, name: tc.feature },
            })
          }
          tcFeatureId = feat.id
        }

        if (!tcComponentId && tc.component && tcFeatureId) {
          let comp = await tx.projectComponent.findFirst({
            where: { projectId: params.projectId, featureId: tcFeatureId, name: { equals: tc.component, mode: "insensitive" } },
          })
          if (!comp) {
            comp = await tx.projectComponent.create({
              data: { projectId: params.projectId, featureId: tcFeatureId, moduleId: tcModuleId!, name: tc.component },
            })
          }
          tcComponentId = comp.id
        }

        const created = await tx.testCase.create({
          data: {
            projectId: params.projectId,
            title: tc.title,
            module: tcModuleName,
            priority: tc.priority as any,
            preconditions: tc.preconditions || null,
            source: "RequirementFile",
            moduleId: tcModuleId,
            featureId: tcFeatureId,
            componentId: tcComponentId,
            tags: tc.tags || [],
            testData: tc.testData as any || null,
            steps: {
              create: tc.steps.map((s, i) => ({
                stepNumber: s.stepNumber || i + 1,
                actionDescription: s.actionDescription,
                expectedResult: s.expectedResult,
                actionType: sanitize(s.actionType, VALID_ACTION_TYPES, "custom_instruction") as any,
                targetType: sanitize(s.targetType, VALID_TARGET_TYPES, "none") as any,
                targetValue: s.targetValue || null,
                inputValue: s.inputValue || null,
                timeoutMs: s.timeoutMs || 10000,
              })),
            },
          },
          include: { steps: { orderBy: { stepNumber: "asc" } } },
        })
        savedTestCases.push(created)

        // Create/link requirement if requirementKey is available
        if (saveRequirements && tc.requirementKey) {
          let req = await tx.requirement.findFirst({
            where: { projectId: params.projectId, requirementKey: tc.requirementKey },
          })
          if (!req) {
            req = await tx.requirement.create({
              data: {
                projectId: params.projectId,
                requirementKey: tc.requirementKey,
                title: tc.title.substring(0, 200),
                description: tc.description || null,
                priority: tc.priority as any,
                status: "ReadyForTesting",
                source: "AIGenerated",
                moduleId: tcModuleId,
                featureId: tcFeatureId,
                componentId: tcComponentId,
                sourceImportId: importId || null,
              },
            })
          }

          // Link test case ↔ requirement
          const existingLink = await tx.testCaseRequirement.findFirst({
            where: { testCaseId: created.id, requirementId: req.id },
          })
          if (!existingLink) {
            await tx.testCaseRequirement.create({
              data: { testCaseId: created.id, requirementId: req.id },
            })
          }
          savedRequirements.push(req)
        }
      }

      // Update import status
      if (importId) {
        await tx.requirementImport.update({
          where: { id: importId },
          data: {
            status: "Saved",
            summary: {
              savedTestCases: savedTestCases.length,
              savedRequirements: savedRequirements.length,
              savedAt: new Date().toISOString(),
            } as any,
          },
        })
      }
    })

    return NextResponse.json({
      testCases: savedTestCases,
      requirements: savedRequirements,
      count: savedTestCases.length,
      requirementsCount: savedRequirements.length,
    })
  } catch (error: any) {
    console.error("POST /requirements/save-generated error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to save test cases" },
      { status: 500 }
    )
  }
}
