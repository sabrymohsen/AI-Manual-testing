import { prisma } from "@/lib/db"

/**
 * Which module/service (TestSuite) a bug belongs to.
 *
 * A defect's module is its own field on BugReport rather than something read
 * through the linked test case, because most bugs are filed by hand during
 * exploratory testing and never point at a case — and a defect can legitimately
 * belong to a module none of its cases live in. The link is auto-filled from
 * the case's suite where one exists (see withBugModule below), and freely
 * editable afterwards.
 */

/**
 * Validate a caller-supplied module id, or work one out from the linked case.
 *
 * The three inputs are deliberately distinct:
 *   suiteId === undefined  → not specified; fall back to the test case's suite
 *   suiteId === null | ""  → explicitly cleared; the bug is Unfiled, no fallback
 *   suiteId === "abc"      → use it, but only if it is a suite of THIS project
 *
 * A suite id from another project is dropped rather than rejected: it can only
 * arrive from a stale form or a hand-made request, and silently filing the bug
 * as Unfiled is safer than either trusting it or failing the whole create.
 */
export async function resolveBugSuiteId(
  projectId: string,
  input: { suiteId?: string | null; testCaseId?: string | null }
): Promise<string | null> {
  if (input.suiteId !== undefined) {
    if (!input.suiteId) return null
    const suite = await prisma.testSuite.findFirst({
      where: { id: input.suiteId, projectId },
      select: { id: true }
    })
    return suite?.id ?? null
  }

  if (input.testCaseId) {
    const testCase = await prisma.testCase.findFirst({
      where: { id: input.testCaseId, projectId },
      select: { suiteId: true }
    })
    return testCase?.suiteId ?? null
  }

  return null
}

/**
 * Fill in a new bug's module from its linked test case.
 *
 * Wraps the `data` of a `bugReport.create` so the auto-fill lives in one place
 * rather than being re-implemented at each of the creation paths:
 *
 *     await tx.bugReport.create({ data: await withBugModule({ ...fields }) })
 *
 * This was briefly a Prisma `$use` middleware in src/lib/db. It cannot live
 * there: that module is pulled in by the Next.js edge middleware through
 * @/lib/auth, and its only other top-level statement is a NODE_ENV check the
 * bundler proves false, so the whole module gets dropped from the edge bundle.
 * An unconditional side effect keeps it — which drags PrismaClient into the
 * edge runtime, where it throws on import and 500s every route.
 *
 * A caller that already decided the module (including deciding on "Unfiled")
 * passes `suiteId` and is left alone.
 */
export async function withBugModule<
  T extends { projectId?: string | null; testCaseId?: string | null; suiteId?: string | null }
>(data: T): Promise<T> {
  if (data.suiteId !== undefined || !data.testCaseId) return data

  const testCase = await prisma.testCase.findUnique({
    where: { id: data.testCaseId },
    select: { suiteId: true, projectId: true }
  })
  if (!testCase?.suiteId) return data
  // A case from another project cannot lend its module to this bug.
  if (data.projectId && testCase.projectId !== data.projectId) return data

  return { ...data, suiteId: testCase.suiteId }
}

/**
 * The module a test case is filed under, for creation paths whose bug row does
 * not itself carry `testCaseId` (a bug filed against a manual session, say).
 * Returns null when there is no case or the case is unfiled.
 */
export async function suiteIdOfTestCase(testCaseId: string | null | undefined): Promise<string | null> {
  if (!testCaseId) return null
  const testCase = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    select: { suiteId: true }
  })
  return testCase?.suiteId ?? null
}
