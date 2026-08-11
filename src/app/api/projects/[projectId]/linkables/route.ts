import { NextResponse } from "next/server"
import { requireProjectMember } from "@/lib/api-guards"
import { LINKABLE_TYPES, isLinkableType, searchLinkables } from "@/lib/entity-links"
import type { LinkableEntityType } from "@prisma/client"

// GET /api/projects/:projectId/linkables?q=&types=TASK,BUG_REPORT&limit=
//
// Autocomplete across every linkable entity in the project. Backs both the
// "Add link" combobox and the chat `#` entity mention picker.
export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const q = url.searchParams.get("q") ?? ""
  const rawTypes = url.searchParams.get("types")
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 50)

  let types: LinkableEntityType[]
  if (rawTypes) {
    types = rawTypes
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(isLinkableType)
    if (types.length === 0) {
      return NextResponse.json(
        { error: `types must be a comma-separated subset of: ${LINKABLE_TYPES.join(", ")}` },
        { status: 400 }
      )
    }
  } else {
    types = [...LINKABLE_TYPES]
  }

  try {
    const results = await searchLinkables(params.projectId, q, types, limit)
    return NextResponse.json({ results })
  } catch (err) {
    console.error("GET linkables failed:", err)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
