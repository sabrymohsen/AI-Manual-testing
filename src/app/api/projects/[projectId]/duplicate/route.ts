import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const originalProject = await prisma.project.findUnique({
    where: { id: params.projectId }
  })
  if (!originalProject) {
    return notFoundResponse("Original project not found")
  }

  try {
    const body = await request.json()
    const duplicateSchema = z.object({
      cloneName: z.string().min(1, "Clone name is required"),
      cloneTestCases: z.boolean().optional(),
      cloneRequirements: z.boolean().optional(),
      cloneLocators: z.boolean().optional(),
    })
    const parsed = duplicateSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const { cloneName, cloneTestCases, cloneRequirements, cloneLocators } = parsed.data

    // 1. Create duplicate project structure
    const newProject = await prisma.project.create({
      data: {
        name: cloneName,
        webAppUrl: originalProject.webAppUrl,
        figmaUrl: originalProject.figmaUrl,
        description: originalProject.description ? `Cloned from "${originalProject.name}". ${originalProject.description}` : `Cloned from "${originalProject.name}".`,
        environment: originalProject.environment,
        browserType: originalProject.browserType,
        viewport: originalProject.viewport,
        testType: originalProject.testType,
        status: "Active",
        userId: auth.session!.user.id
      }
    })

    // 2. Clone requirements if requested
    const requirementsMap = new Map<string, string>() // originalId -> newId
    if (cloneRequirements) {
      const originalReqs = await prisma.requirement.findMany({
        where: { projectId: params.projectId }
      })
      for (const req of originalReqs) {
        const clonedReq = await prisma.requirement.create({
          data: {
            projectId: newProject.id,
            requirementKey: req.requirementKey,
            title: req.title,
            description: req.description,
            acceptanceCriteria: req.acceptanceCriteria,
            priority: req.priority,
            status: req.status,
            source: req.source,
            figmaUrl: req.figmaUrl,
            externalUrl: req.externalUrl,
            externalSystem: req.externalSystem
          }
        })
        requirementsMap.set(req.id, clonedReq.id)
      }
    }

    // 3. Clone test cases and steps if requested
    const testCasesMap = new Map<string, string>() // originalId -> newId
    if (cloneTestCases) {
      const originalCases = await prisma.testCase.findMany({
        where: { projectId: params.projectId },
        include: { steps: true }
      })

      for (const tc of originalCases) {
        const clonedCase = await prisma.testCase.create({
          data: {
            projectId: newProject.id,
            title: tc.title,
            module: tc.module,
            priority: tc.priority,
            preconditions: tc.preconditions,
            source: tc.source,
            testData: tc.testData || undefined,
            tags: tc.tags,
            steps: {
              create: tc.steps.map(step => ({
                stepNumber: step.stepNumber,
                actionDescription: step.actionDescription,
                expectedResult: step.expectedResult,
                actionType: step.actionType,
                targetType: step.targetType,
                targetValue: step.targetValue,
                inputValue: step.inputValue,
                timeoutMs: step.timeoutMs,
                assertions: step.assertions || undefined
              }))
            }
          }
        })
        testCasesMap.set(tc.id, clonedCase.id)
      }
    }

    // 4. Clone requirement links if both requirements and test cases were cloned
    if (cloneRequirements && cloneTestCases) {
      const originalLinks = await prisma.testCaseRequirement.findMany({
        where: {
          testCase: { projectId: params.projectId }
        }
      })
      for (const link of originalLinks) {
        const newReqId = requirementsMap.get(link.requirementId)
        const newCaseId = testCasesMap.get(link.testCaseId)
        if (newReqId && newCaseId) {
          await prisma.testCaseRequirement.create({
            data: {
              requirementId: newReqId,
              testCaseId: newCaseId
            }
          })
        }
      }
    }

    // 5. Clone locators if requested
    if (cloneLocators) {
      const originalLocators = await prisma.elementLocator.findMany({
        where: { projectId: params.projectId }
      })
      for (const loc of originalLocators) {
        await prisma.elementLocator.create({
          data: {
            projectId: newProject.id,
            friendlyName: loc.friendlyName,
            description: loc.description,
            pageUrl: loc.pageUrl,
            tagName: loc.tagName,
            visibleText: loc.visibleText,
            locatorType: loc.locatorType,
            locatorValue: loc.locatorValue,
            recommendedSelector: loc.recommendedSelector,
            cssSelector: loc.cssSelector,
            xpathSelector: loc.xpathSelector,
            idSelector: loc.idSelector,
            testIdSelector: loc.testIdSelector,
            roleSelector: loc.roleSelector,
            textSelector: loc.textSelector,
            labelSelector: loc.labelSelector,
            placeholderSelector: loc.placeholderSelector,
            reliabilityScore: loc.reliabilityScore,
            attributes: loc.attributes || undefined,
            screenshotPath: loc.screenshotPath,
            isValidated: loc.isValidated,
            matchCount: loc.matchCount,
            lastValidatedAt: loc.lastValidatedAt
          }
        })
      }
    }

    // Create duplicate audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.session!.user.id,
        projectId: originalProject.id,
        action: "DUPLICATE_PROJECT",
        details: `Project "${originalProject.name}" duplicated as "${newProject.name}" with options: Test cases: ${!!cloneTestCases}, Requirements: ${!!cloneRequirements}, Locators: ${!!cloneLocators}.`
      }
    })

    return NextResponse.json({ success: true, project: newProject })
  } catch (err: any) {
    console.error("Duplicate project error:", err)
    return NextResponse.json({ error: err.message || "Failed to duplicate project" }, { status: 500 })
  }
}
