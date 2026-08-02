import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, requireProjectMember, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { createTestCaseSchema } from "@/schemas"

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
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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

export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const fs = require("fs")
  const path = require("path")

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

  try {
    const body = await request.json()
    const { ids } = body
    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: "Invalid IDs list" }, { status: 400 })
    }

    const testCases = await prisma.testCase.findMany({
      where: {
        id: { in: ids },
        projectId: params.projectId,
      },
      include: {
        testRuns: { select: { id: true } },
        manualSessionCases: { select: { id: true } }
      }
    })

    const foundIds = testCases.map(tc => tc.id)
    if (foundIds.length === 0) {
      return NextResponse.json({ success: true, count: 0 })
    }

    const testRunIds = testCases.flatMap(tc => tc.testRuns.map(r => r.id))
    const manualSessionCaseIds = testCases.flatMap(tc => tc.manualSessionCases.map(m => m.id))

    // Fetch full data for file cleanup and exclusive bug checks
    const testCasesFull = await prisma.testCase.findMany({
      where: { id: { in: foundIds } },
      include: {
        steps: true,
        testRuns: {
          include: {
            stepResults: true,
            attachments: true,
            visualResults: true,
            bugReports: {
              include: {
                bugAttachments: true,
                attachments: true,
                visualIssues: true,
              }
            }
          }
        },
        manualSessionCases: {
          include: {
            stepResults: true
          }
        },
        bugReports: {
          include: {
            bugAttachments: true,
            attachments: true,
            visualIssues: true
          }
        }
      }
    })

    const filesToDelete: string[] = []
    for (const tc of testCasesFull) {
      for (const run of tc.testRuns) {
        for (const sr of run.stepResults) {
          filesToDelete.push(...collectFilePaths(sr, ["screenshotBefore", "screenshotAfter"]))
        }
        for (const att of run.attachments) {
          filesToDelete.push(...collectFilePaths(att, ["filePath"]))
        }
        for (const vr of run.visualResults) {
          filesToDelete.push(...collectFilePaths(vr, ["figmaImagePath", "actualImagePath", "diffImagePath"]))
        }
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
      for (const bug of tc.bugReports) {
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
      for (const msc of tc.manualSessionCases) {
        for (const msr of msc.stepResults) {
          filesToDelete.push(...collectFilePaths(msr, ["screenshotPath"]))
        }
      }
    }

    // Determine exclusive vs shared bug reports
    const allBugIds = new Set<string>()
    for (const tc of testCasesFull) {
      for (const run of tc.testRuns) {
        for (const bug of run.bugReports) {
          allBugIds.add(bug.id)
        }
      }
      for (const bug of tc.bugReports) {
        allBugIds.add(bug.id)
      }
    }

    const exclusiveBugIds: string[] = []
    const sharedBugIds: string[] = []

    for (const bugId of Array.from(allBugIds)) {
      const otherLinks = await prisma.bugReport.findFirst({
        where: {
          id: bugId,
          OR: [
            { testCaseId: { notIn: foundIds, not: null } },
          ]
        }
      })

      if (!otherLinks) {
        exclusiveBugIds.push(bugId)
      } else {
        sharedBugIds.push(bugId)
      }
    }

    await prisma.$transaction(async (tx) => {
      if (testRunIds.length > 0) {
        await tx.visualComparisonResult.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        await tx.log.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        await tx.networkLog.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        await tx.attachment.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
      }

      if (exclusiveBugIds.length > 0) {
        await tx.bugAttachment.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugActivity.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugComment.deleteMany({ where: { bugId: { in: exclusiveBugIds } } })
        await tx.bugReportRequirement.deleteMany({ where: { bugReportId: { in: exclusiveBugIds } } })
        await tx.attachment.deleteMany({ where: { bugReportId: { in: exclusiveBugIds } } })
        
        await tx.visualDifferenceIssue.updateMany({
          where: { bugReportId: { in: exclusiveBugIds } },
          data: { bugReportId: null }
        })

        await tx.bugReport.deleteMany({ where: { id: { in: exclusiveBugIds } } })
      }

      if (sharedBugIds.length > 0) {
        await tx.bugReport.updateMany({
          where: { id: { in: sharedBugIds } },
          data: { testCaseId: null }
        })
      }

      if (testRunIds.length > 0) {
        await tx.bugReport.updateMany({
          where: { 
            testRunId: { in: testRunIds },
            id: { notIn: exclusiveBugIds }
          },
          data: { testRunId: null }
        })
      }

      if (manualSessionCaseIds.length > 0) {
        await tx.manualStepResult.deleteMany({
          where: { sessionCaseId: { in: manualSessionCaseIds } }
        })
        await tx.manualSessionCase.deleteMany({
          where: { id: { in: manualSessionCaseIds } }
        })
      }

      if (testRunIds.length > 0) {
        await tx.testStepResult.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        await tx.testJob.deleteMany({
          where: { testRunId: { in: testRunIds } }
        })
        await tx.testRun.deleteMany({
          where: { id: { in: testRunIds } }
        })
      }

      await tx.testCaseRequirement.deleteMany({
        where: { testCaseId: { in: foundIds } }
      })

      await tx.testStep.deleteMany({
        where: { testCaseId: { in: foundIds } }
      })

      await tx.testCase.deleteMany({
        where: { id: { in: foundIds } }
      })
    })

    const STORAGE_ROOT = path.resolve(process.cwd(), "storage")
    const isUnderStorageRoot = (filePath: string): boolean => {
      const resolved = path.resolve(filePath)
      return resolved.startsWith(STORAGE_ROOT)
    }

    const uniqueFiles = Array.from(new Set(filesToDelete))
    for (const filePath of uniqueFiles) {
      try {
        const resolvedPath = path.resolve(filePath)
        if (isUnderStorageRoot(resolvedPath) && fs.existsSync(resolvedPath)) {
          fs.unlinkSync(resolvedPath)
        }
      } catch (err: any) {
        console.error(`Failed to delete file artifact: ${filePath}`, err)
      }
    }

    return NextResponse.json({ success: true, count: foundIds.length })
  } catch (err: any) {
    console.error("Bulk delete error:", err)
    return NextResponse.json({ error: err.message || "Failed to delete test cases" }, { status: 500 })
  }
}


