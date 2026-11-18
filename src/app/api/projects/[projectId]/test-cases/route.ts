import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  requireProjectOwner,
  requireProjectMember,
  requireProjectPermission,
  unauthorizedResponse,
  badRequestResponse,
  notFoundResponse,
} from "@/lib/api-guards"
import { z } from "zod"
import { createTestCaseSchema } from "@/schemas"
import { createAuditLog } from "@/lib/auth/audit"
import { deleteCasesSafely } from "@/lib/test-cases/authoring"

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // Listing test cases is member-level. requireProjectOwner demanded
  // Owner/Admin, which locked ordinary members out of the page entirely.
  // Writes further down this file stay owner-gated.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const { searchParams } = new URL(request.url)
  const priority = searchParams.get("priority")
  const source = searchParams.get("source")
  const executionType = searchParams.get("executionType")

  const testCases = await prisma.testCase.findMany({
    where: {
      projectId: params.projectId,
      ...(priority ? { priority: priority as any } : {}),
      ...(source ? { source: source as any } : {}),
      ...(executionType ? { executionType: executionType as any } : {})
    },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      // Story links — powers the bulk-link picker's "already linked" badges,
      // the "no linked story" orphan filter, and Epic/Feature grouping.
      requirements: {
        select: {
          requirementId: true,
          requirement: {
            select: {
              id: true, requirementKey: true, title: true, epicId: true, featureId: true,
              epic: { select: { id: true, epicKey: true, title: true } },
              feature: { select: { id: true, featureKey: true, name: true } }
            }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ testCases })
}

const VALID_ACTION_TYPES = new Set([
  "open_url", "click", "fill", "select", "select_custom", "select_searchable",
  "multi_select", "remove_multi_select_value", "autocomplete_select", "date_select",
  "time_select", "upload_file", "check", "uncheck", "radio_select", "tab_select",
  "menu_select", "modal_open", "modal_close", "table_row_select", "pagination_next",
  "pagination_previous", "accordion_expand", "accordion_collapse", "toggle_on",
  "toggle_off", "slider_set", "wait_for_text", "wait_for_url", "assert_visible",
  "assert_hidden", "assert_text", "assert_url", "assert_api_status", "screenshot",
  "custom_instruction",
])

const VALID_TARGET_TYPES = new Set([
  "test_id", "role", "text", "label", "placeholder", "css", "xpath", "url", "none",
])

function sanitizeActionType(value: any): string {
  if (typeof value === "string" && VALID_ACTION_TYPES.has(value)) return value
  return "custom_instruction"
}

function sanitizeTargetType(value: any): string {
  if (typeof value === "string" && VALID_TARGET_TYPES.has(value)) return value
  return "none"
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()

  // Handle bulk insert
  if (body.action === "bulk" && Array.isArray(body.testCases)) {
    try {
      const results = await prisma.$transaction(
        async (tx) => {
          const tcs = []
          for (const tc of body.testCases) {
            // Hierarchy fields are legacy — classification now flows through
            // linked user stories, so they are stripped and ignored.
            const { steps, featureName, componentName, moduleId, featureId, componentId, module: _legacyModule, requirementKeys, ...testCaseData } = tc

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
                steps: {
                  create: (steps || []).map((step: any, index: number) => ({
                    ...step,
                    actionType: sanitizeActionType(step.actionType),
                    targetType: sanitizeTargetType(step.targetType),
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
  const { steps, featureName, componentName, moduleId, featureId, componentId, module: _legacyModule, requirementIds, ...testCaseData } = body

  const testCase = await prisma.testCase.create({
    data: {
      ...testCaseData,
      projectId: params.projectId,
      steps: {
        create: (steps || []).map((step: any, index: number) => ({
          ...step,
          actionType: sanitizeActionType(step.actionType),
          targetType: sanitizeTargetType(step.targetType),
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

/**
 * Bulk delete. Bugs and automated run history are kept — see
 * deleteCasesSafely. The previous version deleted every linked bug report and
 * its screenshots from disk.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canDeleteStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { ids } = body
    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: "Invalid IDs list" }, { status: 400 })
    }
    const { count } = await deleteCasesSafely(params.projectId, ids.filter((x: unknown) => typeof x === "string"))
    if (count > 0) {
      await createAuditLog({
        action: "Delete Test Cases",
        details: `Deleted ${count} test case(s) (bugs and run history kept)`,
        userId: auth.session!.user.id,
        projectId: params.projectId,
      })
    }
    return NextResponse.json({ success: true, count })
  } catch (err: any) {
    console.error("Bulk delete test cases error:", err)
    return NextResponse.json({ error: err.message || "Failed to delete test cases" }, { status: 500 })
  }
}
