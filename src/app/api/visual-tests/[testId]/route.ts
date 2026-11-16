import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { errorResponse, guardVisualTest, isProjectAdmin } from "@/lib/visual-tests/access"
import { sanitizeEnvironments } from "@/lib/visual-tests/environments"
import { normalizeUrl } from "@/lib/visual-tests/url-tools"

/** One visual test: settings, pages, regions and recent runs. */
export async function GET(_req: Request, { params }: { params: { testId: string } }) {
  const g = await guardVisualTest(params.testId)
  if (!g.ok) return g.response
  try {
    const [test, pages, runs, regions, baselineCount] = await Promise.all([
      prisma.visualTest.findUnique({
        where: { id: params.testId },
        include: {
          suite: { select: { id: true, name: true } },
          credential: { select: { id: true, roleName: true, username: true } },
          testCase: { select: { id: true, title: true } },
        },
      }),
      prisma.visualTestPage.findMany({ where: { visualTestId: params.testId }, orderBy: { createdAt: "asc" } }),
      prisma.visualTestRun.findMany({ where: { visualTestId: params.testId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.visualTestRegion.findMany({ where: { visualTestId: params.testId }, orderBy: { createdAt: "asc" } }),
      prisma.visualScreenBaseline.count({ where: { visualTestId: params.testId } }),
    ])
    if (!test) return NextResponse.json({ error: "Visual test not found" }, { status: 404 })
    return NextResponse.json({
      test: { ...test, environments: sanitizeEnvironments(test.environments) },
      pages,
      runs,
      regions,
      baselineCount,
      canDelete: await isProjectAdmin(g.projectId, g.session.user.id),
    })
  } catch (err) {
    return errorResponse(err, "Could not load the visual test")
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startUrl: z.string().trim().min(1).optional(),
  sitemapUrl: z.string().trim().max(2000).nullable().optional(),
  maxUrls: z.number().int().min(1).max(2000).optional(),
  excludedFolders: z.array(z.string().max(300)).max(200).optional(),
  environments: z
    .array(z.object({ name: z.string().max(60).optional(), browser: z.enum(["chromium", "firefox", "webkit"]), width: z.number().int(), height: z.number().int(), device: z.string().max(60).nullable().optional() }))
    .min(1)
    .max(12)
    .optional(),
  matchLevel: z.enum(["Strict", "Dynamic", "IgnoreColors"]).optional(),
  captureType: z.enum(["FullPage", "Viewport"]).optional(),
  waitBeforeCaptureMs: z.number().int().min(0).max(30_000).optional(),
  beforeCaptureScript: z.string().max(20_000).nullable().optional(),
  suiteId: z.string().nullable().optional(),
  credentialId: z.string().nullable().optional(),
  autoMaintenance: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: { testId: string } }) {
  const g = await guardVisualTest(params.testId)
  if (!g.ok) return g.response
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map(e => e.message).join(", ") }, { status: 400 })
  const body = parsed.data
  try {
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.startUrl !== undefined) {
      const n = normalizeUrl(body.startUrl)
      if (!n) return NextResponse.json({ error: "That web address could not be read" }, { status: 400 })
      data.startUrl = n.url
    }
    if (body.sitemapUrl !== undefined) data.sitemapUrl = body.sitemapUrl || null
    if (body.maxUrls !== undefined) data.maxUrls = body.maxUrls
    if (body.excludedFolders !== undefined) data.excludedFolders = body.excludedFolders.map(f => (f.startsWith("/") ? f : `/${f}`))
    if (body.environments !== undefined) {
      const envs = sanitizeEnvironments(body.environments)
      if (!envs.length) return NextResponse.json({ error: "Choose at least one browser or screen size" }, { status: 400 })
      data.environments = envs
    }
    if (body.matchLevel !== undefined) data.matchLevel = body.matchLevel
    if (body.captureType !== undefined) data.captureType = body.captureType
    if (body.waitBeforeCaptureMs !== undefined) data.waitBeforeCaptureMs = body.waitBeforeCaptureMs
    if (body.beforeCaptureScript !== undefined) data.beforeCaptureScript = body.beforeCaptureScript?.trim() || null
    if (body.autoMaintenance !== undefined) data.autoMaintenance = body.autoMaintenance
    if (body.suiteId !== undefined) {
      if (body.suiteId) {
        const suite = await prisma.testSuite.findFirst({ where: { id: body.suiteId, projectId: g.projectId }, select: { id: true } })
        if (!suite) return NextResponse.json({ error: "That module is not in this project" }, { status: 400 })
      }
      data.suiteId = body.suiteId || null
    }
    if (body.credentialId !== undefined) {
      if (body.credentialId) {
        const cred = await prisma.projectCredential.findFirst({ where: { id: body.credentialId, projectId: g.projectId }, select: { id: true } })
        if (!cred) return NextResponse.json({ error: "That login is not in this project" }, { status: 400 })
      }
      data.credentialId = body.credentialId || null
    }
    await prisma.visualTest.update({ where: { id: params.testId }, data })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, "Could not save the visual test")
  }
}

/** Delete the test, its runs, screens, baselines and regions. Images on disk are left for storage cleanup. */
export async function DELETE(_req: Request, { params }: { params: { testId: string } }) {
  const g = await guardVisualTest(params.testId)
  if (!g.ok) return g.response
  if (!(await isProjectAdmin(g.projectId, g.session.user.id))) {
    return NextResponse.json({ error: "Only a project owner or admin can delete a visual test" }, { status: 403 })
  }
  try {
    const active = await prisma.visualTestRun.count({ where: { visualTestId: params.testId, status: { in: ["Queued", "Running"] } } })
    if (active) return NextResponse.json({ error: "Stop the run that is in progress before deleting this test" }, { status: 409 })
    await prisma.visualTest.delete({ where: { id: params.testId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, "Could not delete the visual test")
  }
}
