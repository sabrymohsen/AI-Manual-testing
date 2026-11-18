import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"
import { readBrowserstackConfig, writeBrowserstackConfig, readBrowserstackStatus } from "@/lib/hub-browsermatrix"

export const dynamic = "force-dynamic"

// GET /api/hub/browserstack — browserstack.yml + credential status, usage and cost estimate
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const config = readBrowserstackConfig()
    const status = await readBrowserstackStatus()
    return NextResponse.json({ config, status })
  } catch (err: any) {
    console.error("GET browserstack error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/hub/browserstack — save the browserstack.yml SDK config
export async function PUT(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body.yml !== "string" || body.yml.length > 20000) {
      return NextResponse.json({ error: "Invalid browserstack.yml content" }, { status: 400 })
    }
    const config = writeBrowserstackConfig(body.yml)
    return NextResponse.json({ config })
  } catch (err: any) {
    console.error("PUT browserstack error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
