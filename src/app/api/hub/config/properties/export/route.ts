import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { CUSTOM_PROPS_PATH } from "@/lib/hub-properties"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/config/properties/export — download the raw custom.properties file.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const content = fs.existsSync(CUSTOM_PROPS_PATH) ? fs.readFileSync(CUSTOM_PROPS_PATH, "utf8") : ""
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="custom-${Date.now()}.properties"`,
    },
  })
}
