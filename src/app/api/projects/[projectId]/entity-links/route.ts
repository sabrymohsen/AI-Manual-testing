import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"
import {
  DEFAULT_RELATION,
  RELATION_LABELS,
  entityExists,
  getLinksForEntity,
  isLinkableType,
} from "@/lib/entity-links"

// GET /api/projects/:projectId/entity-links?entityId=&entityType=
// Every link touching the entity, from either end, grouped by the type at the
// other end.
export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const entityId = url.searchParams.get("entityId")
  const entityType = url.searchParams.get("entityType")

  if (!entityId || !entityType) {
    return NextResponse.json({ error: "entityId and entityType are required" }, { status: 400 })
  }
  if (!isLinkableType(entityType)) {
    return NextResponse.json({ error: `Unknown entityType "${entityType}"` }, { status: 400 })
  }

  try {
    const result = await getLinksForEntity(params.projectId, entityId, entityType)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error("GET entity-links failed:", err)
    return NextResponse.json({ error: "Failed to load links" }, { status: 500 })
  }
}

// POST /api/projects/:projectId/entity-links
// Body: { sourceId, sourceType, targetId, targetType, relationLabel? }
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 })
  }

  const { sourceId, sourceType, targetId, targetType } = body ?? {}
  const relationLabel: string = body?.relationLabel || DEFAULT_RELATION

  if (!sourceId || !sourceType || !targetId || !targetType) {
    return NextResponse.json(
      { error: "sourceId, sourceType, targetId and targetType are required" },
      { status: 400 }
    )
  }
  if (!isLinkableType(sourceType) || !isLinkableType(targetType)) {
    return NextResponse.json({ error: "Unknown source or target type" }, { status: 400 })
  }
  if (!(RELATION_LABELS as readonly string[]).includes(relationLabel)) {
    return NextResponse.json(
      { error: `relationLabel must be one of: ${RELATION_LABELS.join(", ")}` },
      { status: 400 }
    )
  }
  if (sourceId === targetId && sourceType === targetType) {
    return NextResponse.json({ error: "An entity can't be linked to itself" }, { status: 400 })
  }

  // Both ends must really exist in this project, or we'd persist a dangling link.
  const [sourceOk, targetOk] = await Promise.all([
    entityExists(params.projectId, sourceType, sourceId),
    entityExists(params.projectId, targetType, targetId),
  ])
  if (!sourceOk) {
    return NextResponse.json({ error: "Source entity not found in this project" }, { status: 404 })
  }
  if (!targetOk) {
    return NextResponse.json({ error: "Target entity not found in this project" }, { status: 404 })
  }

  // Links read both ways, so a link already stored in the opposite direction is
  // the same link — report it rather than creating a mirrored duplicate.
  const existing = await prisma.entityLink.findFirst({
    where: {
      projectId: params.projectId,
      OR: [
        { sourceId, sourceType, targetId, targetType },
        { sourceId: targetId, sourceType: targetType, targetId: sourceId, targetType: sourceType },
      ],
    },
  })
  if (existing) {
    return NextResponse.json({ error: "These items are already linked", link: existing }, { status: 409 })
  }

  try {
    const link = await prisma.entityLink.create({
      data: {
        projectId: params.projectId,
        sourceId,
        sourceType,
        targetId,
        targetType,
        relationLabel,
        createdBy: auth.session!.user.id,
      },
    })
    return NextResponse.json({ link }, { status: 201 })
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "These items are already linked" }, { status: 409 })
    }
    console.error("POST entity-links failed:", err)
    return NextResponse.json({ error: "Failed to create link" }, { status: 500 })
  }
}
