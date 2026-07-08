import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import * as fs from "fs"
import * as path from "path"

export const dynamic = "force-dynamic"

const ALLURE_REPORT_DIR = "/Users/sabrymohsen/Desktop/AI-Manual-testing/shaft-engine-core/allure-report"

// GET /api/hub/allure/{file} — serve a generated single-file Allure report
export async function GET(
  request: NextRequest,
  { params }: { params: { file: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const fileName = decodeURIComponent(params.file)

  // Strict allowlist: plain html file names only, no path segments
  if (!/^[\w.\- ]+\.html$/.test(fileName)) {
    return NextResponse.json({ error: "Invalid report file name" }, { status: 400 })
  }

  const filePath = path.join(ALLURE_REPORT_DIR, fileName)
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Allure report not found" }, { status: 404 })
  }

  const html = fs.readFileSync(filePath, "utf8")
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300"
    }
  })
}
