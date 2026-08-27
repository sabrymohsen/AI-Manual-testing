import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { decryptSecret, checkEncryptionKey } from "@/lib/crypto"

/**
 * A connection test that passes is only half the answer: the token still has to
 * be storable. Without this, "Test connection" said success and Save then died
 * with "Failed to encrypt API token", which reads as a bug in the integration
 * rather than an unset variable on the host.
 */
function storageWarning(): { warning?: string } {
  const encryption = checkEncryptionKey()
  return encryption.ok
    ? {}
    : { warning: `Connection works, but this server cannot save the token: ${encryption.reason}` }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const testSchema = z.object({
    provider: z.string().min(1, "Provider is required"),
    host: z.string().min(1, "Host is required"),
    projectKey: z.string().min(1, "Project Key is required"),
    username: z.string().optional(),
    token: z.string().optional(),
  })
  const parsed = testSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }
  const { provider, host, projectKey, username } = parsed.data
  let token = parsed.data.token

  // If token is empty/not provided, try to load it from the database and decrypt it
  if (!token) {
    const config = await prisma.integrationConfig.findUnique({
      where: { projectId: params.projectId }
    })
    if (config?.encryptedToken) {
      try {
        token = decryptSecret({
          encrypted: config.encryptedToken,
          iv: config.encryptionIv || "",
          authTag: config.encryptionAuthTag || "",
          keyVersion: config.keyVersion || "v1"
        })
      } catch (err) {
        return NextResponse.json({ error: "Failed to decrypt saved token" }, { status: 500 })
      }
    }
  }

  if (!token) {
    return NextResponse.json({ error: "API token/PAT is required to test connection" }, { status: 400 })
  }

  if (!host || !projectKey) {
    return NextResponse.json({ error: "Host and Project Key/ID are required to test connection" }, { status: 400 })
  }

  try {
    if (provider === "jira") {
      // Clean host url
      let jiraHost = host.trim().replace(/^https?:\/\//, "")
      const url = `https://${jiraHost}/rest/api/2/project/${projectKey.trim()}`
      const credentials = Buffer.from(`${(username || "").trim()}:${token.trim()}`).toString("base64")

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Accept": "application/json"
        }
      })

      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Jira returned status ${res.status}: ${text.slice(0, 100)}` }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: "Successfully connected to Jira!", ...storageWarning() })
    }

    if (provider === "azure_devops") {
      // Azure DevOps Personal Access Token (PAT) requires basic auth with empty username or custom username
      const credentials = Buffer.from(`:${token.trim()}`).toString("base64")
      // host for ADO is usually organization: e.g. "dev.azure.com/org" or "org" (if it is just the name)
      let adoOrg = host.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")
      if (!adoOrg.includes("dev.azure.com/")) {
        adoOrg = `dev.azure.com/${adoOrg}`
      }
      const url = `https://${adoOrg}/${projectKey.trim()}/_apis/projects/${projectKey.trim()}?api-version=6.0`

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Accept": "application/json"
        }
      })

      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Azure DevOps returned status ${res.status}: ${text.slice(0, 100)}` }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: "Successfully connected to Azure DevOps!", ...storageWarning() })
    }

    if (provider === "openproject") {
      // Normalize host: strip path, query, fragment — keep only scheme + domain
      let opHost = host.trim()
      const hostMatch = opHost.match(/^(https?:\/\/[^\/\?#]+)/)
      opHost = hostMatch ? hostMatch[1] : opHost
      opHost = opHost.replace(/\/$/, "")
      if (!opHost.startsWith("http")) {
        opHost = `https://${opHost}`
      }

      // Normalize project key — extract slug if user pasted full URL
      let normalizedKey = projectKey.trim()
      const projMatch = normalizedKey.match(/\/projects\/([^\/\?#]+)/)
      if (projMatch) normalizedKey = projMatch[1]
      else normalizedKey = normalizedKey.replace(/[\/\?#].*/g, "").trim()

      const url = `${opHost}/api/v3/projects/${normalizedKey}`
      // OpenProject: Basic auth with username "apikey" and token as password
      const credentials = Buffer.from(`apikey:${token.trim()}`).toString("base64")

      let res: Response
      try {
        res = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Accept": "application/json",
          },
        })
      } catch (fetchErr) {
        return NextResponse.json(
          { error: `Could not reach OpenProject at ${opHost} — check the host URL and that the server is reachable.` },
          { status: 400 }
        )
      }

      // Try Bearer token fallback if Basic auth fails (OpenProject 14+ supports it)
      if (res.status === 401 || res.status === 403) {
        try {
          const res2 = await fetch(url, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${token.trim()}`,
              "Accept": "application/json",
            },
          })
          if (res2.ok) {
            return NextResponse.json({ success: true, message: "Successfully connected to OpenProject!", ...storageWarning() })
          }
        } catch {}
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        let hint = ""
        if (res.status === 404) {
          hint = ` — Project identifier "${normalizedKey}" not found. Check the project slug in Settings > General.`
        } else if (res.status === 401 || res.status === 403) {
          hint = " — Invalid API token. Generate a new token from My Account → Access Tokens in OpenProject."
        }
        return NextResponse.json(
          { error: `OpenProject returned ${res.status}${hint}` },
          { status: 400 }
        )
      }

      return NextResponse.json({ success: true, message: "Successfully connected to OpenProject!", ...storageWarning() })
    }

    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error"
    return NextResponse.json({ error: `Connection failed: ${msg}` }, { status: 500 })
  }
}
