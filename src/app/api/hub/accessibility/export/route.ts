import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { executionVisibleTo } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

function csvCell(value: any): string {
  const s = String(value ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// GET /api/hub/accessibility/export?scriptId=… (or ?executionId=…) — CSV download
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const sp = request.nextUrl.searchParams
    const scriptId = sp.get("scriptId")
    const executionId = sp.get("executionId")

    const result = executionId
      ? await prisma.accessibilityResult.findUnique({ where: { testExecutionId: executionId } })
      : scriptId
        ? await prisma.accessibilityResult.findFirst({ where: { scriptId }, orderBy: { createdAt: "desc" } })
        : null

    if (!result || !(await executionVisibleTo(auth.session!.user.id, result.testExecutionId))) {
      return NextResponse.json({ error: "No accessibility result found" }, { status: 404 })
    }

    const header = ["Rule ID", "Severity", "Element", "Description", "Fix"]
    const rows = (result.violations as any[]).map((v) =>
      [v.ruleId, v.severity, v.element, v.description, v.fix].map(csvCell).join(",")
    )
    const meta = `# WCAG level,${result.wcagLevel}\n# Passed checks,${result.passCount}\n# Violations,${result.violationCount}\n`
    const csv = meta + header.join(",") + "\n" + rows.join("\n") + "\n"

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="accessibility-report-${result.id.slice(0, 8)}.csv"`
      }
    })
  } catch (err: any) {
    console.error("GET hub accessibility export error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
