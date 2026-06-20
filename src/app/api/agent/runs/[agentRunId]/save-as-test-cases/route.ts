import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function POST(
  request: Request,
  { params }: { params: { agentRunId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { selectedTestNames } = body

    if (!selectedTestNames || !Array.isArray(selectedTestNames)) {
      return NextResponse.json({ error: "Missing or invalid field: selectedTestNames" }, { status: 400 })
    }

    const run = await prisma.qAAgentRun.findUnique({
      where: { id: params.agentRunId }
    })

    if (!run || !run.plan) {
      return notFoundResponse("QA Agent run plan not found")
    }

    const plan = run.plan as any
    const testsToProcess = plan.tests || []

    let createdCount = 0
    let duplicatedCount = 0
    let skippedCount = 0

    for (const test of testsToProcess) {
      if (!selectedTestNames.includes(test.name)) {
        skippedCount++
        continue
      }

      // Check if test case title already exists in project
      const existingTestCase = await prisma.testCase.findFirst({
        where: {
          projectId: run.projectId,
          title: test.name
        }
      })

      if (existingTestCase) {
        duplicatedCount++
        continue
      }

      // Create new test case and steps
      await prisma.testCase.create({
        data: {
          projectId: run.projectId,
          title: test.name,
          source: "AIGenerated",
          priority: "Medium",
          steps: {
            create: test.steps.map((s: any, idx: number) => ({
              stepNumber: idx + 1,
              actionDescription: s.expected ? `${s.action} on ${s.target}` : s.action,
              expectedResult: s.expected || "Action succeeds",
              actionType: (s.action as any) || "custom_instruction",
              targetType: (s.targetType as any) || "none",
              targetValue: s.targetValue || null,
              inputValue: s.value || null
            }))
          }
        }
      })

      createdCount++
    }

    return NextResponse.json({
      summary: {
        created: createdCount,
        duplicated: duplicatedCount,
        skipped: skippedCount
      }
    })
  } catch (err: any) {
    console.error("[QAAgentSaveTestsAPI] Failed to save test cases:", err)
    return NextResponse.json({ error: err.message || "Failed to save generated test cases" }, { status: 500 })
  }
}
