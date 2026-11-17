import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireAuth, unauthorizedResponse, badRequestResponse, notFoundResponse, memberProjectWhere, canUseProject } from "@/lib/api-guards"
import { encryptSecret } from "@/lib/crypto"

const putBodySchema = z.object({
  key: z.string().min(1, "Variable key is required"),
  value: z.string().optional(),
  dataType: z.string().optional(),
  environment: z.string().optional(),
  isSensitive: z.boolean().optional(),
  notes: z.string().optional(),
})

export async function PUT(
  request: Request,
  { params }: { params: { variableId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) {
    return unauthorizedResponse(auth.error)
  }

  const existing = await prisma.testDataVariable.findFirst({
    where: { id: params.variableId, project: memberProjectWhere(auth.session!.user.id) },
    select: { projectId: true, encryptedValue: true, encryptionIv: true, encryptionAuthTag: true, keyVersion: true }
  })

  if (!existing || !(await canUseProject(existing.projectId, auth.session!.user.id, "write"))) {
    return notFoundResponse("Not found")
  }

  try {
    const body = await request.json()
    const parse = putBodySchema.safeParse(body)
    if (!parse.success) {
      return badRequestResponse(parse.error.errors[0].message)
    }
    const { key, value, dataType, environment, isSensitive, notes } = parse.data

    let encryptedData = {}
    let rawValue: string | null | undefined = value

    if (isSensitive) {
      if (value === "••••••••") {
        // value was not modified
        encryptedData = {
          encryptedValue: existing.encryptedValue,
          encryptionIv: existing.encryptionIv,
          encryptionAuthTag: existing.encryptionAuthTag,
          keyVersion: existing.keyVersion
        }
        rawValue = null
      } else if (value) {
        // Value was changed, encrypt it
        const encrypted = encryptSecret(value)
        encryptedData = {
          encryptedValue: encrypted.encrypted,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion
        }
        rawValue = null
      } else {
        // Empty value
        encryptedData = {
          encryptedValue: null,
          encryptionIv: null,
          encryptionAuthTag: null,
          keyVersion: null
        }
        rawValue = null
      }
    } else {
      // Not sensitive anymore
      encryptedData = {
        encryptedValue: null,
        encryptionIv: null,
        encryptionAuthTag: null,
        keyVersion: null
      }
    }

    const updated = await prisma.testDataVariable.update({
      where: { id: params.variableId },
      data: {
        key: key.trim(),
        value: rawValue ?? undefined,
        dataType: dataType || "text",
        environment: (environment as any) || null,
        isSensitive: !!isSensitive,
        notes,
        ...encryptedData
      }
    })

    const responseData = { ...updated }
    if (responseData.isSensitive) {
      responseData.value = "••••••••"
      responseData.encryptedValue = null
      responseData.encryptionIv = null
      responseData.encryptionAuthTag = null
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update variable" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { variableId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) {
    return unauthorizedResponse(auth.error)
  }

  const entity = await prisma.testDataVariable.findFirst({
    where: { id: params.variableId, project: memberProjectWhere(auth.session!.user.id) },
    select: { projectId: true }
  })
  if (!entity || !(await canUseProject(entity.projectId, auth.session!.user.id, "write"))) {
    return notFoundResponse("Not found")
  }

  try {
    await prisma.testDataVariable.delete({
      where: { id: params.variableId }
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete variable" }, { status: 500 })
  }
}
