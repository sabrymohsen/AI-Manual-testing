import { prisma } from "@/lib/db"

export async function generateMarkdownReport(testRunId: string): Promise<string> {
  const testRun = await prisma.testRun.findUnique({
    where: { id: testRunId },
    include: {
      testCase: {
        select: {
          title: true,
          module: true,
          requirements: {
            include: {
              requirement: {
                select: {
                  requirementKey: true,
                  title: true,
                  priority: true
                }
              }
            }
          }
        }
      },
      stepResults: { orderBy: { stepNumber: "asc" } },
      credential: { select: { roleName: true } },
      project: { select: { name: true, webAppUrl: true, environment: true } },
    },
  })

  if (!testRun) throw new Error("Test run not found")

  const lines: string[] = []
  lines.push(`# Test Run Report: ${testRun.project?.name || "Unknown Project"}`)
  lines.push("")
  lines.push(`**Test Case**: ${testRun.testCase?.title || "N/A"}`)
  lines.push(`**Module**: ${testRun.testCase?.module || "N/A"}`)
  lines.push(`**Status**: ${testRun.status}`)
  lines.push(`**Environment**: ${testRun.project?.environment || "N/A"}`)
  lines.push(`**Browser**: ${testRun.browserType}`)
  lines.push(`**Viewport**: ${testRun.viewport}`)
  lines.push(`**Role Used**: ${testRun.credential?.roleName || "None"}`)
  lines.push(`**Duration**: ${testRun.durationMs}ms`)
  lines.push(`**Started**: ${testRun.startedAt?.toISOString() || "N/A"}`)
  lines.push(`**Completed**: ${testRun.completedAt?.toISOString() || "N/A"}`)
  lines.push("")

  lines.push("## Linked Requirements")
  lines.push("")
  const reqs = testRun.testCase?.requirements || []
  if (reqs.length === 0) {
    lines.push("No requirements linked to this test case.")
  } else {
    lines.push("| Key | Title | Priority |")
    lines.push("|-----|-------|----------|")
    for (const r of reqs) {
      if (r.requirement) {
        lines.push(`| ${r.requirement.requirementKey} | ${r.requirement.title} | ${r.requirement.priority} |`)
      }
    }
  }
  lines.push("")

  lines.push("## Step Results")
  lines.push("")
  lines.push("| # | Action | Expected | Actual | Status | Duration |")
  lines.push("|---|--------|----------|--------|--------|----------|")

  for (const step of testRun.stepResults) {
    lines.push(
      `| ${step.stepNumber} | ${step.actionDescription} | ${step.expectedResult} | ${step.actualResult || "N/A"} | ${step.status} | ${step.durationMs}ms |`
    )
  }

  lines.push("")
  lines.push("## Summary")
  lines.push("")
  lines.push(`- **Passed**: ${testRun.stepResults.filter((s) => s.status === "Passed").length}`)
  lines.push(`- **Failed**: ${testRun.stepResults.filter((s) => s.status === "Failed").length}`)
  lines.push(`- **Blocked**: ${testRun.stepResults.filter((s) => s.status === "Blocked").length}`)
  lines.push(`- **Warning**: ${testRun.stepResults.filter((s) => s.status === "Warning").length}`)
  lines.push(`- **Skipped**: ${testRun.stepResults.filter((s) => s.status === "Skipped").length}`)
  lines.push("")

  const failedSteps = testRun.stepResults.filter((s) => s.status === "Failed")
  if (failedSteps.length > 0) {
    lines.push("## Failed Steps")
    lines.push("")
    for (const step of failedSteps) {
      lines.push(`### Step ${step.stepNumber}: ${step.actionDescription}`)
      lines.push(`- **Expected**: ${step.expectedResult}`)
      lines.push(`- **Actual**: ${step.actualResult || "N/A"}`)
      lines.push(`- **Error**: ${step.errorDetails || "N/A"}`)
      if (step.screenshotAfter) lines.push(`- **Screenshot**: ${step.screenshotAfter}`)
      lines.push("")
    }
  }

  return lines.join("\n")
}
