import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  bugSuiteMiddlewareInstalled: boolean | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

/**
 * Auto-fill a new bug's module (suiteId) from its linked test case.
 *
 * Bugs are created from thirteen different places — the manual form, test-run
 * completion, the visual diff viewer, the agent workers, the tracker rebuild.
 * Teaching each one about modules would mean twelve chances to forget, and a
 * report that quietly under-counts. One middleware covers every path instead:
 * if the caller did not say which module the bug belongs to and the bug points
 * at a test case, the case's suite is used.
 *
 * An explicit `suiteId: null` is respected — that is a person saying "Unfiled",
 * not an omission.
 */
if (!globalForPrisma.bugSuiteMiddlewareInstalled) {
  prisma.$use(async (params, next) => {
    if (params.model === "BugReport" && params.action === "create") {
      const data = params.args?.data
      if (data && !Array.isArray(data) && data.suiteId === undefined) {
        const testCaseId: string | undefined =
          data.testCaseId ?? data.testCase?.connect?.id
        if (testCaseId) {
          const testCase = await prisma.testCase.findUnique({
            where: { id: testCaseId },
            select: { suiteId: true }
          })
          if (testCase?.suiteId) data.suiteId = testCase.suiteId
        }
      }
    }
    return next(params)
  })
  globalForPrisma.bugSuiteMiddlewareInstalled = true
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
