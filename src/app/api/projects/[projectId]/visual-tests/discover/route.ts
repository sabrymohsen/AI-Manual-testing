import { NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, guardProject } from "@/lib/visual-tests/access"
import { discoverSitePages } from "@/lib/visual-tests/discovery"
import { normalizeUrl, parseUrlList } from "@/lib/visual-tests/url-tools"

// Reading a large sitemap index or following links takes a while; the budget
// inside stays under this.
export const maxDuration = 60

const schema = z.object({
  type: z.enum(["FullWebsite", "UrlList"]),
  startUrl: z.string().trim().default(""),
  sitemapUrl: z.string().trim().nullable().optional(),
  maxUrls: z.number().int().min(1).max(2000).default(100),
  urlsText: z.string().max(2_000_000).optional(),
})

/** Preview the pages a test would cover, before it is saved. */
export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const g = await guardProject(params.projectId)
  if (!g.ok) return g.response
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Enter the web address first" }, { status: 400 })
  const body = parsed.data
  try {
    if (body.type === "UrlList") {
      // Only resolve relative paths ("/pricing") against a site the person actually gave.
      const base = body.startUrl ? normalizeUrl(body.startUrl)?.url : undefined
      const pages = parseUrlList(body.urlsText || "", base)
      return NextResponse.json({
        method: "list",
        pages: pages.map(p => ({ ...p, source: "list" })),
        truncated: false,
        notes: pages.length ? [] : ["No web addresses were found in what you entered."],
      })
    }
    if (!normalizeUrl(body.startUrl)) return NextResponse.json({ error: "Enter the web address first" }, { status: 400 })
    const result = await discoverSitePages({ startUrl: body.startUrl, sitemapUrl: body.sitemapUrl, maxUrls: body.maxUrls, budgetMs: 50_000 })
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err, "Could not read the site")
  }
}
