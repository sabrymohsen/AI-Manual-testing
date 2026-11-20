import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

const text = (html: string | null | undefined) =>
  (html || "")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/**
 * GET /api/hub/explore/stories?projectId= — user stories to explore: the Scrum
 * board's stories and the BRD hub's user-story requirements, newest first.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") || ""
  const auth = await requireHubProject(projectId, "read")
  if (!auth.ok) return auth.response

  const [tasks, reqs] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, type: "STORY" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, description: true, taskNumber: true, project: { select: { boardKey: true } } },
    }),
    prisma.brdRequirement.findMany({
      where: { brd: { projectId, isDeleted: false }, status: { not: "removed" }, type: { in: ["User story", "Functional"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, key: true, title: true, description: true, acceptanceCriteria: true },
    }),
  ])
  const criteriaFrom = (body: string) =>
    body
      .split("\n")
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter((l) => l.length > 5)
      .slice(0, 10)

  return NextResponse.json({
    stories: [
      ...tasks.map((t) => {
        const body = text(t.description)
        return {
          id: `task:${t.id}`,
          source: "Scrum board",
          key: t.project?.boardKey && t.taskNumber ? `${t.project.boardKey}-${t.taskNumber}` : null,
          title: t.title,
          text: body.slice(0, 2000),
          criteria: /acceptance|criteria|معايير/i.test(body) ? criteriaFrom(body.split(/acceptance criteria|معايير القبول/i)[1] || "") : [],
        }
      }),
      ...reqs.map((r) => ({
        id: `req:${r.id}`,
        source: "BRD",
        key: r.key,
        title: r.title,
        text: (r.description || "").slice(0, 2000),
        criteria: Array.isArray(r.acceptanceCriteria) ? (r.acceptanceCriteria as unknown[]).map(String).slice(0, 10) : [],
      })),
    ],
  })
}
