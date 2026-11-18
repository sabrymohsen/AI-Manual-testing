import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"
import { prisma } from "@/lib/db"
import { getCatalogProperty, readProps, writeProps, validateValue } from "@/lib/hub-properties"

export const dynamic = "force-dynamic"

// POST /api/hub/config/properties/import  { content: "<.properties file text>" }
// Parse an uploaded .properties file and merge valid entries into
// custom.properties, recording history for each changed catalog key.
export async function POST(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    const content: string = body.content || ""

    const parsed: Record<string, string> = {}
    for (const line of content.split("\n")) {
      const t = line.trim()
      if (!t || t.startsWith("#") || t.startsWith("!")) continue
      const eq = t.indexOf("=")
      if (eq === -1) continue
      parsed[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
    }

    const entries = Object.entries(parsed)
    if (entries.length === 0) {
      return NextResponse.json({ error: "No valid properties found in file" }, { status: 400 })
    }

    const skipped: string[] = []
    const valid: Record<string, string> = {}
    for (const [name, value] of entries) {
      if (validateValue(name, value)) {
        skipped.push(name)
        continue
      }
      valid[name] = value
    }

    const before = readProps()
    writeProps(valid)

    const userId = auth.session!.user.id
    await Promise.all(
      Object.entries(valid)
        .filter(([name, value]) => (before[name] ?? getCatalogProperty(name)?.default ?? "") !== value)
        .map(([name, value]) =>
          prisma.propertyHistory.create({
            data: {
              propertyName: name,
              oldValue: before[name] ?? getCatalogProperty(name)?.default ?? "",
              newValue: value,
              changedBy: userId,
            },
          })
        )
    )

    return NextResponse.json({ ok: true, importedCount: Object.keys(valid).length, skipped })
  } catch (err: any) {
    console.error("POST config properties import error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
