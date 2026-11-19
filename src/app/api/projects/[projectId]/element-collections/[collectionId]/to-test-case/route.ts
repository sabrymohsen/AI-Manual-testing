import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"

const VALID_TARGET_TYPES = ["test_id", "role", "text", "label", "placeholder", "css", "xpath", "url", "none"]

// Map a collection element's intended action onto a runner ActionType.
function toActionType(action: string | null | undefined): string {
  switch (action) {
    case "input":
      return "fill"
    case "select":
      return "select"
    case "verify":
      return "assert_visible"
    case "click":
    default:
      return "click"
  }
}

function fallbackLocators(el: any): string[] {
  const out: string[] = []
  if (el.cssSelector) out.push(`css=${el.cssSelector}`)
  if (el.xpathSelector) out.push(`xpath=${el.xpathSelector}`)
  if (el.testIdSelector) out.push(`testid=${el.testIdSelector}`)
  return out
}

function buildStep(el: any, stepNumber: number) {
  const action = toActionType(el.actionType)
  return {
    stepNumber,
    actionDescription: `${action} "${el.friendlyName}"`,
    expectedResult: action.startsWith("assert") ? `"${el.friendlyName}" is visible` : "Action completes successfully",
    actionType: action as any,
    targetType: (VALID_TARGET_TYPES.includes(el.locatorType) ? el.locatorType : "css") as any,
    targetValue: el.locatorValue || el.cssSelector || null,
    inputValue: null,
    timeoutMs: 10000,
    locatorCandidates: { fallbackLocators: fallbackLocators(el), context: "general" } as any,
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string; collectionId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json().catch(() => ({}))
  const mode: "create" | "append" = body.mode === "append" ? "append" : "create"

  const collection = await prisma.elementCollection.findFirst({
    where: { id: params.collectionId, projectId: params.projectId },
    include: { elements: { orderBy: { createdAt: "asc" } } },
  })
  if (!collection) return notFoundResponse("Collection not found")
  if (collection.elements.length === 0) return badRequestResponse("Collection has no elements")

  if (mode === "append") {
    if (!body.testCaseId) return badRequestResponse("testCaseId is required to append")
    const target = await prisma.testCase.findFirst({
      where: { id: body.testCaseId, projectId: params.projectId },
      include: { steps: { orderBy: { stepNumber: "desc" }, take: 1 } },
    })
    if (!target) return notFoundResponse("Target test case not found")
    const startNumber = (target.steps[0]?.stepNumber || 0) + 1

    await prisma.testStep.createMany({
      data: collection.elements.map((el, i) => ({
        testCaseId: target.id,
        ...buildStep(el, startNumber + i),
      })),
    })
    const updated = await prisma.testCase.findUnique({
      where: { id: target.id },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    })
    return NextResponse.json({ testCase: updated, mode: "append" })
  }

  // create
  const testCase = await prisma.testCase.create({
    data: {
      projectId: params.projectId,
      title: body.title || `${collection.name} (from collection)`,
      priority: "Medium",
      source: "Recorder",
      executionType: "Automated",
      steps: {
        create: collection.elements.map((el, i) => buildStep(el, i + 1)),
      },
    },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  })

  return NextResponse.json({ testCase, mode: "create" }, { status: 201 })
}
