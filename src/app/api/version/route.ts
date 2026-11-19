import { readFileSync } from "fs"
import path from "path"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// The build this server runs. Pages compare it with the build they loaded and
// offer "Reload" when the server was updated.
let buildId = ""
try {
  buildId = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim()
} catch {
  buildId = `dev-${Date.now()}`
}

export function GET() {
  return NextResponse.json({ buildId }, { headers: { "Cache-Control": "no-store" } })
}
