import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { isValidDataName, toFileName, writeDataFileToDisk, inferFields } from "@/lib/hub-testdata"

export const dynamic = "force-dynamic"

// GET /api/hub/test-data — list all data files (optionally filtered by ?q=)
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase()
    const files = await prisma.testDataFile.findMany({ orderBy: { updatedAt: "desc" } })
    const filtered = q
      ? files.filter((f) => f.name.toLowerCase().includes(q) || f.content.toLowerCase().includes(q))
      : files

    return NextResponse.json({
      files: filtered.map((f) => ({ ...f, fields: inferFields(f.content) }))
    })
  } catch (err: any) {
    console.error("GET hub test-data error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/hub/test-data — create a new data set (writes JSON to testDataFiles/)
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { name, content, jsonSchema, linkedScriptIds } = body

    if (!name || !isValidDataName(name)) {
      return NextResponse.json({ error: "Name must be 1-60 chars: letters, digits, _ or -" }, { status: 400 })
    }

    const raw = typeof content === "string" ? content : JSON.stringify(content ?? [], null, 2)
    try {
      JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "Content is not valid JSON" }, { status: 400 })
    }

    const fileName = toFileName(name)
    const duplicate = await prisma.testDataFile.findUnique({ where: { fileName } })
    if (duplicate) {
      return NextResponse.json({ error: `A data file "${fileName}" already exists` }, { status: 409 })
    }

    const filePath = writeDataFileToDisk(fileName, raw)
    const file = await prisma.testDataFile.create({
      data: {
        name: name.trim().replace(/\.json$/i, ""),
        fileName,
        filePath,
        content: raw,
        jsonSchema: jsonSchema || undefined,
        linkedScriptIds: Array.isArray(linkedScriptIds) ? linkedScriptIds : []
      }
    })

    return NextResponse.json({ file }, { status: 201 })
  } catch (err: any) {
    console.error("POST hub test-data error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
