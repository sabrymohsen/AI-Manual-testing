import { prisma } from "@/lib/db"

/**
 * Which module/service (TestSuite) a bug belongs to.
 *
 * A defect's module is its own field on BugReport rather than something read
 * through the linked test case, because most bugs are filed by hand during
 * exploratory testing and never point at a case — and a defect can legitimately
 * belong to a module none of its cases live in. The link is auto-filled from
 * the case's suite where one exists (see the create middleware in src/lib/db),
 * and freely editable afterwards.
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
