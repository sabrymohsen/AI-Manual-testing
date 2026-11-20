import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"
import { startAiJob } from "@/lib/ai-jobs"
import { automateTestCase } from "@/lib/hub-automate"

export const maxDuration = 300

const hubLink = (projectId: string, name: string) => `/projects/${projectId}/automation-hub?tab=tests&test=${encodeURIComponent(name)}`

/**
 * POST /api/projects/:projectId/test-cases/:tcId/automate  { again?: boolean }
 * Makes a no-code Automation Hub test from a manual test case, in the
 * background (AI may take a minute). An already-automated case returns its
 * test instead of making another, unless again: true.
 */
export async function POST(request: Request, { params }: { params: { projectId: string; tcId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await request.json().catch(() => ({}))

  const tc = await prisma.testCase.findFirst({
    where: { id: params.tcId, projectId: params.projectId },
    select: { id: true, title: true, hubScriptLinks: { select: { script: { select: { name: true } } } } },
  })
  if (!tc) return NextResponse.json({ error: "Test case not found" }, { status: 404 })

  const existing = tc.hubScriptLinks[0]?.script
  if (existing && !body.again) {
    return NextResponse.json({ existing: { name: existing.name, link: hubLink(params.projectId, existing.name) } })
  }

  const userId = auth.session!.user.id
  const job = await startAiJob(
    {
      userId,
      projectId: params.projectId,
      kind: "automate-test-case",
      title: `Automating "${tc.title.slice(0, 80)}"`,
      link: `/projects/${params.projectId}/automation-hub?tab=tests`,
    },
    async () => {
      const r = await automateTestCase({ projectId: params.projectId, testCaseId: tc.id, userId })
      return { ...r, link: hubLink(params.projectId, r.name) }
    }
  )
  return NextResponse.json({ job }, { status: 202 })
}
