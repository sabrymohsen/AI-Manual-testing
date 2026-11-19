import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"

const VALID_LOCATOR_TYPES = ["test_id", "role", "text", "label", "placeholder", "css", "xpath", "url", "none"]

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const collections = await prisma.elementCollection.findMany({
    where: { projectId: params.projectId },
    include: { elements: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ collections })
}

// Save a picker session's elements as a reusable collection.
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const { name, description, elements, moduleId, featureId, componentId } = body || {}

  if (!name || typeof name !== "string") return badRequestResponse("Collection name is required")
  if (!Array.isArray(elements) || elements.length === 0) return badRequestResponse("At least one element is required")

  const pageUrls = Array.from(
    new Set(elements.map((e: any) => e.pageUrl).filter((u: any) => typeof u === "string" && u))
  )

  const collection = await prisma.elementCollection.create({
    data: {
      projectId: params.projectId,
      name,
      description: description || null,
      pageUrls,
      elements: {
        create: elements.map((e: any) => ({
          projectId: params.projectId,
          moduleId: moduleId || null,
          featureId: featureId || null,
          componentId: componentId || null,
          friendlyName: (e.suggestedName || e.friendlyName || e.tagName || "element").toString().slice(0, 120),
          description: null,
          pageUrl: e.pageUrl || (pageUrls[0] as string) || "",
          tagName: e.tagName || null,
          visibleText: e.visibleText || null,
          locatorType: VALID_LOCATOR_TYPES.includes(e.locatorType) ? e.locatorType : "css",
          locatorValue: e.locatorValue || e.cssSelector || "",
          recommendedSelector: e.recommendedSelector || null,
          cssSelector: e.cssSelector || null,
          xpathSelector: e.xpathSelector || null,
          idSelector: e.idSelector || null,
          testIdSelector: e.testIdSelector || null,
          roleSelector: e.roleSelector || null,
          textSelector: e.textSelector || null,
          labelSelector: e.labelSelector || null,
          placeholderSelector: e.placeholderSelector || null,
          reliabilityScore: Number(e.reliabilityScore || 0),
          attributes: e.attributes || {},
          screenshotPath: e.screenshotPath || null,
          actionType: e.actionType || "click",
          isValidated: false,
        })),
      },
    },
    include: { elements: true },
  })

  return NextResponse.json({ collection }, { status: 201 })
}
