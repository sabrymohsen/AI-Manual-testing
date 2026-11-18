import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"
import { LOG4J_PATH, stripAnsi } from "@/lib/hub-logs"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/logs            — current log4j.log content (ANSI stripped) + byte size
// GET /api/hub/logs?download=1 — same content as a downloadable attachment
export async function GET(request: NextRequest) {
  // Workspace-wide data with no project attached: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  const exists = fs.existsSync(LOG4J_PATH)
  const raw = exists ? fs.readFileSync(LOG4J_PATH, "utf8") : ""
  const content = stripAnsi(raw)
  const size = exists ? fs.statSync(LOG4J_PATH).size : 0

  if (request.nextUrl.searchParams.get("download") === "1") {
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="log4j-${Date.now()}.log"`
      }
    })
  }

  return NextResponse.json({ content, size, exists })
}
