import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import * as fs from "fs"
import * as path from "path"

const STORAGE_ROOT = path.resolve(process.cwd(), "storage")

function isUnderStorageRoot(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  return resolved.startsWith(STORAGE_ROOT)
}

function collectFilePaths(obj: any, fields: string[]): string[] {
  const paths: string[] = []
  if (!obj) return paths
  for (const field of fields) {
    const val = obj[field]
    if (val && typeof val === "string" && val.trim().length > 0) {
      paths.push(val)
    }
  }
  return paths
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { testCaseId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) {
    return unauthorizedResponse(auth.error)
  }
  const session = auth.session!

  const testCaseId = params.testCaseId

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return badRequestResponse("Invalid request body")
  }

  const bodySchema = z.object({
    confirmTitle: z.string()
  })
  const parse = bodySchema.safeParse(body)
  if (!parse.success) {
    return badRequestResponse(parse.error.errors[0].message)
  }
  const { confirmTitle } = parse.data

  // 1. Load test case with project ownership check
  const testCase = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    include: {
      project: { select: { id: true, userId: true } },
      steps: true,
      testRuns: {
        include: {
          stepResults: true,
          logs: true,
          networkLogs: true,
          attachments: true,
          visualResults: true,
          bugReports: {
            include: {
              comments: true,
              activities: true,
              bugAttachments: true,
              attachments: true,
              requirements: true,
              visualIssues: true,
            }
          },
          jobs: true
        }
      },
      manualSessionCases: {
        include: {
          stepResults: true
        }
      },
      requirements: true,
      bugReports: {
        include: {
          comments: true,
          activities: true,
          bugAttachments: true,
          attachments: true,
          requirements: true,
          visualIssues: true
        }
      }
    }
  })

  if (!testCase) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 })
  }

  // Verify project ownership
  if (testCase.project.userId !== session!.user.id) {
    return NextResponse.json({ error: "Not authorized to delete this test case" }, { status: 403 })
  }

  // Verify confirmation title
  if (!confirmTitle || confirmTitle !== testCase.title) {
    return NextResponse.json({ 
      error: "Confirmation title does not match. You must type the exact test case title to confirm deletion.",
      expectedTitle: testCase.title
    }, { status: 400 })
  }

  // 2. Collect all file paths before deletion
  const filesToDelete: string[] = []

  // From test step results
  for (const run of testCase.testRuns) {
    for (const sr of run.stepResults) {
      filesToDelete.push(...collectFilePaths(sr, ["screenshotBefore", "screenshotAfter"]))
    }
    // From attachments on runs
    for (const att of run.attachments) {
      filesToDelete.push(...collectFilePaths(att, ["filePath"]))
    }
    // From visual comparison results
    for (const vr of run.visualResults) {
      filesToDelete.push(...collectFilePaths(vr, ["figmaImagePath", "actualImagePath", "diffImagePath"]))
    }
    // From bug reports linked to runs
    for (const bug of run.bugReports) {
      filesToDelete.push(...collectFilePaths(bug, ["screenshotPath"]))
      for (const ba of bug.bugAttachments) {
        filesToDelete.push(...collectFilePaths(ba, ["filePath"]))
      }
      for (const att of bug.attachments) {
        filesToDelete.push(...collectFilePaths(att, ["filePath"]))
      }
      for (const vi of bug.visualIssues) {
        filesToDelete.push(...collectFilePaths(vi, ["expectedCropPath", "actualCropPath", "diffCropPath"]))
      }
    }
  }

  // From bug reports linked directly to test case
  for (const bug of testCase.bugReports) {
    filesToDelete.push(...collectFilePaths(bug, ["screenshotPath"]))
    for (const ba of bug.bugAttachments) {
      filesToDelete.push(...collectFilePaths(ba, ["filePath"]))
    }
    for (const att of bug.attachments) {
      filesToDelete.push(...collectFilePaths(att, ["filePath"]))
    }
    for (const vi of bug.visualIssues) {
      filesToDelete.push(...collectFilePaths(vi, ["expectedCropPath", "actualCropPath", "diffCropPath"]))
    }
  }

  // From manual session step results
  for (const msc of testCase.manualSessionCases) {
    for (const msr of msc.stepResults) {
      filesToDelete.push(...collectFilePaths(msr, ["screenshotPath"]))
    }
  }

  // 3. Determine which bug reports are exclusive to this test case
  const allBugIds = new Set<string>()
  for (const run of testCase.testRuns) {
    for (const bug of run.bugReports) {
      allBugIds.add(bug.id)
    }
  }
  for (const bug of testCase.bugReports) {
    allBugIds.add(bug.id)
  }

  // Check which bugs are exclusively linked to this test case
  const exclusiveBugIds: string[] = []
  const sharedBugIds: string[] = []

  for (const bugId of Array.from(allBugIds)) {
    const bug = await prisma.bugReport.findUnique({
      where: { id: bugId },
      select: { testCaseId: true, testRunId: true }
    })
    if (!bug) continue

    // A bug is exclusive if its only testCaseId is this test case
    // Check if any OTHER test case references this bug
    const otherLinks = await prisma.bugReport.findFirst({
      where: {
        id: bugId,
        testCaseId: {
          not: testCaseId,
        },
      }
    })

    if (!otherLinks) {
      exclusiveBugIds.push(bugId)
    } else {
      sharedBugIds.push(bugId)
    }
  }

  // 4. Delete in transaction
  const deletionSummary = {
    testCase: 0,
    steps: 0,
    testRuns: 0,
    stepResults: 0,
    logs: 0,
    networkLogs: 0,
    attachments: 0,
    bugReports: 0,
    manualSessionCases: 0,
    manualStepResults: 0,
    requirements: 0,
    visualResults: 0,
    files: 0,
    fileErrors: [] as string[]
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Collect IDs
      const testRunIds = testCase.testRuns.map(r => r.id)
      const stepResultIds = testCase.testRuns.flatMap(r => r.stepResults.map(sr => sr.id))
      const manualSessionCaseIds = testCase.manualSessionCases.map(msc => msc.id)

      // Delete visual comparison results linked to test runs
      if (testRunIds.length > 0) {
        const vr = await tx.visualComparisonResult.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        deletionSummary.visualResults += vr.count
      }

      // Delete logs linked to test runs
      if (testRunIds.length > 0) {
        const logs = await tx.log.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        deletionSummary.logs += logs.count
      }

      // Delete network logs linked to test runs
      if (testRunIds.length > 0) {
        const nlogs = await tx.networkLog.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        deletionSummary.networkLogs += nlogs.count
      }

      // Delete attachments linked to test runs
      if (testRunIds.length > 0) {
        const atts = await tx.attachment.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        deletionSummary.attachments += atts.count
      }

      // Handle exclusive bug reports - delete them completely
      if (exclusiveBugIds.length > 0) {
        // Delete bug sub-records
        await tx.bugAttachment.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugActivity.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugComment.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugReportRequirement.deleteMany({ where: { bugReportId: { in: exclusiveBugIds } } })
        await tx.attachment.deleteMany({ where: { bugReportId: { in: exclusiveBugIds } } })
        
        // Unlink visual difference issues from exclusive bugs
        await tx.visualDifferenceIssue.updateMany({
          where: { bugReportId: { in: exclusiveBugIds } },
          data: { bugReportId: null }
        })

        const bugs = await tx.bugReport.deleteMany({ where: { id: { in: exclusiveBugIds } } })
        deletionSummary.bugReports += bugs.count
      }

      // Handle shared bug reports - nullify links
      if (sharedBugIds.length > 0) {
        await tx.bugReport.updateMany({
          where: { id: { in: sharedBugIds } },
          data: { testCaseId: null }
        })
      }

      // Also nullify any remaining bug reports that reference test runs being deleted
      if (testRunIds.length > 0) {
        await tx.bugReport.updateMany({
          where: { 
            testRunId: { in: testRunIds },
            id: { notIn: exclusiveBugIds }
          },
          data: { testRunId: null }
        })
      }

      // Delete manual step results
      if (manualSessionCaseIds.length > 0) {
        const msr = await tx.manualStepResult.deleteMany({
          where: { sessionCaseId: { in: manualSessionCaseIds } }
        })
        deletionSummary.manualStepResults += msr.count
      }

      // Delete manual session cases
      if (manualSessionCaseIds.length > 0) {
        const msc = await tx.manualSessionCase.deleteMany({
          where: { id: { in: manualSessionCaseIds } }
        })
        deletionSummary.manualSessionCases += msc.count
      }

      // Delete test step results
      if (testRunIds.length > 0) {
        const srs = await tx.testStepResult.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        deletionSummary.stepResults += srs.count
      }

      // Delete test case requirement links
      const reqs = await tx.testCaseRequirement.deleteMany({
        where: { testCaseId }
      })
      deletionSummary.requirements += reqs.count

      // Delete test jobs
      if (testRunIds.length > 0) {
        await tx.testJob.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
      }

      // Delete test runs
      if (testRunIds.length > 0) {
        const runs = await tx.testRun.deleteMany({
          where: { id: { in: testRunIds } }
        })
        deletionSummary.testRuns += runs.count
      }

      // Delete test steps
      const steps = await tx.testStep.deleteMany({
        where: { testCaseId }
      })
      deletionSummary.steps += steps.count

      // Delete the test case itself
      await tx.testCase.delete({
        where: { id: testCaseId }
      })
      deletionSummary.testCase = 1
    })
  } catch (err: any) {
    console.error("Error during permanent delete transaction:", err)
    return NextResponse.json({ 
      error: "Failed to delete test case permanently",
      details: err.message 
    }, { status: 500 })
  }

  // 5. Delete file artifacts (after successful DB transaction)
  const uniqueFiles = Array.from(new Set(filesToDelete))
  for (const filePath of uniqueFiles) {
    try {
      const resolvedPath = path.resolve(filePath)
      if (isUnderStorageRoot(resolvedPath) && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath)
        deletionSummary.files++
      }
    } catch (err: any) {
      deletionSummary.fileErrors.push(`Failed to delete ${filePath}: ${err.message}`)
      console.error(`Failed to delete file artifact: ${filePath}`, err)
    }
  }

  return NextResponse.json({
    success: true,
    deleted: deletionSummary
  })
}
