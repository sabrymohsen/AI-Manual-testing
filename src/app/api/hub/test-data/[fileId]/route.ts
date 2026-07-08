import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { writeDataFileToDisk, removeDataFileFromDisk, inferFields } from "@/lib/hub-testdata"

export const dynamic = "force-dynamic"

// GET /api/hub/test-data/{id} — single data file with inferred fields
export async function GET(_request: NextRequest, { params }: { params: { fileId: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const file = await prisma.testDataFile.findUnique({ where: { id: params.fileId } })
    if (!file) return NextResponse.json({ error: "Data file not found" }, { status: 404 })
    return NextResponse.json({ file: { ...file, fields: inferFields(file.content) } })
  } catch (err: any) {
    console.error("GET hub test-data file error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/hub/test-data/{id} — update content and/or linked scripts
export async function PUT(request: NextRequest, { params }: { params: { fileId: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { content, linkedScriptIds, jsonSchema } = body

    const existing = await prisma.testDataFile.findUnique({ where: { id: params.fileId } })
    if (!existing) return NextResponse.json({ error: "Data file not found" }, { status: 404 })

    const data: any = {}
    if (content !== undefined) {
      try {
        JSON.parse(content)
      } catch {
        return NextResponse.json({ error: "Content is not valid JSON" }, { status: 400 })
      }
      data.content = content
      // keep disk copy in sync so the runner sees the latest data
      writeDataFileToDisk(existing.fileName, content)
    }
    if (Array.isArray(linkedScriptIds)) data.linkedScriptIds = linkedScriptIds
    if (jsonSchema !== undefined) data.jsonSchema = jsonSchema || undefined

    const file = await prisma.testDataFile.update({ where: { id: params.fileId }, data })
    return NextResponse.json({ file: { ...file, fields: inferFields(file.content) } })
  } catch (err: any) {
    console.error("PUT hub test-data file error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/hub/test-data/{id}
export async function DELETE(_request: NextRequest, { params }: { params: { fileId: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const existing = await prisma.testDataFile.findUnique({ where: { id: params.fileId } })
    if (!existing) return NextResponse.json({ error: "Data file not found" }, { status: 404 })

    removeDataFileFromDisk(existing.fileName)
    await prisma.testDataFile.delete({ where: { id: params.fileId } })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("DELETE hub test-data file error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
