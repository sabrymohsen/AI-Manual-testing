import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, memberProjectWhere } from "@/lib/api-guards"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  const totalProjects = await prisma.project.count({
    where: memberProjectWhere(session.user.id),
  })

  const totalTestCases = await prisma.testCase.count({
    where: { project: memberProjectWhere(session.user.id) },
  })

  const totalTestRuns = await prisma.testRun.count({
    where: { project: memberProjectWhere(session.user.id) },
  })

  const passed = await prisma.testRun.count({
    where: { project: memberProjectWhere(session.user.id), status: "Passed" },
  })

  const failed = await prisma.testRun.count({
    where: { project: memberProjectWhere(session.user.id), status: "Failed" },
  })

  const warning = await prisma.testRun.count({
    where: { project: memberProjectWhere(session.user.id), status: "Warning" },
  })

  const passPercentage = totalTestRuns > 0
    ? (passed / totalTestRuns) * 100
    : 0

  return NextResponse.json({
    totalProjects,
    totalTestCases,
    totalTestRuns,
    passed,
    failed,
    warning,
    passPercentage,
  })
}
