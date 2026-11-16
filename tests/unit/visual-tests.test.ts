/**
 * Visual tests: the pure algorithms — image comparison and region grouping,
 * "same change" matching for auto-maintenance, URL normalisation, sitemap and
 * list parsing, page-list reconciliation, and run verdicts.
 */
import assert from "node:assert/strict"
import { describe, it } from "vitest"
import { PNG } from "pngjs"
import * as d from "@/lib/visual-tests/image-diff"
import * as u from "@/lib/visual-tests/url-tools"
import * as st from "@/lib/visual-tests/status"
import * as env from "@/lib/visual-tests/environments"
import * as ps from "@/lib/visual-tests/page-sync"

function img(w: number, h: number, fill: number[] = [255, 255, 255]) {
  const p = new PNG({ width: w, height: h })
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = fill[0]; p.data[i+1] = fill[1]; p.data[i+2] = fill[2]; p.data[i+3] = 255 }
  return p
}
function box(p: PNG, x: number, y: number, w: number, h: number, c: number[]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = (yy * p.width + xx) * 4; p.data[i] = c[0]; p.data[i+1] = c[1]; p.data[i+2] = c[2]; p.data[i+3] = 255 }
}
// A "logo": checker pattern so hashes have structure
function logo(p: PNG, x: number, y: number, variant: number) {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) box(p, x + i * 10, y + j * 10, 10, 10, ((i + j + variant) % 2) ? [20, 20, 20] : [240, 200, 0])
}

describe("visual tests", () => {

it("identical images → no regions", () => {
  const r = d.compareImages(img(300, 200), img(300, 200))
  assert.equal(r.regions.length, 0); assert.equal(r.mismatchPercent, 0); assert.equal(r.diff, null)
})
it("one changed box → one region with exact bounds", () => {
  const a = img(300, 200); const b = img(300, 200); box(b, 40, 50, 30, 20, [0, 0, 0])
  const r = d.compareImages(a, b)
  assert.equal(r.regions.length, 1)
  assert.deepEqual([r.regions[0].x, r.regions[0].y, r.regions[0].width, r.regions[0].height], [40, 50, 30, 20])
})
it("two far-apart changes → two regions, top first", () => {
  const a = img(400, 400); const b = img(400, 400); box(b, 300, 300, 20, 20, [0,0,0]); box(b, 10, 10, 20, 20, [0,0,0])
  const r = d.compareImages(a, b)
  assert.equal(r.regions.length, 2); assert.equal(r.regions[0].y, 10)
})
it("page grew taller → padded, difference at the bottom only", () => {
  const a = img(200, 100); const b = img(200, 150)
  const r = d.compareImages(a, b)
  assert.equal(r.height, 150); assert.equal(r.regions.length, 1)
  assert.equal(r.regions[0].y, 100); assert.equal(r.regions[0].height, 50)
})
it("ignore region covering the change → passes", () => {
  const a = img(300, 200); const b = img(300, 200); box(b, 40, 50, 30, 20, [0, 0, 0])
  const r = d.compareImages(a, b, { ignore: [{ x: 35, y: 45, width: 40, height: 30 }] })
  assert.equal(r.regions.length, 0)
})
it("ignore region partly covering → region remains", () => {
  const a = img(300, 200); const b = img(300, 200); box(b, 40, 50, 30, 20, [0, 0, 0])
  const r = d.compareImages(a, b, { ignore: [{ x: 40, y: 50, width: 10, height: 20 }] })
  assert.equal(r.regions.length, 1); assert.equal(r.regions[0].x, 50)
})
it("IgnoreColors: same lightness, different hue → passes; Strict → differs", () => {
  const a = img(100, 100); const b = img(100, 100)
  box(a, 10, 10, 40, 40, [200, 100, 100]); box(b, 10, 10, 40, 40, [100, 138, 100]) // luma ≈ 129.3 vs 130.9
  assert.equal(d.compareImages(a, b, { matchLevel: "IgnoreColors" }).regions.length, 0)
  assert.equal(d.compareImages(a, b).regions.length, 1)
})
it("tolerance swallows a tiny change", () => {
  const a = img(500, 500); const b = img(500, 500); box(b, 1, 1, 3, 3, [0,0,0])
  assert.equal(d.compareImages(a, b, { tolerancePercent: 0.01 }).regions.length, 0)
  assert.equal(d.compareImages(a, b).regions.length, 1)
})
it("same logo change on two different pages → same change", () => {
  const baseA = img(400, 300); logo(baseA, 20, 20, 0); box(baseA, 50, 150, 200, 40, [30, 60, 200])
  const actA = img(400, 300); logo(actA, 20, 20, 1); box(actA, 50, 150, 200, 40, [30, 60, 200])
  const baseB = img(600, 500); logo(baseB, 20, 20, 0); box(baseB, 100, 300, 300, 80, [10, 150, 10])
  const actB = img(600, 500); logo(actB, 20, 20, 1); box(actB, 100, 300, 300, 80, [10, 150, 10])
  const ra = d.compareImages(baseA, actA); const rb = d.compareImages(baseB, actB)
  assert.equal(ra.regions.length, 1); assert.equal(rb.regions.length, 1)
  assert.equal(d.isSameChange(ra.regions, rb.regions), true)
})
it("a different change in the same box → NOT the same change", () => {
  const baseA = img(400, 300); logo(baseA, 20, 20, 0)
  const actA = img(400, 300); logo(actA, 20, 20, 1)
  const baseB = img(400, 300); logo(baseB, 20, 20, 0)
  const actB = img(400, 300); box(actB, 20, 20, 80, 40, [255, 255, 255]); box(actB, 20, 20, 80, 20, [200, 0, 0]) // broken image
  const ra = d.compareImages(baseA, actA); const rb = d.compareImages(baseB, actB)
  assert.equal(rb.regions.length >= 1, true)
  assert.equal(d.isSameChange(ra.regions, rb.regions), false)
})
it("candidate with an EXTRA change beyond the accepted one → NOT the same", () => {
  const baseA = img(400, 300); logo(baseA, 20, 20, 0)
  const actA = img(400, 300); logo(actA, 20, 20, 1)
  const baseB = img(400, 300); logo(baseB, 20, 20, 0)
  const actB = img(400, 300); logo(actB, 20, 20, 1); box(actB, 250, 200, 60, 60, [0,0,0])
  const ra = d.compareImages(baseA, actA); const rb = d.compareImages(baseB, actB)
  assert.equal(rb.regions.length, 2)
  assert.equal(d.isSameChange(ra.regions, rb.regions), false)
})
it("dHash differs for different content, equal for identical", () => {
  const a = img(80, 40); logo(a, 0, 0, 0); const b = img(80, 40); logo(b, 0, 0, 1)
  const r = { x: 0, y: 0, width: 80, height: 40 }
  assert.equal(d.dHash(a, r), d.dHash(a, r)); assert.ok(d.hammingHex(d.dHash(a, r), d.dHash(b, r)) > 6)
})
it("findRegions on a 1x1 image and empty mask", () => {
  assert.equal(d.findRegions(new Uint8Array(1), 1, 1).length, 0)
  const r = d.compareImages(img(1, 1), img(1, 1, [0, 0, 0]), { minRegionPixels: 1 }); assert.equal(r.regions.length, 1)
})

// URL tools
it("normalizeUrl merges spellings of one page", () => {
  const k = (s: string) => u.normalizeUrl(s)!.key
  assert.equal(k("https://Example.com/About/"), k("https://example.com/About"))
  assert.equal(k("http://example.com:80/about#team"), k("https://example.com/about"))
  assert.equal(k("https://example.com/p?b=1&a=2&utm_source=x"), k("https://example.com/p?a=2&b=1"))
  assert.notEqual(k("https://example.com/p?page=2"), k("https://example.com/p"))
  assert.equal(u.normalizeUrl("https://example.com")!.url, "https://example.com/")
  assert.equal(u.normalizeUrl("example.com/pricing")!.url, "https://example.com/pricing")
  assert.equal(u.normalizeUrl("/pricing", "https://example.com/a/b")!.url, "https://example.com/pricing")
  assert.equal(u.normalizeUrl("mailto:a@b.c"), null); assert.equal(u.normalizeUrl("not a url"), null); assert.equal(u.normalizeUrl(""), null)
})
it("folderOf", () => {
  assert.equal(u.folderOf("/"), "/"); assert.equal(u.folderOf("/about"), "/"); assert.equal(u.folderOf("/blog/x/y"), "/blog/")
})
it("excluded folders", () => {
  assert.equal(u.isInExcludedFolder("https://e.com/blog/post", ["/blog/"]), true)
  assert.equal(u.isInExcludedFolder("https://e.com/blog", ["blog"]), true)
  assert.equal(u.isInExcludedFolder("https://e.com/blogger", ["/blog/"]), false)
  assert.equal(u.isInExcludedFolder("https://e.com/", ["/"]), false)
})
it("sitemap: urlset, index, CDATA and entities", () => {
  const x = `<?xml version="1.0"?><urlset><url><loc>https://e.com/a?x=1&amp;y=2</loc></url><url><loc><![CDATA[https://e.com/b]]></loc></url></urlset>`
  assert.deepEqual(u.parseSitemapXml(x).pages, ["https://e.com/a?x=1&y=2", "https://e.com/b"])
  const idx = `<sitemapindex><sitemap><loc>https://e.com/s1.xml</loc></sitemap></sitemapindex>`
  assert.deepEqual(u.parseSitemapXml(idx), { pages: [], sitemaps: ["https://e.com/s1.xml"] })
})
it("robots sitemaps", () => {
  assert.deepEqual(u.parseRobotsSitemaps("User-agent: *\nSitemap: https://e.com/s.xml\n sitemap:https://e.com/t.xml"), ["https://e.com/s.xml", "https://e.com/t.xml"])
})
it("parseUrlList: lines, CSV cells, relative paths, dupes", () => {
  const list = u.parseUrlList("url,name\nhttps://e.com/a,Home\n\"https://e.com/b\",B\n/c\nhttps://e.com/a/\njunk", "https://e.com")
  assert.deepEqual(list.map((x: any) => x.url), ["https://e.com/a", "https://e.com/b", "https://e.com/c"])
})
it("extractLinks keeps same-site pages only", () => {
  const html = `<a href="/x">x</a><a href='https://www.e.com/y#z'>y</a><a href="https://other.com/">o</a><a href="/f.pdf">p</a><a href="mailto:q">m</a><a href=/w>w</a>`
  assert.deepEqual(u.extractLinks(html, "https://e.com/"), ["https://e.com/x", "https://www.e.com/y", "https://e.com/w"])
})
it("groupByFolder root first", () => {
  const g = u.groupByFolder([{ url: "https://e.com/blog/a", folder: "/blog/" }, { url: "https://e.com/", folder: "/" }])
  assert.equal(g[0].folder, "/")
})
// status
it("tally & outcome", () => {
  assert.equal(st.runOutcome(st.tallyScreens([])), null)
  assert.equal(st.runOutcome(st.tallyScreens(["New", "Passed", "Accepted"])), "Passed")
  assert.equal(st.runOutcome(st.tallyScreens(["Passed", "Unresolved"])), "Unresolved")
  assert.equal(st.runOutcome(st.tallyScreens(["Unresolved", "Error"])), "Failed")
  assert.equal(st.runOutcome(st.tallyScreens(["Passed", "Removed"])), "Unresolved")
  const tl = st.tallyScreens(["New", "Rejected", "Removed"]); assert.deepEqual([tl.total, tl.passed, tl.failed, tl.new, tl.removed], [2, 1, 1, 1, 1])
})
it("environments: key ignores name, sanitizer drops junk and dupes", () => {
  const e = env.sanitizeEnvironments([{ name: "A", browser: "chromium", width: 1440, height: 900 }, { name: "B", browser: "chromium", width: 1440, height: 900 }, { browser: "ie", width: 1, height: 1 }, { browser: "webkit", width: 390, height: 844, device: "iPhone 14" }])
  assert.equal(e.length, 2); assert.equal(e[0].key, "chromium-1440x900"); assert.equal(e[1].key, "webkit-390x844-iphone-14")
})
const D = (p: string) => ({ url: "https://e.com" + p, key: "e.com" + p, folder: u.folderOf(p) })
const E = (id: string, p: string, extra: any = {}) => ({ id, urlKey: "e.com" + p, url: "https://e.com" + p, excluded: false, removedAt: null, ...extra })
it("page sync: add new, keep seen, remove missing", () => {
  const plan = ps.planPageSync([E("1", "/"), E("2", "/old")], [D("/"), D("/new")], [], 100)
  assert.deepEqual(plan.seen, ["1"]); assert.deepEqual(plan.removed, ["2"]); assert.deepEqual(plan.create.map((c: any) => c.key), ["e.com/new"])
})
it("page sync: new page in excluded folder saved as excluded, not counted", () => {
  const plan = ps.planPageSync([E("1", "/")], [D("/"), D("/blog/a"), D("/b")], ["/blog/"], 2)
  assert.deepEqual(plan.create.map((c: any) => [c.key, c.excluded]), [["e.com/blog/a", true], ["e.com/b", false]])
})
it("page sync: limit reached → new pages skipped", () => {
  const plan = ps.planPageSync([E("1", "/"), E("2", "/x")], [D("/"), D("/x"), D("/y")], [], 2)
  assert.equal(plan.create.length, 0)
})
it("page sync: discovery found nothing → no removals", () => {
  const plan = ps.planPageSync([E("1", "/")], [], [], 10)
  assert.equal(plan.discoveryFailed, true); assert.equal(plan.removed.length, 0)
})
it("page sync: person-excluded page never removed/re-added; already-removed not re-reported", () => {
  const plan = ps.planPageSync([E("1", "/", { excluded: true }), E("2", "/gone", { removedAt: new Date() })], [D("/z")], [], 10)
  assert.deepEqual(plan.removed, []); assert.equal(plan.create.length, 1)
})
it("page sync: returning page is 'seen' (clears removedAt)", () => {
  const plan = ps.planPageSync([E("2", "/back", { removedAt: new Date() })], [D("/back")], [], 10)
  assert.deepEqual(plan.seen, ["2"])
})
it("activePages honours exclusions, removals and limit", () => {
  const pages = [E("1", "/"), E("2", "/blog/x"), E("3", "/gone", { removedAt: new Date() }), E("4", "/a", { excluded: true }), E("5", "/b"), E("6", "/c")]
  assert.deepEqual(ps.activePages(pages, ["/blog/"], 2).map((p: any) => p.id), ["1", "5"])
})

})
