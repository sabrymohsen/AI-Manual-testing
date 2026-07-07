import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function GET(
  request: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const script = await prisma.testScript.findUnique({
      where: { id: params.scriptId },
      include: {
        executions: {
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    })

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 })
    }

    return NextResponse.json({ script })
  } catch (err: any) {
    console.error("GET test script unique error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { name, type, code, tags } = body

    const script = await prisma.testScript.update({
      where: { id: params.scriptId },
      data: {
        name,
        type,
        code,
        tags
      }
    })

    return NextResponse.json({ script })
  } catch (err: any) {
    console.error("PUT test script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    await prisma.testScript.delete({
      where: { id: params.scriptId }
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("DELETE test script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
