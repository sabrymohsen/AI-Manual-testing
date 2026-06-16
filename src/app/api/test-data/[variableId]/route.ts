import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { encryptSecret } from "@/lib/crypto"

export async function PUT(
  request: Request,
  { params }: { params: { variableId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { key, value, dataType, environment, isSensitive, notes } = body

    if (!key) {
      return NextResponse.json({ error: "Variable key is required" }, { status: 400 })
    }

    const existing = await prisma.testDataVariable.findUnique({
      where: { id: params.variableId }
    })

    if (!existing) {
      return NextResponse.json({ error: "Variable not found" }, { status: 404 })
    }

    let encryptedData = {}
    let rawValue = value

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
        value: rawValue,
        dataType: dataType || "text",
        environment: environment || null,
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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
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
