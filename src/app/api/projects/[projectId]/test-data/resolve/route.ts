import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { decryptSecret } from "@/lib/crypto"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const resolveSchema = z.object({
      text: z.string().min(1, "text is required"),
      environment: z.string().optional(),
    })
    const parsed = resolveSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const { text, environment } = parsed.data

    const resolved = await resolveVariablesInText(params.projectId, text, environment)
    return NextResponse.json({ resolved })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to resolve text" }, { status: 500 })
  }
}

async function resolveVariablesInText(projectId: string, text: string, environment?: string): Promise<string> {
  let result = text

  // Fetch variables matching project, prioritizing current environment if specified
  const variables = await (prisma as any).testDataVariable.findMany({
    where: {
      projectId,
      OR: [
        { environment: null },
        environment ? { environment: environment as any } : {}
      ]
    }
  })

  // Parse all {{placeholder}} keys in text
  const regex = /\{\{([^}]+)\}\}/g
  let match
  const matches: string[] = []
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].trim())
  }

  const uniqueMatches = Array.from(new Set(matches))
  for (const rawKey of uniqueMatches) {
    let replacement = ""
    let matched = false

    // Handle dynamic built-in variables
    if (rawKey === "random.email") {
      replacement = `user_${Math.random().toString(36).substring(2, 11)}@example.com`
      matched = true
    } else if (rawKey === "random.phone") {
      replacement = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`
      matched = true
    } else if (rawKey === "random.name") {
      replacement = `TestUser_${Math.floor(1000 + Math.random() * 9000)}`
      matched = true
    } else if (rawKey === "random.productName") {
      replacement = `TestProduct_${Math.floor(1000 + Math.random() * 9000)}`
      matched = true
    } else if (rawKey === "today") {
      replacement = new Date().toISOString().split("T")[0]
      matched = true
    } else if (rawKey === "timestamp") {
      replacement = Date.now().toString()
      matched = true
    } else if (rawKey === "uuid") {
      replacement = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      matched = true
    }

    if (!matched) {
      // Find matches in project variables database
      // If we have an environment-specific variable, prefer it over global
      let variable = variables.find((v: any) => v.key === rawKey && v.environment === environment)
      if (!variable) {
        variable = variables.find((v: any) => v.key === rawKey && !v.environment)
      }

      if (variable) {
        if (variable.isSensitive && variable.encryptedValue && variable.encryptionIv && variable.encryptionAuthTag) {
          try {
            replacement = decryptSecret({
              encrypted: variable.encryptedValue,
              iv: variable.encryptionIv,
              authTag: variable.encryptionAuthTag,
              keyVersion: variable.keyVersion || "v1"
            })
          } catch (e) {
            replacement = "[Decryption Failed]"
          }
        } else {
          replacement = variable.value || ""
        }
        matched = true
      }
    }

    if (matched) {
      const escapedKey = rawKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      const replaceRegex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g')
      result = result.replace(replaceRegex, replacement)
    }
  }

  return result
}
