/**
 * Provider factory — resolves a ProjectIntegration row into a live WorkItemProvider.
 *
 * Decrypts the stored API token (AES-256-GCM, src/lib/crypto) and constructs the
 * implementation matching integration.provider. This is the single place shared
 * sync code obtains a provider, so callers never branch on provider id.
 */
import { decryptSecret } from "@/lib/crypto"
import type { ProviderConnection, WorkItemProvider } from "./provider"
import type { ProviderId } from "./types"
import { OpenProjectProvider } from "../providers/openproject.provider"
import { JiraProvider } from "../providers/jira.provider"
import { AzureDevOpsProvider } from "../providers/azure-devops.provider"
import { ClickUpProvider } from "../providers/clickup.provider"

/** The subset of a ProjectIntegration row the factory needs to build a provider. */
export interface IntegrationRow {
  provider: string
  baseUrl: string
  externalProjectKey: string
  username?: string | null
  apiTokenEncrypted: string
  apiTokenIv: string
  apiTokenAuthTag: string
  apiTokenKeyVersion?: string | null
  webhookSecret?: string | null
}

export function connectionFromRow(row: IntegrationRow): ProviderConnection {
  const apiToken = decryptSecret({
    encrypted: row.apiTokenEncrypted,
    iv: row.apiTokenIv,
    authTag: row.apiTokenAuthTag,
    keyVersion: row.apiTokenKeyVersion || "v1",
  })
  return {
    provider: row.provider as ProviderId,
    baseUrl: row.baseUrl,
    externalProjectKey: row.externalProjectKey,
    username: row.username || "",
    apiToken,
    webhookSecret: row.webhookSecret ?? null,
  }
}

export function providerFromConnection(conn: ProviderConnection): WorkItemProvider {
  switch (conn.provider) {
    case "OpenProject":
      return new OpenProjectProvider(conn)
    case "Jira":
      return new JiraProvider(conn)
    case "AzureDevOps":
      return new AzureDevOpsProvider(conn)
    case "ClickUp":
      return new ClickUpProvider(conn)
    default:
      throw new Error(`Unknown integration provider: ${conn.provider}`)
  }
}

/** Build a provider directly from an integration row (decrypts + dispatches). */
export function getProvider(row: IntegrationRow): WorkItemProvider {
  return providerFromConnection(connectionFromRow(row))
}
