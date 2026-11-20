import { NextResponse } from "next/server"
import { z } from "zod"
import { requireHubProject } from "@/lib/hub-access"
import { startAiJob } from "@/lib/ai-jobs"
import { exploreStory } from "@/lib/hub-explorer"
import { normalizeUrl } from "@/lib/visual-tests/url-tools"

export const maxDuration = 300

const schema = z.object({
  projectId: z.string().min(1),
  story: z.object({
    title: z.string().trim().min(3, "Give the story a title").max(200),
    text: z.string().trim().max(4000).default(""),
    criteria: z.array(z.string().trim().max(500)).max(20).default([]),
  }),
  startUrl: z.string().trim().min(4, "Give the page to start on").max(2000),
  data: z.record(z.string().regex(/^[A-Za-z_][\w-]*$/, "Data names: letters, numbers, _ or -"), z.string().max(500)).default({}),
  maxSteps: z.number().int().min(3).max(40).optional(),
})

/**
 * POST /api/hub/explore — the AI explorer: a user story + start URL + test data
 * in, a no-code test out. Runs in the background (it drives a real browser and
 * asks the AI once per step); the AI tray reports when the test is ready.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 })
  const body = parsed.data
  const auth = await requireHubProject(body.projectId, "write")
  if (!auth.ok) return auth.response
  const startUrl = normalizeUrl(body.startUrl)?.url
  if (!startUrl) return NextResponse.json({ error: "The start page must be a web address (https://…)" }, { status: 400 })

  const userId = auth.session.user.id
  const job = await startAiJob(
    {
      userId,
      projectId: body.projectId,
      kind: "explore",
      title: `AI exploring "${body.story.title.slice(0, 80)}"`,
      link: `/projects/${body.projectId}/automation-hub?tab=tests`,
    },
    async () => {
      const r = await exploreStory({
        projectId: body.projectId,
        userId,
        story: { title: body.story.title, text: body.story.text, criteria: body.story.criteria.filter(Boolean) },
        startUrl,
        data: body.data,
        maxSteps: body.maxSteps,
      })
      return {
        name: r.name,
        stepCount: r.steps.length,
        checksAdded: r.checksAdded.length,
        checksFailed: r.checksFailed,
        stoppedEarly: r.stoppedEarly,
        link: `/projects/${body.projectId}/automation-hub?tab=tests&test=${encodeURIComponent(r.name)}`,
      }
    }
  )
  return NextResponse.json({ job }, { status: 202 })
}
