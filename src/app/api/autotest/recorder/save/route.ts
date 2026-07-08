import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { name, code, type } = body

    if (!name || !code || !type) {
      return NextResponse.json({ error: "Missing name, code, or type" }, { status: 400 })
    }

    const script = await prisma.testScript.create({
      data: {
        name,
        code,
        type,
        tags: ["Recorded", type]
      }
    })

    return NextResponse.json({ script })
  } catch (err: any) {
    console.error("POST save recorded script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
