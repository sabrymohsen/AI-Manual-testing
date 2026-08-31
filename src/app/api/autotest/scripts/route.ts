import { NextRequest, NextResponse } from "next/server"
import { DEFAULT_HUB_TEMPLATES } from "@/lib/hub-templates"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Default templates code definitions
// Seeded from the shared Playwright templates rather than a second copy of
// the SHAFT/Java set — one definition, so Test Studio and this route cannot
// drift into offering scripts the runner cannot execute.
const DEFAULT_TEMPLATES = DEFAULT_HUB_TEMPLATES.map((t) => ({
  name: t.name,
  type: t.type,
  code: t.code,
  tags: t.tags,
}))

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let scripts = await prisma.testScript.findMany({
      orderBy: { createdAt: "desc" }
    })

    // Seed default templates if empty
    if (scripts.length === 0) {
      await Promise.all(
        DEFAULT_TEMPLATES.map((t) =>
          prisma.testScript.create({
            data: t
          })
        )
      )
      scripts = await prisma.testScript.findMany({
        orderBy: { createdAt: "desc" }
      })
    }

    return NextResponse.json({ scripts })
  } catch (err: any) {
    console.error("GET test scripts error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { name, type, code, tags } = body

    if (!name || !type || !code) {
      return NextResponse.json({ error: "Missing required fields: name, type, code" }, { status: 400 })
    }

    const script = await prisma.testScript.create({
      data: {
        name,
        type,
        code,
        tags: tags || []
      }
    })

    return NextResponse.json({ script }, { status: 201 })
  } catch (err: any) {
    console.error("POST test script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
