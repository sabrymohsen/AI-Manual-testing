import { NextResponse } from "next/server"
import { z } from "zod"
import { requireProjectMember } from "@/lib/api-guards"
import { generateStepsFromIntent } from "@/lib/plain-english/ai-authoring"
import { fetchPageOutline } from "@/lib/plain-english/page-outline"
import { normalizeUrl } from "@/lib/visual-tests/url-tools"

// The project's model reasons before answering; the AI timeout (200 s) plus the
// page read (25 s) stays inside this, so a slow answer is reported, not cut off.
export const maxDuration = 300

const schema = z.object({
  instruction: z.string().trim().min(3, "Describe what the steps should do").max(2000),
  pageUrl: z.string().trim().max(2000).optional().nullable(),
  previousSteps: z.array(z.string().max(500)).max(100).default([]),
})

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map(e => e.message).join(", ") }, { status: 400 })
  const { instruction, previousSteps } = parsed.data
  const pageUrl = parsed.data.pageUrl ? normalizeUrl(parsed.data.pageUrl)?.url ?? null : null
  try {
    const outline = pageUrl ? await fetchPageOutline(pageUrl) : null
    const result = await generateStepsFromIntent({ projectId: params.projectId, instruction, pageOutline: outline, pageUrl, previousSteps })
    return NextResponse.json({
      ...result,
      note: pageUrl && !outline ? "The page could not be opened (it may need a sign-in), so the steps are based on your description only." : null,
    })
  } catch (err: any) {
    const timedOut = /abort|timeout/i.test(String(err?.message))
    return NextResponse.json(
      { error: timedOut ? "The AI provider did not answer in time. Try a shorter task, or try again." : err?.message || "Could not write the steps" },
      { status: err?.status || (timedOut ? 504 : 500) }
    )
  }
}
