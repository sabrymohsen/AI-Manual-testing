/**
 * JiraProvider — Jira Cloud REST v3 (+ Agile v1.0) implementation of WorkItemProvider.
 *
 * Auth: Basic base64(email:apiToken). Rich text uses ADF (see ./adf). Status
 * changes go through the transition API (Jira status is not a settable field).
 * Board columns map to their underlying statuses, so placing a card = transition.
 * Inbound webhooks are verified by a shared secret carried in the callback URL
 * query (Jira Cloud webhooks don't HMAC-sign), and parsed from the changelog.
 */
import { BaseProvider, type ProviderConnection } from "../core/provider"
import { markdownToAdf, adfToPlainText } from "./adf"
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

export class JiraProvider extends BaseProvider {
  readonly provider: ProviderId = "Jira"
  private baseUrl: string
  private projectKey: string
  private authHeader: string
  private webhookSecret: string | null

  constructor(conn: ProviderConnection) {
    super()
    const host = conn.baseUrl.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
    this.baseUrl = `https://${host}`
    this.projectKey = conn.externalProjectKey.trim()
    this.authHeader = `Basic ${Buffer.from(`${conn.username.trim()}:${conn.apiToken.trim()}`).toString("base64")}`
    this.webhookSecret = conn.webhookSecret ?? null
  }

  // ─── HTTP ─────────────────────────────────────────────────────────────────────

  private async api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await this.rawApi(path, options)
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let hint = ""
      if (res.status === 401) hint = " — Invalid email/API token"
      if (res.status === 403) hint = " — Permission denied"
      if (res.status === 404) hint = " — Not found"
      throw new Error(`Jira API ${res.status}${hint}${text ? ` — ${text.slice(0, 300)}` : ""}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
  }

  private rawApi(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers as Record<string, string> || {}),
      Authorization: this.authHeader,
    }
    return fetch(`${this.baseUrl}${path}`, { ...options, headers })
  }

  private jsonBody(body: unknown): RequestInit {
    return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  }

  // ─── Connection & metadata ──────────────────────────────────────────────────

  async testConnection(): Promise<TestConnectionResult> {
    const errors: string[] = []
    let projectName = ""
    let types: WorkItemType[] = []
    let statuses: WorkItemStatus[] = []
    let boards: Board[] = []
    try {
      const proj = await this.api(`/rest/api/3/project/${encodeURIComponent(this.projectKey)}`)
      projectName = proj.name || proj.key || this.projectKey
      types = (proj.issueTypes || []).map((t: any) => ({ id: String(t.id), name: t.name }))
    } catch (err: any) {
      return { success: false, message: err.message || "Cannot connect to Jira project", errors: [err.message] }
    }
    try {
      statuses = await this.getStatuses()
    } catch (err: any) {
      errors.push(`Statuses: ${err.message}`)
    }
    try {
      boards = await this.getBoards()
    } catch {
      // Agile boards optional (some projects have none)
    }
    return {
      success: errors.length === 0,
      message: errors.length === 0
        ? `Connected to "${projectName}" — ${types.length} issue types, ${statuses.length} statuses`
        : `Connected with warnings: ${errors.join("; ")}`,
      projectName,
      types,
      statuses,
      boards,
      canCreate: true,
      errors: errors.length ? errors : undefined,
    }
  }

  async getTypes(): Promise<WorkItemType[]> {
    const proj = await this.api(`/rest/api/3/project/${encodeURIComponent(this.projectKey)}`)
    return (proj.issueTypes || []).map((t: any) => ({ id: String(t.id), name: t.name }))
  }

  async getStatuses(): Promise<WorkItemStatus[]> {
    // Project statuses come grouped per issue type; flatten to a unique set.
    const groups: any[] = await this.api(`/rest/api/3/project/${encodeURIComponent(this.projectKey)}/statuses`)
    const seen = new Map<string, WorkItemStatus>()
    for (const g of groups || []) {
      for (const s of g.statuses || []) {
        const id = String(s.id)
        if (seen.has(id)) continue
        seen.set(id, {
          id,
          name: s.name,
          isClosed: s.statusCategory?.key === "done",
          isDefault: s.statusCategory?.key === "new",
        })
      }
    }
    return Array.from(seen.values())
  }

  async getBoards(): Promise<Board[]> {
    const data = await this.api(`/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(this.projectKey)}&maxResults=50`)
    return (data.values || []).map((b: any) => ({
      id: String(b.id),
      name: b.name,
      type: (b.type === "kanban" || b.type === "scrum" ? "status" : "status") as Board["type"],
    }))
  }

  async getBoardColumns(boardId: string): Promise<BoardColumn[]> {
    const cfg = await this.api(`/rest/agile/1.0/board/${boardId}/configuration`)
    const cols: any[] = cfg?.columnConfig?.columns || []
    return cols.map((c: any) => ({
      id: c.name, // Jira columns have no stable id; the name is the placement key
      name: c.name,
      columnType: "status" as const,
      // Placing a card into a column = transitioning it to one of the column's statuses.
      attributeId: c.statuses?.[0]?.id ? String(c.statuses[0].id) : null,
    }))
  }

  async getTypeCustomFields(typeId: string, opts: { onlyRequired?: boolean } = {}): Promise<CustomFieldDef[]> {
    const meta = await this.api(
      `/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(this.projectKey)}` +
        `&issuetypeIds=${encodeURIComponent(typeId)}&expand=projects.issuetypes.fields`
    )
    const fields = meta?.projects?.[0]?.issuetypes?.[0]?.fields || {}
    const out: CustomFieldDef[] = []
    for (const [key, raw] of Object.entries<any>(fields)) {
      if (!key.startsWith("customfield_")) continue
      if (opts.onlyRequired && !raw.required) continue
      const schemaType: string = raw.schema?.type || "string"
      const isMulti = schemaType === "array"
      const allowed = (raw.allowedValues || []).map((v: any) => ({
        id: String(v.id ?? v.value ?? v.name ?? ""),
        title: v.value || v.name || v.label || "",
      }))
      out.push({
        key,
        name: raw.name || key,
        required: !!raw.required,
        isLink: allowed.length > 0,
        isMulti,
        isFormattable: raw.schema?.custom?.includes("textarea") || false,
        allowedValues: allowed,
      })
    }
    return out
  }

  async getMembers(): Promise<Member[]> {
    const users: any[] = await this.api(
      `/rest/api/3/user/assignable/search?project=${encodeURIComponent(this.projectKey)}&maxResults=100`
    )
    return (users || [])
      .filter((u) => u.accountType === "atlassian" || !u.accountType)
      .map((u) => ({ id: u.accountId, name: u.displayName || u.emailAddress || u.accountId }))
  }

  async getPriorities(): Promise<Priority[]> {
    const list: any[] = await this.api(`/rest/api/3/priority`)
    return (list || []).map((p) => ({ id: String(p.id), name: p.name }))
  }

  // ─── Work items ───────────────────────────────────────────────────────────────

  private buildFields(input: WorkItemInput, forCreate: boolean): Record<string, any> {
    const fields: Record<string, any> = {}
    if (forCreate) fields.project = { key: this.projectKey }
    if (input.title !== undefined) fields.summary = input.title
    if (input.description !== undefined) fields.description = markdownToAdf(input.description)
    if (forCreate && input.typeId) fields.issuetype = { id: input.typeId }
    if (input.priorityId) fields.priority = { id: input.priorityId }
    if (input.assigneeId) fields.assignee = { id: input.assigneeId }
    if (input.parentId) fields.parent = { key: input.parentId }
    for (const [key, val] of Object.entries(input.linkFields || {})) {
      fields[key] = Array.isArray(val) ? val.map((id) => ({ id })) : { id: val }
    }
    for (const [key, val] of Object.entries(input.scalarFields || {})) {
      fields[key] = val && typeof val === "object" && "raw" in (val as any) ? String((val as any).raw) : val
    }
    return fields
  }

  private mapIssue(issue: any): WorkItem {
    const f = issue.fields || {}
    return {
      externalId: issue.key,
      url: `${this.baseUrl}/browse/${issue.key}`,
      title: f.summary || "",
      description: adfToPlainText(f.description),
      statusId: f.status?.id ? String(f.status.id) : null,
      statusName: f.status?.name || null,
      typeId: f.issuetype?.id ? String(f.issuetype.id) : null,
      typeName: f.issuetype?.name || null,
      assigneeId: f.assignee?.accountId || null,
      priorityId: f.priority?.id ? String(f.priority.id) : null,
      priorityName: f.priority?.name || null,
      parentId: f.parent?.key || null,
      fields: {},
      raw: issue,
    }
  }

  async createWorkItem(input: WorkItemInput): Promise<WorkItem> {
    const created = await this.api(`/rest/api/3/issue`, {
      method: "POST",
      ...this.jsonBody({ fields: this.buildFields(input, true) }),
    })
    return this.getWorkItem(created.key)
  }

  async updateWorkItem(externalId: string, input: WorkItemInput): Promise<WorkItem> {
    const fields = this.buildFields(input, false)
    if (Object.keys(fields).length > 0) {
      await this.api(`/rest/api/3/issue/${encodeURIComponent(externalId)}`, {
        method: "PUT",
        ...this.jsonBody({ fields }),
      })
    }
    // Status is not a field — transition separately when requested.
    if (input.statusId) await this.transitionToStatus(externalId, input.statusId)
    return this.getWorkItem(externalId)
  }

  private async transitionToStatus(issueKey: string, statusId: string): Promise<boolean> {
    try {
      const data = await this.api(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`)
      const t = (data.transitions || []).find((tr: any) => String(tr.to?.id) === String(statusId))
      if (!t) return false
      await this.api(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
        method: "POST",
        ...this.jsonBody({ transition: { id: t.id } }),
      })
      return true
    } catch {
      return false
    }
  }

  async getWorkItem(externalId: string): Promise<WorkItem> {
    const issue = await this.api(
      `/rest/api/3/issue/${encodeURIComponent(externalId)}?fields=summary,description,status,issuetype,assignee,priority,parent,attachment`
    )
    return this.mapIssue(issue)
  }

  async findByMarker(entityType: EntityType, localId: string): Promise<WorkItem | null> {
    const marker = entityMarker(entityType, localId)
    try {
      const jql = `project = "${this.projectKey}" AND text ~ "${marker}"`
      const data = await this.api(`/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=1&fields=summary,description,status,issuetype,assignee,priority,parent`)
      const issue = data.issues?.[0]
      return issue ? this.mapIssue(issue) : null
    } catch {
      return null
    }
  }

  async searchByRole(role: "testCase" | "bug" | "userStory" | "epic"): Promise<WorkItem[]> {
    const typeNames =
      role === "epic"
        ? ["Epic", "Feature"]
        : role === "userStory" ? ["Story", "User Story", "Epic"] : role === "bug" ? ["Bug"] : ["Task", "Test"]
    const inClause = typeNames.map((n) => `"${n}"`).join(", ")
    const jql = `project = "${this.projectKey}" AND issuetype in (${inClause}) ORDER BY created DESC`
    const data = await this.api(
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,description,status,issuetype,assignee,priority,parent`
    )
    return (data.issues || []).map((i: any) => this.mapIssue(i))
  }

  async deleteWorkItem(externalId: string): Promise<boolean> {
    await this.api(`/rest/api/3/issue/${encodeURIComponent(externalId)}`, { method: "DELETE" })
    return true
  }

  async addComment(externalId: string, markdown: string): Promise<boolean> {
    try {
      await this.api(`/rest/api/3/issue/${encodeURIComponent(externalId)}/comment`, {
        method: "POST",
        ...this.jsonBody({ body: markdownToAdf(markdown) }),
      })
      return true
    } catch {
      return false
    }
  }

  // ─── Attachments ──────────────────────────────────────────────────────────────

  async getAttachmentNames(externalId: string): Promise<string[]> {
    try {
      const issue = await this.api(`/rest/api/3/issue/${encodeURIComponent(externalId)}?fields=attachment`)
      return (issue.fields?.attachment || []).map((a: any) => a.filename).filter(Boolean)
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
    const form = new FormData()
    form.append("file", new Blob([new Uint8Array(data)], { type: contentType }), fileName)
    const res = await this.rawApi(`/rest/api/3/issue/${encodeURIComponent(externalId)}/attachments`, {
      method: "POST",
      headers: { "X-Atlassian-Token": "no-check" },
      body: form,
    })
    return res.ok
  }

  // ─── Board placement (via transitions) ────────────────────────────────────────

  async boardContains(_boardId: string, _externalId: string): Promise<boolean> {
    // Jira columns are status-typed; the engine only calls this for basic columns.
    return false
  }

  async reconcileColumn(_boardId: string, column: BoardColumn, externalId: string): Promise<boolean> {
    if (!column.attributeId) return false
    return this.transitionToStatus(externalId, column.attributeId)
  }

  async placeOnColumn(_boardId: string, column: BoardColumn, externalId: string): Promise<boolean> {
    if (!column.attributeId) return false
    return this.transitionToStatus(externalId, column.attributeId)
  }

  // ─── Inbound ────────────────────────────────────────────────────────────────

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    // Jira Cloud webhooks are not HMAC-signed; we gate on a shared secret passed
    // as ?secret= on the registered callback URL (surfaced here via header).
    if (!this.webhookSecret) return true
    return headers["x-webhook-secret"] === this.webhookSecret
  }

  parseWebhook(payload: any): NormalizedInboundEvent[] {
    const issue = payload?.issue
    if (!issue?.key) return []
    const event: NormalizedInboundEvent = {
      externalId: issue.key,
      changed: {},
      occurredAt: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      action: payload.webhookEvent === "jira:issue_deleted" ? "deleted" : "updated",
    }
    const f = issue.fields || {}
    if (f.status) {
      event.changed.statusId = f.status.id ? String(f.status.id) : undefined
      event.changed.statusName = f.status.name
    }
    if (f.assignee) event.changed.assigneeId = f.assignee.accountId
    if (f.summary) event.changed.title = f.summary
    if (f.priority) event.changed.priorityId = f.priority.id ? String(f.priority.id) : undefined
    return [event]
  }

  // ─── URLs ─────────────────────────────────────────────────────────────────────

  workItemUrl(externalId: string): string {
    return `${this.baseUrl}/browse/${externalId}`
  }
  projectUrl(): string {
    return `${this.baseUrl}/browse/${this.projectKey}`
  }
}
