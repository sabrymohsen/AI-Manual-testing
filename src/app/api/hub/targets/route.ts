import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

// GET /api/hub/targets — list all remote execution targets (Section 1c)
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const targets = await prisma.executionTarget.findMany({ orderBy: { createdAt: "asc" } })
    return NextResponse.json({ targets })
  } catch (err: any) {
    console.error("GET hub targets error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/hub/targets — create an execution target
export async function POST(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { name, type, url, platform, browser, headless, credentials, isDefault } = body

    if (!name || !type) {
      return NextResponse.json({ error: "Missing required fields: name, type" }, { status: 400 })
    }
    if (!["local", "docker", "grid", "browserstack"].includes(type)) {
      return NextResponse.json({ error: "Invalid target type" }, { status: 400 })
    }

    // Only one default at a time
    if (isDefault) {
      await prisma.executionTarget.updateMany({ data: { isDefault: false }, where: { isDefault: true } })
    }

    const target = await prisma.executionTarget.create({
      data: {
        name,
        type,
        url: url || "",
        platform: platform || "Linux",
        browser: browser || "chrome",
        headless: Boolean(headless),
        credentials: credentials || undefined,
        isDefault: Boolean(isDefault),
        createdBy: auth.session?.user?.email || null
      }
    })

    return NextResponse.json({ target }, { status: 201 })
  } catch (err: any) {
    console.error("POST hub target error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
