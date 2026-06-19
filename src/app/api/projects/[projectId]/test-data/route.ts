import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { encryptSecret } from "@/lib/crypto"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const variables = await prisma.testDataVariable.findMany({
      where: { projectId: params.projectId },
      orderBy: { key: "asc" }
    })

    const sanitized = variables.map((v) => {
      if (v.isSensitive) {
        return {
          ...v,
          value: "••••••••",
          encryptedValue: null,
          encryptionIv: null,
          encryptionAuthTag: null
        }
      }
      return v
    })

    return NextResponse.json(sanitized)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch variables" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { key, value, dataType, environment, isSensitive, notes } = body

    if (!key) {
      return NextResponse.json({ error: "Variable key is required" }, { status: 400 })
    }

    let encryptedData = {}
    let rawValue = value

    if (isSensitive && value) {
      const encrypted = encryptSecret(value)
      encryptedData = {
        encryptedValue: encrypted.encrypted,
        encryptionIv: encrypted.iv,
        encryptionAuthTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion
      }
      rawValue = null
    }

    const variable = await prisma.testDataVariable.create({
      data: {
        projectId: params.projectId,
        key: key.trim(),
        value: rawValue,
        dataType: dataType || "text",
        environment: environment || null,
        isSensitive: !!isSensitive,
        notes,
        ...encryptedData
      }
    })

    const responseData = { ...variable }
    if (responseData.isSensitive) {
      responseData.value = "••••••••"
      responseData.encryptedValue = null
      responseData.encryptionIv = null
      responseData.encryptionAuthTag = null
    }

    return NextResponse.json(responseData, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create variable" }, { status: 500 })
  }
}
