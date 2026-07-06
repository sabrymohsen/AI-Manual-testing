import { NextRequest, NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

function normalizeOpHost(raw: string): string {
  // Strip trailing slash, path segments, query params — keep only scheme + domain
  const match = raw.trim().match(/^(https?:\/\/[^\/\?#]+)/)
  let host = match ? match[1] : raw.trim()
  host = host.replace(/\/$/, "")
  if (!host.startsWith("http")) host = `https://${host}`
  return host
}
function normalizeOpKey(raw: string): string {
  const m = raw.trim().match(/\/projects\/([^\/\?#]+)/)
  return m ? m[1] : raw.replace(/[\/\?#].*/g, "").trim()
}

async function resolveTypeHref(opHost: string, opKey: string, auth: string): Promise<string> {
  try {
    const res = await fetch(`${opHost}/api/v3/projects/${opKey}/types`, {
      headers: { Authorization: auth, Accept: "application/json" },
    })
    if (!res.ok) return "/api/v3/types/1"
    const data = await res.json()
    const types: Array<{ id: number; name: string }> = data?._embedded?.elements || []
    const task = types.find(t => /task|test|مهمة/i.test(t.name))
    if (task) return `/api/v3/types/${task.id}`
    if (types.length > 0) return `/api/v3/types/${types[0].id}`
  } catch {}
  return "/api/v3/types/1"
}

function buildTestCaseDescription(tc: any): string {
  const module = tc.moduleRelation?.name || tc.module || "General"
  const feature = tc.feature?.name
  const component = tc.component?.name

  let md = `## Test Case\n\n`
  md += `**Title:** ${tc.title}\n`
  md += `**Priority:** ${tc.priority}\n`
  md += `**Module:** ${module}\n`
  if (feature) md += `**Feature:** ${feature}\n`
  if (component) md += `**Component:** ${component}\n`
  md += `**Source:** ${tc.source}\n\n`

  if (tc.preconditions) {
    md += `## Preconditions\n`
    for (const line of tc.preconditions.split("\n").filter(Boolean)) {
      md += `- ${line}\n`
    }
    md += "\n"
  }

  if (tc.steps?.length > 0) {
    md += `## Steps\n\n| Step | Action | Expected Result |\n|---|---|---|\n`
    for (const s of tc.steps) {
      const action = s.actionDescription.replace(/\|/g, "\\|")
      const expected = (s.expectedResult || "").replace(/\|/g, "\\|")
      md += `| ${s.stepNumber} | ${action} | ${expected} |\n`
    }
    md += "\n"
  }

  md += `## Execution Status\nNot Executed\n\n`
  md += `*Generated from [AI Manual QA Tester](${APP_URL})*`
  return md
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await requireProjectOwner(params.projectId)
    if (auth.error) return unauthorizedResponse(auth.error)

    const config = await prisma.integrationConfig.findUnique({
      where: { projectId: params.projectId },
    })

    if (!config || !config.enabled || config.provider !== "openproject") {
      return NextResponse.json(
        { error: "OpenProject integration is not configured or not enabled for this project." },
        { status: 400 }
      )
    }
    if (!config.encryptedToken) {
      return NextResponse.json({ error: "No API token saved. Please save the integration settings first." }, { status: 400 })
    }

    let token = ""
    try {
      token = decryptSecret({
        encrypted: config.encryptedToken,
        iv: config.encryptionIv || "",
        authTag: config.encryptionAuthTag || "",
        keyVersion: config.keyVersion || "v1",
      })
    } catch (decryptErr: any) {
      return NextResponse.json({ error: `Failed to decrypt API token: ${decryptErr.message}` }, { status: 500 })
    }

    const opHost = normalizeOpHost(config.host || "")
    const opKey = normalizeOpKey(config.projectKey || "")

    if (!opHost || opHost === "https://") {
      return NextResponse.json({ error: "OpenProject host URL is not configured." }, { status: 400 })
    }
    if (!opKey) {
      return NextResponse.json({ error: "OpenProject project identifier is not configured." }, { status: 400 })
    }

    const authHeader = `Basic ${Buffer.from(`apikey:${token.trim()}`).toString("base64")}`
    const typeHref = await resolveTypeHref(opHost, opKey, authHeader)

    const body = await request.json().catch(() => ({}))
    const { testCaseIds } = body as { testCaseIds?: string[] }

    const testCases = await prisma.testCase.findMany({
      where: {
        projectId: params.projectId,
        ...(testCaseIds?.length ? { id: { in: testCaseIds } } : {}),
      },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    })

    if (testCases.length === 0) {
      return NextResponse.json({ error: "No test cases found to sync." }, { status: 400 })
    }

    // Load existing mappings
    const existingMappings = await prisma.externalSyncMapping.findMany({
      where: {
        projectId: params.projectId,
        provider: "OpenProject",
        localEntityType: "TestCase",
        localEntityId: { in: testCases.map(tc => tc.id) },
      },
    })
    const mappingMap = new Map(existingMappings.map(m => [m.localEntityId, m]))

    const wpBaseUrl = `${opHost}/api/v3/projects/${opKey}/work_packages`
    const created: Array<{ title: string; opId: number; opUrl: string }> = []
    const updated: Array<{ title: string; opId: number }> = []
    const failed: Array<{ title: string; error: string }> = []

    for (const tc of testCases) {
      const description = buildTestCaseDescription(tc)
      const subject = `[TC] ${tc.title}`
      const existingMapping = mappingMap.get(tc.id)

      try {
        if (existingMapping) {
          // UPDATE existing work package
          const updateUrl = `${opHost}/api/v3/work_packages/${existingMapping.externalId}`
          const getRes = await fetch(updateUrl, {
            headers: { Authorization: authHeader, Accept: "application/json" },
          })
          if (!getRes.ok) {
            failed.push({ title: tc.title, error: `Could not fetch WP #${existingMapping.externalId}: HTTP ${getRes.status}` })
            continue
          }
          const wpData = await getRes.json()
          const lockVersion = wpData.lockVersion ?? 0

          const patchRes = await fetch(updateUrl, {
            method: "PATCH",
            headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              lockVersion,
              subject,
              description: { format: "markdown", raw: description },
            }),
          })

          if (patchRes.ok) {
            await prisma.externalSyncMapping.update({
              where: { id: existingMapping.id },
              data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
            })
            updated.push({ title: tc.title, opId: Number(existingMapping.externalId) })
          } else {
            const errText = await patchRes.text().catch(() => "")
            await prisma.externalSyncMapping.update({
              where: { id: existingMapping.id },
              data: { lastSyncStatus: "failed", lastSyncError: `HTTP ${patchRes.status}` },
            })
            failed.push({ title: tc.title, error: `Update HTTP ${patchRes.status}: ${errText.slice(0, 100)}` })
          }
        } else {
          // CREATE new work package
          const res = await fetch(wpBaseUrl, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              subject,
              description: { format: "markdown", raw: description },
              _links: { type: { href: typeHref } },
            }),
          })

          if (res.ok) {
            const data = await res.json()
            const wpId = String(data.id)
            const wpUrl = `${opHost}/work_packages/${wpId}`

            await prisma.externalSyncMapping.create({
              data: {
                projectId: params.projectId,
                provider: "OpenProject",
                localEntityType: "TestCase",
                localEntityId: tc.id,
                externalId: wpId,
                externalUrl: wpUrl,
                externalType: "TestCase",
                lastSyncedAt: new Date(),
                lastSyncStatus: "success",
              },
            })
            created.push({ title: tc.title, opId: data.id, opUrl: wpUrl })
          } else {
            const errText = await res.text().catch(() => "")
            failed.push({ title: tc.title, error: `HTTP ${res.status}: ${errText.slice(0, 100)}` })
          }
        }
      } catch (tcErr: any) {
        failed.push({ title: tc.title, error: tcErr.message || "Unknown error" })
      }
    }

    const message = [
      created.length > 0 ? `Created in OpenProject: ${created.length}` : "",
      updated.length > 0 ? `Updated in OpenProject: ${updated.length}` : "",
      failed.length > 0 ? `Failed: ${failed.length}` : "",
    ].filter(Boolean).join(" · ")

    return NextResponse.json({
      created: created.length,
      updated: updated.length,
      failed: failed.length,
      total: testCases.length,
      message: message || "No changes",
      details: { created, updated, failed },
    })
  } catch (err: any) {
    console.error("[sync-test-cases] Unhandled error:", err)
    return NextResponse.json(
      { error: err.message || "Internal server error during sync" },
      { status: 500 }
    )
  }
}
