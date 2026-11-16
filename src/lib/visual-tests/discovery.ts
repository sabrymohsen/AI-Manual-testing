/**
 * Find the pages of a site. Server-only (plain fetch, no browser).
 *
 * Order, same as a person would try: an explicit sitemap → the sitemaps named in
 * robots.txt → /sitemap.xml → following links from the start page. The link crawl
 * is the fallback for sites without a sitemap and is bounded by page count AND
 * time, because it runs inside an HTTP request while the wizard waits.
 */
import {
  dedupeUrls,
  extractLinks,
  isSameSite,
  looksLikeDocument,
  normalizeUrl,
  parseRobotsSitemaps,
  parseSitemapXml,
  type NormalizedUrl,
} from "./url-tools"

export interface DiscoveryResult {
  pages: (NormalizedUrl & { source: "sitemap" | "crawl" })[]
  /** Which method produced the list, in words for the wizard. */
  method: "sitemap" | "crawl" | "none"
  sitemapsRead: string[]
  truncated: boolean
  notes: string[]
}

const USER_AGENT = "Mozilla/5.0 (compatible; QA-VisualTests/1.0; +site-scan)"

async function fetchText(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string; contentType: string; finalUrl: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml,text/xml,*/*;q=0.5" },
    })
    const contentType = res.headers.get("content-type") || ""
    // Cap what we read: a 200MB "sitemap" should not take the web process down.
    const buf = await res.arrayBuffer()
    const text = new TextDecoder().decode(buf.byteLength > 15_000_000 ? buf.slice(0, 15_000_000) : buf)
    return { ok: res.ok, status: res.status, text, contentType, finalUrl: res.url || url }
  } catch {
    return { ok: false, status: 0, text: "", contentType: "", finalUrl: url }
  } finally {
    clearTimeout(timer)
  }
}

async function gunzipIfNeeded(url: string, text: string): Promise<string> {
  // fetch already inflates Content-Encoding: gzip; only a literal .xml.gz file stays compressed.
  if (!/\.gz$/i.test(new URL(url).pathname) || text.trimStart().startsWith("<")) return text
  try {
    const { gunzipSync } = await import("node:zlib")
    return gunzipSync(Buffer.from(text, "binary")).toString("utf8")
  } catch {
    return ""
  }
}

async function readSitemaps(
  roots: string[],
  siteUrl: string,
  max: number,
  deadline: number
): Promise<{ urls: string[]; read: string[]; truncated: boolean }> {
  const queue = [...roots]
  const seen = new Set<string>()
  const read: string[] = []
  const urls: string[] = []
  let truncated = false
  while (queue.length && read.length < 25) {
    if (Date.now() > deadline) {
      truncated = true
      break
    }
    const sm = queue.shift()!
    if (seen.has(sm)) continue
    seen.add(sm)
    const res = await fetchText(sm, 12_000)
    if (!res.ok || !res.text) continue
    const xml = await gunzipIfNeeded(sm, res.text)
    if (!/<(urlset|sitemapindex)\b/i.test(xml)) continue
    read.push(sm)
    const parsed = parseSitemapXml(xml)
    queue.push(...parsed.sitemaps)
    for (const p of parsed.pages) {
      if (isSameSite(p, siteUrl) && looksLikeDocument(p)) urls.push(p)
    }
    if (urls.length >= max * 3) {
      truncated = true
      break
    }
  }
  if (queue.length) truncated = true
  return { urls, read, truncated }
}

async function crawlLinks(startUrl: string, max: number, deadline: number): Promise<{ urls: string[]; truncated: boolean }> {
  const queue = [startUrl]
  const seen = new Set<string>([normalizeUrl(startUrl)?.key ?? startUrl])
  const found: string[] = []
  const CONCURRENCY = 4
  while (queue.length && found.length < max && Date.now() < deadline) {
    const batch = queue.splice(0, CONCURRENCY)
    const results = await Promise.all(batch.map(u => fetchText(u, 8_000)))
    results.forEach((res, i) => {
      if (!res.ok || !/html/i.test(res.contentType)) return
      if (found.length < max) found.push(batch[i])
      for (const link of extractLinks(res.text, res.finalUrl)) {
        const n = normalizeUrl(link)
        if (!n || seen.has(n.key)) continue
        seen.add(n.key)
        queue.push(n.url)
      }
    })
  }
  return { urls: found, truncated: queue.length > 0 || found.length >= max }
}

export async function discoverSitePages(opts: {
  startUrl: string
  sitemapUrl?: string | null
  maxUrls: number
  /** Total time the discovery may take, ms. */
  budgetMs?: number
}): Promise<DiscoveryResult> {
  const start = normalizeUrl(opts.startUrl)
  const notes: string[] = []
  if (!start) {
    return { pages: [], method: "none", sitemapsRead: [], truncated: false, notes: ["That web address could not be read."] }
  }
  const max = Math.max(1, Math.min(opts.maxUrls || 100, 2000))
  const deadline = Date.now() + (opts.budgetMs ?? 45_000)
  const origin = new URL(start.url).origin

  let roots: string[] = []
  if (opts.sitemapUrl) {
    const sm = normalizeUrl(opts.sitemapUrl, origin)
    if (sm) roots = [sm.url]
  } else {
    const robots = await fetchText(`${origin}/robots.txt`, 8_000)
    if (robots.ok) roots = parseRobotsSitemaps(robots.text)
    if (!roots.length) roots = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]
  }

  const sitemap = await readSitemaps(roots, start.url, max, deadline)
  if (sitemap.urls.length) {
    const all = dedupeUrls(sitemap.urls.map(u => normalizeUrl(u)).filter((u): u is NormalizedUrl => !!u))
    const pages = all.slice(0, max).map(p => ({ ...p, source: "sitemap" as const }))
    if (all.length > max) notes.push(`The sitemap lists ${all.length} pages; the first ${max} were kept. Raise the limit to include more.`)
    return { pages, method: "sitemap", sitemapsRead: sitemap.read, truncated: sitemap.truncated || all.length > max, notes }
  }

  notes.push(
    opts.sitemapUrl
      ? "No pages were found in that sitemap, so links were followed from the start page instead."
      : "This site has no sitemap, so links were followed from the start page instead."
  )
  const crawl = await crawlLinks(start.url, max, deadline)
  const pages = dedupeUrls(crawl.urls.map(u => normalizeUrl(u)).filter((u): u is NormalizedUrl => !!u), max).map(p => ({
    ...p,
    source: "crawl" as const,
  }))
  if (!pages.length) {
    notes.push("The start page could not be loaded from the server. If the site needs a sign-in or a VPN, add the pages as a URL list instead.")
    // Always offer at least the start page: the browser run may reach what fetch could not.
    return { pages: [{ ...start, source: "crawl" }], method: "none", sitemapsRead: [], truncated: false, notes }
  }
  return { pages, method: "crawl", sitemapsRead: [], truncated: crawl.truncated, notes }
}
