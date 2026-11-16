import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { errorResponse, guardProject } from "@/lib/visual-tests/access"
import { sanitizeEnvironments } from "@/lib/visual-tests/environments"
import { dedupeUrls, normalizeUrl, type NormalizedUrl } from "@/lib/visual-tests/url-tools"

/**
 * Visual tests of a project.
 * GET  — list with each test's latest run.
 * POST — create a Full-website or URL-list test with its pages.
 */

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const g = await guardProject(params.projectId)
  if (!g.ok) return g.response
  try {
    const tests = await prisma.visualTest.findMany({
      where: { projectId: params.projectId, type: { in: ["FullWebsite", "UrlList", "Flow"] } },
      orderBy: { updatedAt: "desc" },
      include: {
        suite: { select: { id: true, name: true } },
        testCase: { select: { id: true, title: true } },
        _count: { select: { pages: { where: { excluded: false, removedAt: null } } } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true, status: true, outcome: true, createdAt: true, completedAt: true, totalScreens: true, doneScreens: true,
            passedCount: true, unresolvedCount: true, failedCount: true, newCount: true,
          },
        },
      },
    })
    return NextResponse.json({
      tests: tests.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        startUrl: t.startUrl,
        suite: t.suite,
        testCase: t.testCase,
        pageCount: t._count.pages,
        environments: sanitizeEnvironments(t.environments),
        updatedAt: t.updatedAt,
        lastRun: t.runs[0] ?? null,
      })),
    })
  } catch (err) {
    return errorResponse(err, "Could not load visual tests")
  }
}

const envSchema = z.object({
  name: z.string().max(60).optional(),
  browser: z.enum(["chromium", "firefox", "webkit"]),
  width: z.number().int(),
  height: z.number().int(),
  device: z.string().max(60).nullable().optional(),
})

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the test a name").max(120),
  type: z.enum(["FullWebsite", "UrlList"]),
  startUrl: z.string().trim().min(1, "Enter the web address"),
  sitemapUrl: z.string().trim().max(2000).nullable().optional(),
  maxUrls: z.number().int().min(1).max(2000).default(100),
  excludedFolders: z.array(z.string().max(300)).max(200).default([]),
  pages: z
    .array(z.object({ url: z.string().max(4000), excluded: z.boolean().optional(), source: z.string().max(20).optional() }))
    .max(5000)
    .default([]),
  environments: z.array(envSchema).min(1, "Choose at least one browser or screen size").max(12),
  matchLevel: z.enum(["Strict", "Dynamic", "IgnoreColors"]).default("Strict"),
  captureType: z.enum(["FullPage", "Viewport"]).default("FullPage"),
  waitBeforeCaptureMs: z.number().int().min(0).max(30_000).default(0),
  beforeCaptureScript: z.string().max(20_000).nullable().optional(),
  suiteId: z.string().nullable().optional(),
  credentialId: z.string().nullable().optional(),
  autoMaintenance: z.boolean().default(true),
})

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const g = await guardProject(params.projectId)
  if (!g.ok) return g.response
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors.map(e => e.message).join(", ") }, { status: 400 })
  }
  const body = parsed.data

  const start = normalizeUrl(body.startUrl)
  if (!start) return NextResponse.json({ error: "That web address could not be read. It should look like https://example.com" }, { status: 400 })
  const environments = sanitizeEnvironments(body.environments)
  if (!environments.length) return NextResponse.json({ error: "Choose at least one browser or screen size" }, { status: 400 })

  const pages = dedupeUrls(
    body.pages
      .map(p => {
        const n = normalizeUrl(p.url, start.url)
        return n ? { ...n, excluded: !!p.excluded, source: p.source || (body.type === "UrlList" ? "list" : "sitemap") } : null
      })
      .filter((p): p is NormalizedUrl & { excluded: boolean; source: string } => !!p)
  ) as (NormalizedUrl & { excluded: boolean; source: string })[]
  if (body.type === "UrlList" && !pages.some(p => !p.excluded)) {
    return NextResponse.json({ error: "Add at least one page to test" }, { status: 400 })
  }
  if (body.type === "FullWebsite" && !pages.length) {
    // A full-website test may be saved before its first scan; the run reads the sitemap.
    pages.push({ ...start, excluded: false, source: "manual" })
  }

  try {
    // Links chosen in the form must belong to this project.
    if (body.suiteId) {
      const suite = await prisma.testSuite.findFirst({ where: { id: body.suiteId, projectId: params.projectId }, select: { id: true } })
      if (!suite) return NextResponse.json({ error: "That module is not in this project" }, { status: 400 })
    }
    if (body.credentialId) {
      const cred = await prisma.projectCredential.findFirst({ where: { id: body.credentialId, projectId: params.projectId }, select: { id: true } })
      if (!cred) return NextResponse.json({ error: "That login is not in this project" }, { status: 400 })
    }

    const test = await prisma.visualTest.create({
      data: {
        projectId: params.projectId,
        name: body.name,
        type: body.type,
        startUrl: start.url,
        sitemapUrl: body.sitemapUrl || null,
        maxUrls: body.maxUrls,
        excludedFolders: body.excludedFolders.map(f => (f.startsWith("/") ? f : `/${f}`)),
        environments: environments as any,
        matchLevel: body.matchLevel,
        captureType: body.captureType,
        waitBeforeCaptureMs: body.waitBeforeCaptureMs,
        beforeCaptureScript: body.beforeCaptureScript?.trim() || null,
        suiteId: body.suiteId || null,
        credentialId: body.credentialId || null,
        autoMaintenance: body.autoMaintenance,
        createdById: g.session.user.id,
        pages: {
          create: pages.map(p => ({ url: p.url, urlKey: p.key, folder: p.folder, source: p.source, excluded: p.excluded })),
        },
      },
      select: { id: true },
    })
    return NextResponse.json({ id: test.id }, { status: 201 })
  } catch (err) {
    return errorResponse(err, "Could not create the visual test")
  }
}
