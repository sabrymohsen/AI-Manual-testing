import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

// POST /api/hub/recorder/save — save the reviewed code into the Test Studio library
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { name, code, tags } = body

    if (!name || !code) {
      return NextResponse.json({ error: "Missing required fields: name, code" }, { status: 400 })
    }

    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      return NextResponse.json({ error: "Script name must be a valid Java class name" }, { status: 400 })
    }

    const duplicate = await prisma.testScript.findFirst({ where: { name } })
    if (duplicate) {
      return NextResponse.json({ error: `A script named "${name}" already exists in Test Studio` }, { status: 409 })
    }

    const script = await prisma.testScript.create({
      data: {
        name,
        type: "Web",
        code,
        tags: Array.isArray(tags) && tags.length > 0 ? tags : ["Web", "Recorded"]
      }
    })

    return NextResponse.json({ script }, { status: 201 })
  } catch (err: any) {
    console.error("POST recorder save error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
