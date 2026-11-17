import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"
import { z } from "zod"

const bodySchema = z.object({
  title: z.string().optional(),
  severity: z.string().optional(),
  priority: z.string().optional(),
  notes: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: { runId: string, issueId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const issue = await prisma.visualDifferenceIssue.findUnique({
      where: { id: params.issueId },
      include: {
        run: {
          include: {
            project: { select: { id: true, userId: true, environment: true } },
            mapping: {
              include: {
                figmaFrame: true
              }
            }
          }
        }
      }
    })

    if (!issue || issue.runId !== params.runId) {
      return notFoundResponse("Difference issue not found")
    }

    if (!(await canUseProject(issue.run.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    if (issue.bugReportId) {
      return NextResponse.json({ error: "Bug report already created for this issue" }, { status: 400 })
    }

    const run = issue.run
    const mapping = run.mapping
    const project = run.project

    const rawBody = await request.json()
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.errors.map(e => e.message).join(", ") }, { status: 400 })
    }
    const body = rawBody
    const { title, severity, priority, notes } = body

    const bugTitle = title || `[Visual QA] Mismatch on ${mapping.figmaFrame.name} (${run.viewportWidth}x${run.viewportHeight})`
    const bugSeverity = severity || issue.severity || "Medium"
    const bugPriority = priority || "Medium"

    const stepsToReproduce = [
      `1. Open the target web page: ${mapping.appUrl}`,
      `2. Configure viewport to ${run.viewportWidth}x${run.viewportHeight} using ${run.browserType}`,
      `3. Authenticate using login role: ${run.roleUsed || "None"}`,
      `4. Verify visual alignment against Figma Frame "${mapping.figmaFrame.name}"`,
      `5. Mismatch region detected at x: ${issue.x}px, y: ${issue.y}px, size: ${issue.width}x${issue.height}px`,
      notes ? `\nNotes: ${notes}` : ""
    ].filter(Boolean).join("\n")

    const expectedResult = `Web app should render identical to Figma reference "${mapping.figmaFrame.name}". (Figma Crop: ${issue.expectedCropPath || "None"})`
    const actualResult = `Mismatched area detected at pixel coordinates x:${issue.x}, y:${issue.y}. Diff ratio inside region: ${issue.mismatchPercent.toFixed(1)}%. (Actual Crop: ${issue.actualCropPath || "None"}, Diff Crop: ${issue.diffCropPath || "None"})`

    // Create Bug Report record
    const bugReport = await prisma.bugReport.create({
      data: {
        projectId: project.id,
        title: bugTitle,
        severity: bugSeverity,
        priority: bugPriority,
        environment: project.environment,
        roleUsed: run.roleUsed || "None",
        browser: run.browserType,
        viewport: (run.viewportWidth <= 480 ? "Mobile" : run.viewportWidth <= 1024 ? "Tablet" : "Desktop") as any,
        stepsToReproduce,
        expectedResult,
        actualResult,
        screenshotPath: issue.diffCropPath || run.actualImagePath || null
      }
    })

    // Link issue to bug report
    const updatedIssue = await prisma.visualDifferenceIssue.update({
      where: { id: params.issueId },
      data: {
        bugReportId: bugReport.id,
        status: "Bug"
      }
    })

    return NextResponse.json({ success: true, bugReport, issue: updatedIssue })
  } catch (err: any) {
    console.error("Create visual bug report error:", err)
    return NextResponse.json({ error: err.message || "Failed to create visual bug report" }, { status: 500 })
  }
}
