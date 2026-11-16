import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { errorResponse, guardVisualTest } from "@/lib/visual-tests/access"
import { parseUrlList } from "@/lib/visual-tests/url-tools"

/** POST — add pages (one per line / CSV). PATCH — include or exclude pages. */

const addSchema = z.object({ urlsText: z.string().min(1).max(2_000_000) })

export async function POST(req: Request, { params }: { params: { testId: string } }) {
  const g = await guardVisualTest(params.testId)
  if (!g.ok) return g.response
  const parsed = addSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Enter at least one web address" }, { status: 400 })
  try {
    const urls = parseUrlList(parsed.data.urlsText, g.record.startUrl)
    if (!urls.length) return NextResponse.json({ error: "No web addresses were found in what you entered" }, { status: 400 })
    const result = await prisma.visualTestPage.createMany({
      data: urls.map(u => ({ visualTestId: params.testId, url: u.url, urlKey: u.key, folder: u.folder, source: "manual" })),
      skipDuplicates: true,
    })
    // A page added again by hand is wanted: bring it back if it had been excluded or removed.
    await prisma.visualTestPage.updateMany({
      where: { visualTestId: params.testId, urlKey: { in: urls.map(u => u.key) } },
      data: { excluded: false, removedAt: null },
    })
    await prisma.visualTest.update({ where: { id: params.testId }, data: { updatedAt: new Date() } })
    return NextResponse.json({ added: result.count, alreadyThere: urls.length - result.count })
  } catch (err) {
    return errorResponse(err, "Could not add the pages")
  }
}

const patchSchema = z.object({
  pageIds: z.array(z.string()).min(1).max(5000),
  excluded: z.boolean(),
})

export async function PATCH(req: Request, { params }: { params: { testId: string } }) {
  const g = await guardVisualTest(params.testId)
  if (!g.ok) return g.response
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Choose the pages to change" }, { status: 400 })
  try {
    const result = await prisma.visualTestPage.updateMany({
      where: { visualTestId: params.testId, id: { in: parsed.data.pageIds } },
      data: { excluded: parsed.data.excluded },
    })
    return NextResponse.json({ updated: result.count })
  } catch (err) {
    return errorResponse(err, "Could not update the pages")
  }
}
