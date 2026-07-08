import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { DEFAULT_HUB_TEMPLATES } from "@/lib/hub-templates"

// GET /api/hub/scripts — list test scripts with their latest execution status
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let scripts = await prisma.testScript.findMany({
      orderBy: { name: "asc" },
      include: {
        executions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, duration: true, createdAt: true }
        }
      }
    })

    // Seed any missing default library templates (LoginFlow, ApiCrud, DbQuery, SearchFlow, FormSubmit)
    const existingNames = new Set(scripts.map((s) => s.name))
    const missingTemplates = DEFAULT_HUB_TEMPLATES.filter((t) => !existingNames.has(t.name))
    if (missingTemplates.length > 0) {
      await prisma.testScript.createMany({ data: missingTemplates })
      scripts = await prisma.testScript.findMany({
        orderBy: { name: "asc" },
        include: {
          executions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true, duration: true, createdAt: true }
          }
        }
      })
    }

    return NextResponse.json({
      scripts: scripts.map(({ executions, ...s }) => ({
        ...s,
        lastExecution: executions[0] || null
      }))
    })
  } catch (err: any) {
    console.error("GET hub scripts error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/hub/scripts — create a new test script
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { name, type, code, tags } = body

    if (!name || !type || !code) {
      return NextResponse.json({ error: "Missing required fields: name, type, code" }, { status: 400 })
    }

    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      return NextResponse.json({ error: "Script name must be a valid Java class name" }, { status: 400 })
    }

    const duplicate = await prisma.testScript.findFirst({ where: { name } })
    if (duplicate) {
      return NextResponse.json({ error: `A script named "${name}" already exists` }, { status: 409 })
    }

    const script = await prisma.testScript.create({
      data: { name, type, code, tags: tags || [] }
    })

    return NextResponse.json({ script }, { status: 201 })
  } catch (err: any) {
    console.error("POST hub script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
