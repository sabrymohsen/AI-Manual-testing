import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import {
  PROPERTY_CATALOG,
  getCatalogProperty,
  readProps,
  writeProps,
  validateValue,
} from "@/lib/hub-properties"

export const dynamic = "force-dynamic"

// GET /api/hub/config/properties
// Returns the full catalog merged with the values currently in custom.properties.
// Any keys present in the file but absent from the catalog are appended as
// "Other" so nothing the user set by hand is hidden.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const fileValues = readProps()

  const rows = PROPERTY_CATALOG.map((meta) => {
    const raw = fileValues[meta.name]
    const value = raw ?? meta.default
    return {
      name: meta.name,
      group: meta.group,
      type: meta.type,
      description: meta.description,
      options: meta.options ?? null,
      min: meta.min ?? null,
      max: meta.max ?? null,
      default: meta.default,
      value,
      isCustom: raw !== undefined && raw !== meta.default,
    }
  })

  const known = new Set(PROPERTY_CATALOG.map((p) => p.name))
  for (const [name, value] of Object.entries(fileValues)) {
    if (known.has(name)) continue
    rows.push({
      name,
      group: "Other",
      type: "string",
      description: "Custom property (not in the settings catalog).",
      options: null,
      min: null,
      max: null,
      default: "",
      value,
      isCustom: true,
    })
  }

  return NextResponse.json({ properties: rows })
}

// PUT /api/hub/config/properties  { updates: { [name]: value } }
// Validates each value against the catalog, writes them to custom.properties,
// and records a PropertyHistory entry + ShaftProperty row per change.
export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const updates: Record<string, unknown> = body.updates ?? {}
    const entries = Object.entries(updates).map(([k, v]) => [k, String(v)] as const)

    if (entries.length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 })
    }

    // Validate everything before touching disk.
    for (const [name, value] of entries) {
      const err = validateValue(name, value)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    const before = readProps()
    const changed = entries.filter(([name, value]) => (before[name] ?? getCatalogProperty(name)?.default ?? "") !== value)

    writeProps(Object.fromEntries(entries))

    const userId = auth.session!.user.id
    await Promise.all(
      changed.map(async ([name, value]) => {
        const meta = getCatalogProperty(name)
        const oldValue = before[name] ?? meta?.default ?? ""
        await prisma.propertyHistory.create({
          data: { propertyName: name, oldValue, newValue: value, changedBy: userId },
        })
        await prisma.shaftProperty.upsert({
          where: { propertyName: name },
          create: {
            propertyName: name,
            value,
            description: meta?.description ?? "",
            propertyGroup: meta?.group ?? "Other",
            isCustom: value !== (meta?.default ?? ""),
            updatedBy: userId,
          },
          update: {
            value,
            isCustom: value !== (meta?.default ?? ""),
            updatedBy: userId,
          },
        })
      })
    )

    return NextResponse.json({ ok: true, changedCount: changed.length })
  } catch (err: any) {
    console.error("PUT config properties error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
