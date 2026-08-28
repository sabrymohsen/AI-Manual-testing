/**
 * AzureDevOpsProvider — Azure DevOps REST 7.0 implementation of WorkItemProvider.
 *
 * Auth: Basic base64(":PAT"). Work items are created/updated with JSON Patch
 * (application/json-patch+json). ADO has no numeric ids for work-item types or
 * states — the NAME is the id. Statuses map to System.State; the app priority
 * maps to Microsoft.VSTS.Common.Priority (1..4). A sanitized marker tag makes
 * re-sync lookups reliable (WIQL CONTAINS on System.Tags). Boards/members are
 * intentionally minimal for v1 (cards appear on boards by state).
 */
import { BaseProvider, type ProviderConnection } from "../core/provider"
import { markdownToHtml, htmlToPlainText } from "./html"
import {
  entityMarker,
  type Board,
  type BoardColumn,
  type CustomFieldDef,
  type EntityType,
  type Member,
  type NormalizedInboundEvent,
  type Priority,
  type ProviderId,
  type TestConnectionResult,
  type WorkItem,
  type WorkItemInput,
  type WorkItemStatus,
  type WorkItemType,
} from "../core/types"

const API = "api-version=7.0"

/** ADO tags can't hold ':' — sanitize the marker into a tag-safe token. */
function markerTag(entityType: EntityType, localId: string): string {
  return entityMarker(entityType, localId).replace(/[:]/g, "-")
}

export class AzureDevOpsProvider extends BaseProvider {
  readonly provider: ProviderId = "AzureDevOps"
  private orgUrl: string
  private project: string
  private authHeader: string
  private webhookSecret: string | null

  constructor(conn: ProviderConnection) {
    super()
    // Accept "https://dev.azure.com/org", "dev.azure.com/org", or bare "org".
    let host = conn.baseUrl.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
    if (!host.includes("/")) host = `dev.azure.com/${host}`
    else if (!host.includes("dev.azure.com") && !host.includes(".visualstudio.com")) {
      host = `dev.azure.com/${host}`
    }
    this.orgUrl = `https://${host}`
    this.project = conn.externalProjectKey.trim()
    this.authHeader = `Basic ${Buffer.from(`:${conn.apiToken.trim()}`).toString("base64")}`
    this.webhookSecret = conn.webhookSecret ?? null
  }

  private base(scoped = true): string {
    return scoped ? `${this.orgUrl}/${encodeURIComponent(this.project)}` : this.orgUrl
  }

  private async api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await this.raw(url, options)
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let hint = ""
      if (res.status === 401 || res.status === 203) hint = " — Invalid PAT / permission denied"
      if (res.status === 404) hint = " — Not found"
      throw new Error(`Azure DevOps API ${res.status}${hint}${text ? ` — ${text.slice(0, 300)}` : ""}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
  }

  private raw(url: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers as Record<string, string> || {}),
      Authorization: this.authHeader,
    }
    return fetch(url, { ...options, headers })
  }

  // ─── Connection & metadata ──────────────────────────────────────────────────

  async testConnection(): Promise<TestConnectionResult> {
    let projectName = ""
    const errors: string[] = []
    let types: WorkItemType[] = []
    let statuses: WorkItemStatus[] = []
    try {
      const proj = await this.api(`${this.base(false)}/_apis/projects/${encodeURIComponent(this.project)}?${API}`)
      projectName = proj.name || this.project
    } catch (err: any) {
      return { success: false, message: err.message || "Cannot connect to Azure DevOps project", errors: [err.message] }
    }
    try {
      types = await this.getTypes()
    } catch (err: any) {
      errors.push(`Types: ${err.message}`)
    }
    try {
      statuses = await this.getStatuses()
    } catch (err: any) {
      errors.push(`States: ${err.message}`)
    }
    return {
      success: errors.length === 0,
      message: errors.length === 0
        ? `Connected to "${projectName}" — ${types.length} work-item types, ${statuses.length} states`
        : `Connected with warnings: ${errors.join("; ")}`,
      projectName,
      types,
      statuses,
      boards: [],
      canCreate: true,
      errors: errors.length ? errors : undefined,
    }
  }

  async getTypes(): Promise<WorkItemType[]> {
    const data = await this.api(`${this.base()}/_apis/wit/workitemtypes?${API}`)
    return (data.value || []).map((t: any) => ({ id: t.name, name: t.name }))
  }

  async getStatuses(): Promise<WorkItemStatus[]> {
    const types = await this.getTypes()
    const seen = new Map<string, WorkItemStatus>()
    for (const t of types) {
      try {
        const data = await this.api(
          `${this.base()}/_apis/wit/workitemtypes/${encodeURIComponent(t.id)}/states?${API}`
        )
        for (const s of data.value || []) {
          if (seen.has(s.name)) continue
          const category: string = s.category || s.stateCategory || ""
          seen.set(s.name, {
            id: s.name,
            name: s.name,
            isClosed: ["Completed", "Resolved", "Removed"].includes(category),
            isDefault: category === "Proposed",
          })
        }
      } catch {
        // skip a type whose states can't be read
      }
    }
    return Array.from(seen.values())
  }

  // ADO boards need a team scope; for v1 cards appear on the board by their state,
  // so we expose no explicit boards and rely on state mapping.
  async getBoards(): Promise<Board[]> {
    return []
  }
  async getBoardColumns(): Promise<BoardColumn[]> {
    return []
  }

  async getTypeCustomFields(typeId: string, opts: { onlyRequired?: boolean } = {}): Promise<CustomFieldDef[]> {
    try {
      const data = await this.api(
        `${this.base()}/_apis/wit/workitemtypes/${encodeURIComponent(typeId)}/fields?$expand=all&${API}`
      )
      const out: CustomFieldDef[] = []
      for (const f of data.value || []) {
        if (opts.onlyRequired && !f.alwaysRequired) continue
        if (["System.Title", "System.Description", "System.State"].includes(f.referenceName)) continue
        const allowed = (f.allowedValues || []).map((v: any) => ({ id: String(v), title: String(v) }))
        out.push({
          key: f.referenceName,
          name: f.name || f.referenceName,
          required: !!f.alwaysRequired,
          isLink: false,
          isMulti: false,
          isFormattable: false,
          allowedValues: allowed,
        })
      }
      return out
    } catch {
      return []
    }
  }

  async getMembers(): Promise<Member[]> {
    return []
  }

  // ADO priority is an integer 1..4; expose it named so the shared engine's
  // name-based mapping (low/medium/high/critical) resolves to the right number.
  async getPriorities(): Promise<Priority[]> {
    return [
      { id: "1", name: "critical" },
      { id: "2", name: "high" },
      { id: "3", name: "medium" },
      { id: "4", name: "low" },
    ]
  }

  // ─── Work items (JSON Patch) ──────────────────────────────────────────────────

  private patchOps(input: WorkItemInput): any[] {
    const ops: any[] = []
    const add = (path: string, value: any) => ops.push({ op: "add", path, value })
    if (input.title !== undefined) add("/fields/System.Title", input.title)
    if (input.description !== undefined) add("/fields/System.Description", markdownToHtml(input.description))
    if (input.statusId) add("/fields/System.State", input.statusId)
    if (input.priorityId) add("/fields/Microsoft.VSTS.Common.Priority", Number(input.priorityId))
    if (input.assigneeId) add("/fields/System.AssignedTo", input.assigneeId)
    // Derive a tag-safe marker from the description so re-sync lookups (WIQL on
    // System.Tags) find this item reliably — ADO long-text search is unindexed.
    const marker = input.description?.match(/AI-Manual-QA-Tester:(\w+):([\w-]+)/)
    if (marker) add("/fields/System.Tags", `${marker[0].replace(/[:]/g, "-")}`)
    if (input.parentId) {
      add("/relations/-", {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${this.orgUrl}/_apis/wit/workItems/${input.parentId}`,
      })
    }
    for (const [key, val] of Object.entries(input.scalarFields || {})) {
      add(`/fields/${key}`, val && typeof val === "object" && "raw" in (val as any) ? String((val as any).raw) : val)
    }
    for (const [key, val] of Object.entries(input.linkFields || {})) {
      add(`/fields/${key}`, Array.isArray(val) ? val.join("; ") : val)
    }
    return ops
  }

  private mapItem(wi: any): WorkItem {
    const f = wi.fields || {}
    const desc = f["System.Description"] || ""
    return {
      externalId: String(wi.id),
      url: `${this.orgUrl}/${encodeURIComponent(this.project)}/_workitems/edit/${wi.id}`,
      title: f["System.Title"] || "",
      description: htmlToPlainText(desc),
      statusId: f["System.State"] || null,
      statusName: f["System.State"] || null,
      typeId: f["System.WorkItemType"] || null,
      typeName: f["System.WorkItemType"] || null,
      assigneeId: f["System.AssignedTo"]?.uniqueName || f["System.AssignedTo"] || null,
      priorityId: f["Microsoft.VSTS.Common.Priority"] != null ? String(f["Microsoft.VSTS.Common.Priority"]) : null,
      priorityName: null,
      parentId: null,
      fields: {},
      raw: wi,
    }
  }

  async createWorkItem(input: WorkItemInput): Promise<WorkItem> {
    const type = input.typeId || "Bug"
    const ops = this.patchOps(input)
    const wi = await this.api(
      `${this.base()}/_apis/wit/workitems/$${encodeURIComponent(type)}?${API}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json-patch+json" },
        body: JSON.stringify(ops),
      }
    )
    return this.mapItem(wi)
  }

  async updateWorkItem(externalId: string, input: WorkItemInput): Promise<WorkItem> {
    const ops = this.patchOps(input)
    if (ops.length === 0) return this.getWorkItem(externalId)
    const wi = await this.api(`${this.base()}/_apis/wit/workitems/${externalId}?${API}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json-patch+json" },
      body: JSON.stringify(ops),
    })
    return this.mapItem(wi)
  }

  async getWorkItem(externalId: string): Promise<WorkItem> {
    const wi = await this.api(`${this.base()}/_apis/wit/workitems/${externalId}?$expand=all&${API}`)
    return this.mapItem(wi)
  }

  private async wiql(query: string): Promise<string[]> {
    const data = await this.api(`${this.base()}/_apis/wit/wiql?${API}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    return (data.workItems || []).map((w: any) => String(w.id))
  }

  async findByMarker(entityType: EntityType, localId: string): Promise<WorkItem | null> {
    const tag = markerTag(entityType, localId)
    try {
      const ids = await this.wiql(
        `SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = @project AND [System.Tags] CONTAINS '${tag}'`
      )
      return ids.length ? this.getWorkItem(ids[0]) : null
    } catch {
      return null
    }
  }

  async searchByRole(role: "testCase" | "bug" | "userStory" | "epic"): Promise<WorkItem[]> {
    const typeNames =
      role === "epic"
        ? ["Epic", "Feature"]
        : role === "userStory" ? ["User Story", "Feature", "Epic"] : role === "bug" ? ["Bug"] : ["Task", "Test Case"]
    const inClause = typeNames.map((n) => `'${n}'`).join(", ")
    const ids = await this.wiql(
      `SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = @project AND [System.WorkItemType] IN (${inClause}) ORDER BY [System.CreatedDate] DESC`
    )
    const items: WorkItem[] = []
    for (const id of ids.slice(0, 100)) {
      try {
        items.push(await this.getWorkItem(id))
      } catch {
        // skip unreadable item
      }
    }
    return items
  }

  async deleteWorkItem(externalId: string): Promise<boolean> {
    await this.api(`${this.base()}/_apis/wit/workitems/${externalId}?${API}`, { method: "DELETE" })
    return true
  }

  async addComment(externalId: string, markdown: string): Promise<boolean> {
    try {
      await this.api(
        `${this.base()}/_apis/wit/workItems/${externalId}/comments?api-version=7.0-preview.3`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: markdownToHtml(markdown) }),
        }
      )
      return true
    } catch {
      return false
    }
  }

  // ─── Attachments (upload then link) ──────────────────────────────────────────

  async getAttachmentNames(externalId: string): Promise<string[]> {
    try {
      const wi = await this.api(`${this.base()}/_apis/wit/workitems/${externalId}?$expand=relations&${API}`)
      return (wi.relations || [])
        .filter((r: any) => r.rel === "AttachedFile")
        .map((r: any) => r.attributes?.name)
        .filter(Boolean)
    } catch {
      return []
    }
  }

  async uploadAttachment(
    externalId: string,
    fileName: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<boolean> {
    try {
      const up = await this.api(
        `${this.base()}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}&${API}`,
        {
          method: "POST",
          headers: { "Content-Type": contentType || "application/octet-stream" },
          body: new Uint8Array(data),
        }
      )
      if (!up?.url) return false
      await this.api(`${this.base()}/_apis/wit/workitems/${externalId}?${API}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json-patch+json" },
        body: JSON.stringify([
          { op: "add", path: "/relations/-", value: { rel: "AttachedFile", url: up.url, attributes: { name: fileName } } },
        ]),
      })
      return true
    } catch {
      return false
    }
  }

  // Board placement handled via state (System.State) mapping; no explicit columns.
  async boardContains(): Promise<boolean> {
    return false
  }
  async reconcileColumn(): Promise<boolean> {
    return true
  }
  async placeOnColumn(): Promise<boolean> {
    return true
  }

  // ─── Inbound (service hooks) ──────────────────────────────────────────────────

  verifyWebhook(headers: Record<string, string>): boolean {
    if (!this.webhookSecret) return true
    return headers["x-webhook-secret"] === this.webhookSecret
  }

  parseWebhook(payload: any): NormalizedInboundEvent[] {
    const resource = payload?.resource
    const id = resource?.workItemId || resource?.id
    if (!id) return []
    const fields = resource?.fields || {}
    const val = (k: string) => {
      const v = fields[k]
      return v && typeof v === "object" && "newValue" in v ? v.newValue : v
    }
    const state = val("System.State")
    const event: NormalizedInboundEvent = {
      externalId: String(id),
      changed: {},
      occurredAt: new Date(),
      action: payload.eventType === "workitem.deleted" ? "deleted" : "updated",
    }
    if (state) {
      event.changed.statusId = String(state)
      event.changed.statusName = String(state)
    }
    const title = val("System.Title")
    if (title) event.changed.title = String(title)
    const assignee = val("System.AssignedTo")
    if (assignee) event.changed.assigneeId = typeof assignee === "object" ? assignee.uniqueName : String(assignee)
    return [event]
  }

  // ─── URLs ─────────────────────────────────────────────────────────────────────

  workItemUrl(externalId: string): string {
    return `${this.orgUrl}/${encodeURIComponent(this.project)}/_workitems/edit/${externalId}`
  }
  projectUrl(): string {
    return `${this.orgUrl}/${encodeURIComponent(this.project)}`
  }
}
