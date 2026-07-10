/**
 * Provider display labels — the single source of truth for the "name depends on
 * the connected tool" requirement. UI surfaces resolve their wording (e.g.
 * "Sync to Jira", "ClickUp Sync", "View work item") from here instead of
 * hardcoding "OpenProject".
 */
import type { ProviderId } from "./core/types"

export interface ProviderLabels {
  /** Human display name, e.g. "Azure DevOps". */
  name: string
  /** Noun for a single external item, e.g. "issue" / "work item" / "task". */
  itemNoun: string
  /** Capitalized item noun for headings, e.g. "Work item". */
  itemNounCap: string
  /** The connection-key field label, e.g. "Project key" / "List ID". */
  projectKeyLabel: string
  /** Whether this provider needs a username/email alongside the token. */
  needsUsername: boolean
  /** Label for the token field, e.g. "API token" / "Personal Access Token". */
  tokenLabel: string
  /** Label for the base URL field (empty when the provider has a fixed host). */
  baseUrlLabel: string
}

const LABELS: Record<ProviderId, ProviderLabels> = {
  OpenProject: {
    name: "OpenProject",
    itemNoun: "work package",
    itemNounCap: "Work package",
    projectKeyLabel: "Project identifier",
    needsUsername: false,
    tokenLabel: "API token",
    baseUrlLabel: "OpenProject URL",
  },
  Jira: {
    name: "Jira",
    itemNoun: "issue",
    itemNounCap: "Issue",
    projectKeyLabel: "Project key",
    needsUsername: true,
    tokenLabel: "API token",
    baseUrlLabel: "Jira site (e.g. your-org.atlassian.net)",
  },
  AzureDevOps: {
    name: "Azure DevOps",
    itemNoun: "work item",
    itemNounCap: "Work item",
    projectKeyLabel: "Project name",
    needsUsername: false,
    tokenLabel: "Personal Access Token",
    baseUrlLabel: "Organization (e.g. dev.azure.com/your-org)",
  },
  ClickUp: {
    name: "ClickUp",
    itemNoun: "task",
    itemNounCap: "Task",
    projectKeyLabel: "List ID",
    needsUsername: false,
    tokenLabel: "API token",
    baseUrlLabel: "", // fixed host
  },
}

const DEFAULT: ProviderLabels = LABELS.OpenProject

export function providerLabels(provider: string | null | undefined): ProviderLabels {
  if (!provider) return DEFAULT
  return LABELS[provider as ProviderId] || DEFAULT
}

/** Convenience: just the display name (falls back to the raw value, then "tracker"). */
export function providerName(provider: string | null | undefined): string {
  if (!provider) return "tracker"
  return LABELS[provider as ProviderId]?.name || provider
}

/** All providers, for the connect-form picker. */
export const ALL_PROVIDERS: Array<{ id: ProviderId; labels: ProviderLabels }> = (
  Object.keys(LABELS) as ProviderId[]
).map((id) => ({ id, labels: LABELS[id] }))
