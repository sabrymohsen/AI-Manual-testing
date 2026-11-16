/**
 * URL handling for visual tests. Pure and browser-safe: the create wizard runs
 * the same parsing the server does, so what a person previews is what gets saved.
 *
 * A page's identity across runs is its `urlKey`. Two spellings of one page must
 * produce the same key or a run will report the page as removed-and-added (and
 * throw its approved baseline away), so normalisation errs toward merging:
 * lower-case host, no fragment, no default port, no trailing slash except on
 * the root, and tracking parameters dropped. Real query parameters are kept and
 * sorted — `?page=2` is a different page, `?b=1&a=2` is not.
 */

const TRACKING_PARAMS = /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|_gl|ref_src)$/i

const SKIP_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?|pdf|zip|gz|rar|7z|mp4|webm|mov|avi|mp3|wav|ogg|woff2?|ttf|eot|otf|css|js|mjs|json|xml|txt|csv|xlsx?|docx?|pptx?|exe|dmg|apk)$/i

export interface NormalizedUrl {
  url: string
  key: string
  folder: string
}

/** Resolve `raw` against `base` and normalise it. Returns null for anything that is not an http(s) page. */
export function normalizeUrl(raw: string, base?: string): NormalizedUrl | null {
  const trimmed = (raw || "").trim().replace(/^["'<]+|["'>,;]+$/g, "")
  if (!trimmed) return null
  let parsed: URL
  try {
    // A bare "example.com/page" is what people paste; treat it as https.
    const withScheme =
      !base && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && /^[\w-]+(\.[\w-]+)+/.test(trimmed)
        ? `https://${trimmed}`
        : trimmed
    parsed = base ? new URL(withScheme, base) : new URL(withScheme)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null

  parsed.hash = ""
  parsed.hostname = parsed.hostname.toLowerCase()
  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = ""
  }

  const kept = [...parsed.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
  parsed.search = ""
  for (const [k, v] of kept) parsed.searchParams.append(k, v)

  let path = parsed.pathname.replace(/\/{2,}/g, "/")
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  parsed.pathname = path || "/"

  const url = parsed.toString()
  // The key ignores the scheme so an http→https move does not orphan every baseline.
  const key = `${parsed.host}${parsed.pathname}${parsed.search}`
  return { url, key, folder: folderOf(parsed.pathname) }
}

/** "/blog/2024/post" → "/blog/"; "/" and "/about" → "/". */
export function folderOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean)
  return parts.length > 1 ? `/${parts[0]}/` : "/"
}

export function isSameSite(url: string, siteUrl: string): boolean {
  try {
    const a = new URL(url).hostname.replace(/^www\./, "")
    const b = new URL(siteUrl).hostname.replace(/^www\./, "")
    return a === b
  } catch {
    return false
  }
}

export function looksLikeDocument(url: string): boolean {
  try {
    return !SKIP_EXTENSIONS.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/** True when `pathname` is inside one of the excluded folders ("/blog/" excludes "/blog/x" and "/blog"). */
export function isInExcludedFolder(url: string, excludedFolders: string[]): boolean {
  if (!excludedFolders.length) return false
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return false
  }
  const withSlash = pathname.endsWith("/") ? pathname : `${pathname}/`
  return excludedFolders.some(f => {
    const folder = f.startsWith("/") ? f : `/${f}`
    const normalized = folder.endsWith("/") ? folder : `${folder}/`
    return normalized !== "/" && withSlash.toLowerCase().startsWith(normalized.toLowerCase())
  })
}

/** Keep the first occurrence of every key, in order, up to `max`. */
export function dedupeUrls(urls: NormalizedUrl[], max = Infinity): NormalizedUrl[] {
  const seen = new Set<string>()
  const out: NormalizedUrl[] = []
  for (const u of urls) {
    if (seen.has(u.key)) continue
    seen.add(u.key)
    out.push(u)
    if (out.length >= max) break
  }
  return out
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

/**
 * Split a sitemap into page URLs and nested sitemap URLs. Handles both
 * <urlset> and <sitemapindex>; a regex is enough because <loc> is all we read.
 */
export function parseSitemapXml(xml: string): { pages: string[]; sitemaps: string[] } {
  const pages: string[] = []
  const sitemaps: string[] = []
  const blockRe = /<(url|sitemap)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  let sawBlock = false
  while ((m = blockRe.exec(xml))) {
    sawBlock = true
    const loc = /<loc\b[^>]*>([\s\S]*?)<\/loc>/i.exec(m[2])
    if (!loc) continue
    const value = decodeXmlEntities(loc[1])
    if (m[1].toLowerCase() === "sitemap") sitemaps.push(value)
    else pages.push(value)
  }
  if (!sawBlock) {
    // Some generators emit bare <loc> lists.
    const locRe = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi
    while ((m = locRe.exec(xml))) pages.push(decodeXmlEntities(m[1]))
  }
  return { pages, sitemaps }
}

/** "Sitemap: https://…" lines from robots.txt. */
export function parseRobotsSitemaps(robots: string): string[] {
  return robots
    .split(/\r?\n/)
    .map(l => /^\s*sitemap\s*:\s*(\S+)/i.exec(l)?.[1])
    .filter((u): u is string => !!u)
}

/**
 * Pull URLs out of whatever a person pasted or uploaded: one per line, a CSV
 * (any cell that looks like a URL), or a sitemap XML. Relative paths ("/pricing")
 * resolve against `base` when one is given.
 */
export function parseUrlList(text: string, base?: string): NormalizedUrl[] {
  const source = text || ""
  if (/<(urlset|sitemapindex|loc)\b/i.test(source)) {
    const { pages, sitemaps } = parseSitemapXml(source)
    return dedupeUrls(
      [...pages, ...sitemaps].map(u => normalizeUrl(u, base)).filter((u): u is NormalizedUrl => !!u)
    )
  }
  const candidates: string[] = []
  for (const line of source.split(/\r?\n/)) {
    const cells = line.split(/[,\t;]/).map(c => c.trim().replace(/^"|"$/g, ""))
    for (const cell of cells) {
      if (!cell) continue
      if (/^https?:\/\//i.test(cell) || (base && cell.startsWith("/")) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(cell)) {
        candidates.push(cell)
      }
    }
  }
  return dedupeUrls(candidates.map(c => normalizeUrl(c, base)).filter((u): u is NormalizedUrl => !!u))
}

/** Extract same-site page links from an HTML document (used when a site has no sitemap). */
export function extractLinks(html: string, pageUrl: string): string[] {
  const out: string[] = []
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = (m[1] ?? m[2] ?? m[3] ?? "").trim()
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue
    const n = normalizeUrl(href.replace(/&amp;/g, "&"), pageUrl)
    if (n && isSameSite(n.url, pageUrl) && looksLikeDocument(n.url)) out.push(n.url)
  }
  return out
}

export interface FolderGroup {
  folder: string
  urls: string[]
}

/** Group URLs by folder for the page picker, root first, then alphabetical. */
export function groupByFolder<T extends { url: string; folder: string }>(pages: T[]): { folder: string; pages: T[] }[] {
  const map = new Map<string, T[]>()
  for (const p of pages) {
    const list = map.get(p.folder) ?? []
    list.push(p)
    map.set(p.folder, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)))
    .map(([folder, list]) => ({ folder, pages: list.sort((x, y) => x.url.localeCompare(y.url)) }))
}
