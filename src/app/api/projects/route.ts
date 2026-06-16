import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get("search") || ""
  const environment = searchParams.get("environment")

  const projects = await prisma.project.findMany({
    where: {
      userId: session.user.id,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(environment ? { environment: environment as any } : {}),
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ projects })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const body = await request.json()
  const project = await prisma.project.create({
    data: {
      ...body,
      userId: session.user.id,
    },
  })

  return NextResponse.json({ project }, { status: 201 })
}
