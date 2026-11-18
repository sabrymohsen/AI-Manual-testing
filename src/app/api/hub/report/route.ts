import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { projectRunsWhere } from "@/lib/hub-runs"
import { stripAnsi } from "@/lib/hub-report"

export const dynamic = "force-dynamic"

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const csv = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`
const secs = (ms: number | null | undefined) => (ms == null ? "" : `${(ms / 1000).toFixed(1)}s`)

/**
 * GET /api/hub/report?projectId=&ref=<batchId or executionId>&format=html|csv
 *
 * A shareable report of one run or batch: totals, pass rate, duration and
 * every test with its error. HTML is self-contained (no app login needed to
 * read it once downloaded); CSV opens in Excel.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const auth = await requireHubProject(sp.get("projectId"), "read")
  if (!auth.ok) return auth.response
  const ref = sp.get("ref")
  if (!ref) return NextResponse.json({ error: "ref is required" }, { status: 400 })
  const format = sp.get("format") === "csv" ? "csv" : "html"

  const [project, runs] = await Promise.all([
    prisma.project.findUnique({ where: { id: auth.projectId }, select: { name: true } }),
    prisma.testExecution.findMany({
      where: { AND: [projectRunsWhere(auth.projectId), { OR: [{ id: ref }, { batchId: ref }] }] },
      orderBy: { createdAt: "asc" },
      include: { script: { select: { name: true, folder: true } } },
    }),
  ])
  if (!runs.length) return NextResponse.json({ error: "Run not found" }, { status: 404 })

  const rows = runs.flatMap((r) => {
    const results = Array.isArray(r.results) ? (r.results as any[]) : []
    if (!results.length) {
      return [{ script: r.script?.name ?? "?", folder: r.script?.folder ?? "", test: "(whole run)", status: r.status.toLowerCase(), duration: r.duration, error: r.status === "Failed" ? stripAnsi(r.logOutput).split("\n").slice(-6).join(" ") : "" }]
    }
    return results.map((t) => ({
      script: r.script?.name ?? "?",
      folder: r.script?.folder ?? "",
      test: String(t.title),
      status: String(t.status),
      duration: typeof t.durationMs === "number" ? t.durationMs : null,
      error: stripAnsi(String(t.error?.message ?? t.error ?? "")).split("\n").filter(Boolean).slice(0, 3).join(" "),
    }))
  })
  const passed = rows.filter((r) => r.status === "passed").length
  const flaky = rows.filter((r) => r.status === "flaky").length
  const skipped = rows.filter((r) => r.status === "skipped").length
  const failed = rows.length - passed - flaky - skipped
  const executed = rows.length - skipped
  const rate = executed ? Math.round(((passed + flaky) / executed) * 100) : 0
  const started = runs[0].createdAt
  const totalMs = runs.reduce((n, r) => n + (r.duration ?? 0), 0)
  const stamp = started.toISOString().slice(0, 16).replace(/[:T]/g, "-")
  const file = `automation-report-${stamp}`

  if (format === "csv") {
    const lines = [["Script", "Folder", "Test", "Status", "Duration", "Error"].map(csv).join(",")]
    for (const r of rows) lines.push([r.script, r.folder, r.test, r.status, secs(r.duration), r.error].map(csv).join(","))
    return new NextResponse("﻿" + lines.join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` },
    })
  }

  const color: Record<string, string> = { passed: "#047857", flaky: "#b45309", skipped: "#6b7280" }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(project?.name)} — automation report</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;margin:0;padding:32px;color:#111827;background:#fff}
h1{font-size:20px;margin:0 0 4px}.muted{color:#6b7280}.kpis{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}
.kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;min-width:110px}.kpi b{display:block;font-size:20px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
th{font-size:12px;color:#6b7280;font-weight:600}td.err{color:#b91c1c;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;max-width:520px}
.st{font-weight:600;text-transform:capitalize}
@media print{body{padding:0}}
</style></head><body>
<h1>${esc(project?.name)} — automation report</h1>
<div class="muted">${esc(started.toLocaleString())} · ${runs.length} test file${runs.length === 1 ? "" : "s"} · ${esc(runs[0].browser ?? "")}${runs[0].triggeredByName ? ` · started by ${esc(runs[0].triggeredByName)}` : ""}</div>
<div class="kpis">
<div class="kpi"><b>${rate}%</b>pass rate</div><div class="kpi"><b>${passed}</b>passed</div>
<div class="kpi"><b style="color:#b91c1c">${failed}</b>failed</div><div class="kpi"><b>${flaky}</b>flaky (passed on retry)</div>
<div class="kpi"><b>${skipped}</b>skipped</div><div class="kpi"><b>${esc(secs(totalMs))}</b>total time</div>
</div>
<table><thead><tr><th>Test</th><th>Status</th><th>Time</th><th>Error</th></tr></thead><tbody>
${rows
  .sort((a, b) => Number(a.status === "passed") - Number(b.status === "passed"))
  .map(
    (r) =>
      `<tr><td><div>${esc(r.test)}</div><div class="muted">${esc(r.script)}${r.folder ? ` · ${esc(r.folder)}` : ""}</div></td><td class="st" style="color:${color[r.status] ?? "#b91c1c"}">${esc(r.status)}</td><td>${esc(secs(r.duration))}</td><td class="err">${esc(r.error)}</td></tr>`
  )
  .join("\n")}
</tbody></table>
<p class="muted" style="margin-top:24px">Generated by QA Engine · ${esc(new Date().toLocaleString())}</p>
</body></html>`
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.html"` },
  })
}
