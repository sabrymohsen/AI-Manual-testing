import { NextResponse } from "next/server"
import { z } from "zod"
import { requireProjectMember } from "@/lib/api-guards"
import { generateTestData } from "@/lib/plain-english/ai-authoring"

export const maxDuration = 300

const schema = z.object({
  description: z.string().trim().min(3, "Describe the data you need").max(1000),
  names: z.array(z.string().max(60)).max(30).default([]),
})

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map(e => e.message).join(", ") }, { status: 400 })
  try {
    const values = await generateTestData({ projectId: params.projectId, ...parsed.data })
    return NextResponse.json({ values })
  } catch (err: any) {
    const timedOut = /abort|timeout/i.test(String(err?.message))
    return NextResponse.json(
      { error: timedOut ? "The AI provider did not answer in time. Try again." : err?.message || "Could not generate the data" },
      { status: err?.status || (timedOut ? 504 : 500) }
    )
  }
}
