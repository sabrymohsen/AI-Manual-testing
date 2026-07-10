/**
 * Normalized, provider-agnostic domain model for project-management integrations.
 *
 * The sync engines (bug / requirement / group) and the UI speak ONLY these shapes.
 * Each provider (OpenProject, Jira, Azure DevOps, ClickUp) maps its own API onto
 * this vocabulary, so no provider-specific JSON ever leaks into shared code.
 */

// ─── Provider identity ────────────────────────────────────────────────────────

export type ProviderId = "OpenProject" | "Jira" | "AzureDevOps" | "ClickUp"

/** Local entity kinds we sync out to an external tracker. */
export type EntityType = "BugReport" | "TestCase" | "Requirement" | "TestRun"

/** The three logical work-item roles the app maps to a provider's native types. */
export type ItemRole = "testCase" | "bug" | "userStory"

// ─── Metadata shapes ──────────────────────────────────────────────────────────

/** A work-item type in the external tool (OP type / Jira issuetype / ADO WIT / ClickUp — n/a). */
export interface WorkItemType {
  id: string
  name: string
}

/** A status/state a work item can hold. */
export interface WorkItemStatus {
  id: string
  name: string
  isClosed: boolean
  isDefault: boolean
}

/**
 * A "board" abstraction. Maps to: OP grid, Jira agile board, ADO team board /
 * area path, ClickUp list/board view. `type` drives how a card is placed.
 */
export interface Board {
  id: string
  name: string
  type: "status" | "version" | "assignee" | "basic" | "sprint" | "list"
}

/**
 * A placeable column within a board. `attributeId` carries whatever the provider
 * needs to move a card into this column (status id, version id, assignee id,
 * sprint id, list-status name, or the column's own query id for free boards).
 */
export interface BoardColumn {
  id: string // provider-native placement key (OP widgetId, Jira column id, …)
  name: string
  columnType: "status" | "version" | "assignee" | "basic" | "sprint" | "list"
  attributeId: string | null
}

export interface Member {
  id: string
  name: string
}

export interface Priority {
  id: string
  name: string
}

/** A custom/required field definition on a work-item type. */
export interface CustomFieldDef {
  key: string // provider schema key (OP "customField6", Jira "customfield_10011", ADO ref, ClickUp field id)
  name: string
  required: boolean
  /** True when the field takes reference value(s) (dropdown/user/version). */
  isLink: boolean
  isMulti: boolean
  /** True for rich-text/markdown-style fields. */
  isFormattable: boolean
  allowedValues: Array<{ id: string; title: string }>
}

// ─── Work items ───────────────────────────────────────────────────────────────

/**
 * A normalized work item as the app reads it back from a provider. `raw` keeps
 * the provider's original object for provider-internal follow-up calls, and
 * `lockVersion` carries optimistic-concurrency tokens (OP lockVersion, Jira/ADO
 * have their own or none).
 */
export interface WorkItem {
  externalId: string
  url: string
  title: string
  description: string
  statusId: string | null
  statusName: string | null
  typeId: string | null
  typeName: string | null
  assigneeId: string | null
  priorityId: string | null
  priorityName: string | null
  parentId: string | null
  fields: Record<string, unknown>
  lockVersion?: number
  raw?: unknown
}

/**
 * Payload for creating/updating a work item, expressed in normalized terms.
 * Providers translate these fields into their own request bodies.
 *
 * `linkFields` / `scalarFields` mirror the OpenProject split (reference values vs
 * body scalars) so custom-field mapping survives the abstraction; providers that
 * don't need the distinction can merge them.
 */
export interface WorkItemInput {
  /** Required on create; omit on a partial update to leave the title unchanged. */
  title?: string
  /** Markdown description; providers convert to ADF/HTML/etc. as needed. */
  description?: string
  typeId?: string | null
  statusId?: string | null
  assigneeId?: string | null
  priorityId?: string | null
  parentId?: string | null
  /** Reference-valued custom fields: key -> external value id (or array for multi). */
  linkFields?: Record<string, string | string[]>
  /** Scalar/formattable custom fields: key -> primitive/markdown value. */
  scalarFields?: Record<string, unknown>
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface TestConnectionResult {
  success: boolean
  message: string
  projectName?: string
  types?: WorkItemType[]
  statuses?: WorkItemStatus[]
  boards?: Board[]
  canCreate?: boolean
  errors?: string[]
}

export interface SyncItemResult {
  localId: string
  title: string
  action: "created" | "updated" | "skipped" | "failed"
  externalId?: string
  externalUrl?: string
  error?: string
}

/**
 * A normalized inbound change parsed from a provider webhook/poll, used to
 * reconcile external edits back onto the local entity.
 */
export interface NormalizedInboundEvent {
  externalId: string
  /** Which local entity this maps to, if the provider tells us; else inferred via ExternalSyncMapping. */
  entityHint?: EntityType
  changed: {
    statusId?: string
    statusName?: string
    assigneeId?: string
    title?: string
    priorityId?: string
  }
  /** Provider timestamp of the change, for last-writer-wins. */
  occurredAt?: Date
  action?: "updated" | "deleted"
}

/** Image content-type table shared by attachment sync across providers. */
export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

/** Stable marker embedded in a work item's description to find it on re-sync. */
export function entityMarker(entityType: EntityType, localId: string): string {
  return `AI-Manual-QA-Tester:${entityType}:${localId}`
}
