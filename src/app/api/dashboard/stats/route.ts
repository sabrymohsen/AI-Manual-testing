import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const totalProjects = await prisma.project.count({
    where: { userId: session.user.id },
  })

  const totalTestCases = await prisma.testCase.count({
    where: { project: { userId: session.user.id } },
  })

  const totalTestRuns = await prisma.testRun.count({
    where: { project: { userId: session.user.id } },
  })

  const passed = await prisma.testRun.count({
    where: { project: { userId: session.user.id }, status: "Passed" },
  })

  const failed = await prisma.testRun.count({
    where: { project: { userId: session.user.id }, status: "Failed" },
  })

  const warning = await prisma.testRun.count({
    where: { project: { userId: session.user.id }, status: "Warning" },
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
