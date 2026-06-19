import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { createTestCaseSchema } from "@/schemas"

async function resolveHierarchyIds(projectId: string, data: {
  moduleId?: string | null
  featureId?: string | null
  componentId?: string | null
  module?: string | null
  featureName?: string | null
  componentName?: string | null
}) {
  let finalModuleId = data.moduleId || null
  let finalFeatureId = data.featureId || null
  let finalComponentId = data.componentId || null
  let moduleString = data.module || "General"

  // 1. Resolve Component Name if componentId is not specified
  if (!finalComponentId && data.componentName) {
    let featureIdToUse = finalFeatureId
    if (!featureIdToUse && data.featureName) {
      let moduleIdToUse = finalModuleId
      if (!moduleIdToUse && data.module) {
        let m = await prisma.projectModule.findFirst({
          where: { projectId, name: { equals: data.module.trim(), mode: "insensitive" } }
        })
        if (!m) {
          m = await prisma.projectModule.create({
            data: { projectId, name: data.module.trim() }
          })
        }
        moduleIdToUse = m.id
        moduleString = m.name
      }
      
      if (!moduleIdToUse) {
        let m = await prisma.projectModule.findFirst({
          where: { projectId, name: { equals: "General", mode: "insensitive" } }
        })
        if (!m) {
          m = await prisma.projectModule.create({
            data: { projectId, name: "General" }
          })
        }
        moduleIdToUse = m.id
        moduleString = m.name
      }

      let f = await prisma.projectFeature.findFirst({
        where: { projectId, moduleId: moduleIdToUse!, name: { equals: data.featureName.trim(), mode: "insensitive" } }
      })
      if (!f) {
        f = await prisma.projectFeature.create({
          data: { projectId, moduleId: moduleIdToUse!, name: data.featureName.trim() }
        })
      }
      featureIdToUse = f.id
    }

    if (featureIdToUse) {
      const parentFeature = await prisma.projectFeature.findUnique({
        where: { id: featureIdToUse }
      })
      if (parentFeature) {
        let c = await prisma.projectComponent.findFirst({
          where: { projectId, featureId: featureIdToUse, name: { equals: data.componentName.trim(), mode: "insensitive" } }
        })
        if (!c) {
          c = await prisma.projectComponent.create({
            data: {
              projectId,
              featureId: featureIdToUse,
              moduleId: parentFeature.moduleId,
              name: data.componentName.trim()
            }
          })
        }
        finalComponentId = c.id
        finalFeatureId = c.featureId
        finalModuleId = c.moduleId
      }
    }
  }

  // 2. Resolve Feature Name if featureId/componentId is not specified
  if (!finalComponentId && !finalFeatureId && data.featureName) {
    let moduleIdToUse = finalModuleId
    if (!moduleIdToUse && data.module) {
      let m = await prisma.projectModule.findFirst({
        where: { projectId, name: { equals: data.module.trim(), mode: "insensitive" } }
      })
      if (!m) {
        m = await prisma.projectModule.create({
          data: { projectId, name: data.module.trim() }
        })
      }
      moduleIdToUse = m.id
      moduleString = m.name
    }

    if (!moduleIdToUse) {
      let m = await prisma.projectModule.findFirst({
        where: { projectId, name: { equals: "General", mode: "insensitive" } }
      })
      if (!m) {
        m = await prisma.projectModule.create({
          data: { projectId, name: "General" }
        })
      }
      moduleIdToUse = m.id
      moduleString = m.name
    }

    let f = await prisma.projectFeature.findFirst({
      where: { projectId, moduleId: moduleIdToUse!, name: { equals: data.featureName.trim(), mode: "insensitive" } }
    })
    if (!f) {
      f = await prisma.projectFeature.create({
        data: { projectId, moduleId: moduleIdToUse!, name: data.featureName.trim() }
      })
    }
    finalFeatureId = f.id
    finalModuleId = f.moduleId
  }

  // 3. Resolve Module Name if moduleId/featureId/componentId not specified
  if (!finalComponentId && !finalFeatureId && !finalModuleId && data.module) {
    let m = await prisma.projectModule.findFirst({
      where: { projectId, name: { equals: data.module.trim(), mode: "insensitive" } }
    })
    if (!m) {
      m = await prisma.projectModule.create({
        data: { projectId, name: data.module.trim() }
      })
    }
    finalModuleId = m.id
    moduleString = m.name
  }

  // 4. Fill parent relations if componentId/featureId was passed directly
  if (finalComponentId && (!finalFeatureId || !finalModuleId)) {
    const c = await prisma.projectComponent.findUnique({ where: { id: finalComponentId } })
    if (c) {
      finalFeatureId = c.featureId
      finalModuleId = c.moduleId
    }
  } else if (finalFeatureId && !finalModuleId) {
    const f = await prisma.projectFeature.findUnique({ where: { id: finalFeatureId } })
    if (f) {
      finalModuleId = f.moduleId
    }
  }

  if (finalModuleId) {
    const m = await prisma.projectModule.findUnique({ where: { id: finalModuleId } })
    if (m) moduleString = m.name
  }

  return {
    moduleId: finalModuleId,
    featureId: finalFeatureId,
    componentId: finalComponentId,
    module: moduleString
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const { searchParams } = new URL(request.url)
  const testModule = searchParams.get("module")
  const priority = searchParams.get("priority")
  const source = searchParams.get("source")
  const moduleId = searchParams.get("moduleId")
  const featureId = searchParams.get("featureId")
  const componentId = searchParams.get("componentId")

  const testCases = await prisma.testCase.findMany({
    where: {
      projectId: params.projectId,
      ...(testModule ? { module: testModule } : {}),
      ...(priority ? { priority: priority as any } : {}),
      ...(source ? { source: source as any } : {}),
      ...(moduleId ? { moduleId: moduleId === "null" ? null : moduleId } : {}),
      ...(featureId ? { featureId: featureId === "null" ? null : featureId } : {}),
      ...(componentId ? { componentId: componentId === "null" ? null : componentId } : {})
    },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      moduleRelation: true,
      feature: true,
      component: true
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ testCases })
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
            const { steps, featureName, componentName, moduleId, featureId, componentId, requirementKeys, ...testCaseData } = tc
            
            // Resolve hierarchy values using transaction client
            const resolved = await resolveHierarchyIds(params.projectId, {
              moduleId,
              featureId,
              componentId,
              module: testCaseData.module,
              featureName,
              componentName
            })

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
                moduleId: resolved.moduleId,
                featureId: resolved.featureId,
                componentId: resolved.componentId,
                module: resolved.module,
                steps: {
                  create: (steps || []).map((step: any, index: number) => ({
                    ...step,
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
  const { steps, featureName, componentName, moduleId, featureId, componentId, requirementIds, ...testCaseData } = body

  const resolved = await resolveHierarchyIds(params.projectId, {
    moduleId,
    featureId,
    componentId,
    module: testCaseData.module,
    featureName,
    componentName
  })

  const testCase = await prisma.testCase.create({
    data: {
      ...testCaseData,
      projectId: params.projectId,
      moduleId: resolved.moduleId,
      featureId: resolved.featureId,
      componentId: resolved.componentId,
      module: resolved.module,
      steps: {
        create: (steps || []).map((step: any, index: number) => ({
          ...step,
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


