/**
 * POST /api/integrations/webhooks/[provider]?projectId=...
 *
 * Inbound half of two-way sync. Verifies the provider's webhook, parses it into
 * normalized events, and reconciles external edits (status / title / assignee)
 * back onto the local BugReport / TestCase / Requirement via ExternalSyncMapping.
 *
 * Conflict rule: last-writer-wins — an inbound change is skipped when the local
 * record was edited more recently than the event's timestamp.
 *
 * Always returns 200 (after auth) so providers don't storm retries on our errors.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getProvider } from "@/lib/integrations/core/factory"
import { reconcileInboundEvent } from "@/lib/integrations/core/inbound"
import { readBugStatusMapping } from "@/lib/integrations/core/bug-status-mapping"
import type { ProviderId } from "@/lib/integrations/core/types"

const PROVIDER_IDS = ["OpenProject", "Jira", "AzureDevOps", "ClickUp"]

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider
  if (!PROVIDER_IDS.includes(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get("projectId")
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 })

  const integration = await prisma.projectIntegration.findUnique({ where: { projectId } })
  if (!integration || integration.provider !== provider) {
    return NextResponse.json({ error: "No matching integration" }, { status: 404 })
  }
  if (!integration.inboundSyncEnabled) {
    return NextResponse.json({ ignored: "inbound sync disabled" })
  }

  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))
  // Allow the secret to arrive via the callback URL query as well as a header.
  const urlSecret = url.searchParams.get("secret")
  if (urlSecret) headers["x-webhook-secret"] = urlSecret

  const client = getProvider(integration)
  if (!client.verifyWebhook(headers, rawBody)) {
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const events = client.parseWebhook(payload)
  // Read the bug status mapping once for the whole batch.
  const ctx = { bugStatusMapping: readBugStatusMapping(integration.statusMapping) }
  let applied = 0
  for (const event of events) {
    try {
      const did = await reconcileInboundEvent(projectId, provider as ProviderId, client, event, ctx)
      if (did) applied++
    } catch (err: any) {
      console.warn(`[webhook:${provider}] reconcile failed for ${event.externalId}: ${err?.message}`)
    }
  }

  await prisma.projectIntegration
    .update({ where: { projectId }, data: { lastInboundAt: new Date() } })
    .catch(() => {})

  return NextResponse.json({ received: events.length, applied })
}
