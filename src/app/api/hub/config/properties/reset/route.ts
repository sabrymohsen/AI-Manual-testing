import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { getCatalogProperty, readProps, writeProps, removeProp, CUSTOM_PROPS_PATH } from "@/lib/hub-properties"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// POST /api/hub/config/properties/reset  { name?: string }
// Reset a single property (when `name` is given) or all catalog properties to
// their built-in defaults by removing the override from custom.properties.
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const name: string | undefined = body.name
    const before = readProps()
    const userId = auth.session!.user.id

    const targets = name ? [name] : Object.keys(before)
    let content = fs.existsSync(CUSTOM_PROPS_PATH) ? fs.readFileSync(CUSTOM_PROPS_PATH, "utf8") : ""

    for (const key of targets) {
      if (before[key] === undefined) continue
      const meta = getCatalogProperty(key)
      const oldValue = before[key]
      const newValue = meta?.default ?? ""
      if (oldValue === newValue) continue
      content = removeProp(content, key)
      await prisma.propertyHistory.create({
        data: { propertyName: key, oldValue, newValue, changedBy: userId },
      })
      await prisma.shaftProperty.deleteMany({ where: { propertyName: key } })
    }

    fs.writeFileSync(CUSTOM_PROPS_PATH, content, "utf8")
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("POST config properties reset error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
