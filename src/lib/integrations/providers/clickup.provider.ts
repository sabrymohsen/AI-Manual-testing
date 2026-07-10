/**
 * ClickUpProvider — ClickUp API v2 implementation of WorkItemProvider.
 *
 * Auth: personal token in the Authorization header. Tasks live in a single List
 * (externalProjectKey = list id). The List's statuses are exposed as one board's
 * columns, so placing a card = setting its status. Priority maps to ClickUp's
 * 1..4 scale. Marker lookups scan the list (ClickUp has no server-side text
 * search). Webhooks are HMAC-SHA256 verified with the registered secret.
 */
import crypto from "node:crypto"
import { BaseProvider, type ProviderConnection } from "../core/provider"
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

const API_BASE = "https://api.clickup.com/api/v2"

export class ClickUpProvider extends BaseProvider {
  readonly provider: ProviderId = "ClickUp"
  private listId: string
  private token: string
  private webhookSecret: string | null

  constructor(conn: ProviderConnection) {
    super()
    this.listId = conn.externalProjectKey.trim()
    this.token = conn.apiToken.trim()
    this.webhookSecret = conn.webhookSecret ?? null
  }

  private async api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await this.raw(path, options)
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let hint = ""
      if (res.status === 401) hint = " — Invalid API token"
      if (res.status === 404) hint = " — Not found"
      throw new Error(`ClickUp API ${res.status}${hint}${text ? ` — ${text.slice(0, 300)}` : ""}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
  }

  private raw(path: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers as Record<string, string> || {}),
      Authorization: this.token,
    }
    return fetch(`${API_BASE}${path}`, { ...options, headers })
  }

  private json(body: unknown): RequestInit {
    return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  }

  // ─── Connection & metadata ──────────────────────────────────────────────────

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const list = await this.api(`/list/${encodeURIComponent(this.listId)}`)
      const statuses = this.mapStatuses(list.statuses || [])
      return {
        success: true,
        message: `Connected to list "${list.name}" — ${statuses.length} statuses`,
        projectName: list.name,
        types: [{ id: "task", name: "Task" }],
        statuses,
        boards: [{ id: this.listId, name: list.name || "Board", type: "status" }],
        canCreate: true,
      }
    } catch (err: any) {
      return { success: false, message: err.message || "Cannot connect to ClickUp list", errors: [err.message] }
    }
  }

  async getTypes(): Promise<WorkItemType[]> {
    return [{ id: "task", name: "Task" }]
  }

  private mapStatuses(raw: any[]): WorkItemStatus[] {
    return (raw || []).map((s: any) => ({
      id: s.status,
      name: s.status,
      isClosed: s.type === "closed" || s.type === "done",
      isDefault: s.orderindex === 0 || s.type === "open",
    }))
  }

  async getStatuses(): Promise<WorkItemStatus[]> {
    const list = await this.api(`/list/${encodeURIComponent(this.listId)}`)
    return this.mapStatuses(list.statuses || [])
  }

  async getBoards(): Promise<Board[]> {
    const list = await this.api(`/list/${encodeURIComponent(this.listId)}`)
    return [{ id: this.listId, name: list.name || "Board", type: "status" }]
  }

  async getBoardColumns(): Promise<BoardColumn[]> {
    const statuses = await this.getStatuses()
    return statuses.map((s) => ({
      id: s.id,
      name: s.name,
      columnType: "status" as const,
      attributeId: s.id, // ClickUp status name is the placement key
    }))
  }

  async getTypeCustomFields(_typeId: string, opts: { onlyRequired?: boolean } = {}): Promise<CustomFieldDef[]> {
    try {
      const data = await this.api(`/list/${encodeURIComponent(this.listId)}/field`)
      const out: CustomFieldDef[] = []
      for (const f of data.fields || []) {
        if (opts.onlyRequired && !f.required) continue
        const options = f.type_config?.options || []
        out.push({
          key: f.id,
          name: f.name,
          required: !!f.required,
          isLink: options.length > 0,
          isMulti: f.type === "labels",
          isFormattable: f.type === "text",
          allowedValues: options.map((o: any) => ({ id: String(o.id ?? o.orderindex), title: o.name || o.label || "" })),
        })
      }
      return out
    } catch {
      return []
    }
  }

  async getMembers(): Promise<Member[]> {
    try {
      const data = await this.api(`/list/${encodeURIComponent(this.listId)}/member`)
      return (data.members || []).map((m: any) => ({ id: String(m.id), name: m.username || m.email || String(m.id) }))
    } catch {
      return []
    }
  }

  // ClickUp priority: 1=Urgent 2=High 3=Normal 4=Low. Named so the shared engine's
  // name-based mapping resolves correctly.
  async getPriorities(): Promise<Priority[]> {
    return [
      { id: "1", name: "urgent" },
      { id: "2", name: "high" },
      { id: "3", name: "normal" },
      { id: "4", name: "low" },
    ]
  }

  // ─── Work items (tasks) ───────────────────────────────────────────────────────

  private buildBody(input: WorkItemInput): Record<string, any> {
    const body: Record<string, any> = {}
    if (input.title !== undefined) body.name = input.title
    if (input.description !== undefined) body.markdown_content = input.description
    if (input.statusId) body.status = input.statusId
    if (input.priorityId) body.priority = Number(input.priorityId)
    if (input.assigneeId) body.assignees = [Number(input.assigneeId)].filter((n) => !Number.isNaN(n))
    if (input.parentId) body.parent = input.parentId
    return body
  }

  private mapTask(t: any): WorkItem {
    return {
      externalId: String(t.id),
      url: t.url || `https://app.clickup.com/t/${t.id}`,
      title: t.name || "",
      description: t.description || t.text_content || "",
      statusId: t.status?.status || null,
      statusName: t.status?.status || null,
      typeId: "task",
      typeName: "Task",
      assigneeId: t.assignees?.[0]?.id ? String(t.assignees[0].id) : null,
      priorityId: t.priority?.id ? String(t.priority.id) : null,
      priorityName: t.priority?.priority || null,
      parentId: t.parent || null,
      fields: {},
      raw: t,
    }
  }

  async createWorkItem(input: WorkItemInput): Promise<WorkItem> {
    const t = await this.api(`/list/${encodeURIComponent(this.listId)}/task`, {
      method: "POST",
      ...this.json(this.buildBody(input)),
    })
    return this.mapTask(t)
  }

  async updateWorkItem(externalId: string, input: WorkItemInput): Promise<WorkItem> {
    const body = this.buildBody(input)
    // assignees on update use the add/rem shape
    if (body.assignees) {
      body.assignees = { add: body.assignees }
    }
    const t = await this.api(`/task/${encodeURIComponent(externalId)}`, {
      method: "PUT",
      ...this.json(body),
    })
    return this.mapTask(t)
  }

  async getWorkItem(externalId: string): Promise<WorkItem> {
    return this.mapTask(await this.api(`/task/${encodeURIComponent(externalId)}`))
  }

  private async listTasks(): Promise<any[]> {
    const all: any[] = []
    for (let page = 0; page < 5; page++) {
      const data = await this.api(
        `/list/${encodeURIComponent(this.listId)}/task?include_closed=true&subtasks=true&page=${page}`
      )
      const tasks = data.tasks || []
      all.push(...tasks)
      if (tasks.length < 100) break
    }
    return all
  }

  async findByMarker(entityType: EntityType, localId: string): Promise<WorkItem | null> {
    const marker = entityMarker(entityType, localId)
    try {
      const tasks = await this.listTasks()
      const hit = tasks.find((t) => (t.description || t.text_content || "").includes(marker))
      return hit ? this.mapTask(hit) : null
    } catch {
      return null
    }
  }

  async searchByRole(_role: "testCase" | "bug" | "userStory"): Promise<WorkItem[]> {
    // ClickUp has no work-item type dimension; return the list's tasks.
    const tasks = await this.listTasks()
    return tasks.map((t) => this.mapTask(t))
  }

  async deleteWorkItem(externalId: string): Promise<boolean> {
    await this.api(`/task/${encodeURIComponent(externalId)}`, { method: "DELETE" })
    return true
  }

  async addComment(externalId: string, markdown: string): Promise<boolean> {
    try {
      await this.api(`/task/${encodeURIComponent(externalId)}/comment`, {
        method: "POST",
        ...this.json({ comment_text: markdown }),
      })
      return true
    } catch {
      return false
    }
  }

  // ─── Attachments ──────────────────────────────────────────────────────────────

  async getAttachmentNames(externalId: string): Promise<string[]> {
    try {
      const t = await this.api(`/task/${encodeURIComponent(externalId)}?include_subtasks=false`)
      return (t.attachments || []).map((a: any) => a.title || a.name).filter(Boolean)
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
    form.append("attachment", new Blob([new Uint8Array(data)], { type: contentType }), fileName)
    const res = await this.raw(`/task/${encodeURIComponent(externalId)}/attachment`, {
      method: "POST",
      body: form,
    })
    return res.ok
  }

  // ─── Board placement (status) ────────────────────────────────────────────────

  async boardContains(): Promise<boolean> {
    return false
  }
  async reconcileColumn(_boardId: string, column: BoardColumn, externalId: string): Promise<boolean> {
    if (!column.attributeId) return false
    try {
      await this.api(`/task/${encodeURIComponent(externalId)}`, {
        method: "PUT",
        ...this.json({ status: column.attributeId }),
      })
      return true
    } catch {
      return false
    }
  }
  placeOnColumn(boardId: string, column: BoardColumn, externalId: string): Promise<boolean> {
    return this.reconcileColumn(boardId, column, externalId)
  }

  // ─── Inbound (HMAC-signed webhooks) ──────────────────────────────────────────

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    if (!this.webhookSecret) return true
    const sig = headers["x-signature"]
    if (!sig) return false
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex")
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    } catch {
      return false
    }
  }

  parseWebhook(payload: any): NormalizedInboundEvent[] {
    const taskId = payload?.task_id
    if (!taskId) return []
    const event: NormalizedInboundEvent = {
      externalId: String(taskId),
      changed: {},
      occurredAt: new Date(),
      action: payload.event === "taskDeleted" ? "deleted" : "updated",
    }
    for (const h of payload.history_items || []) {
      if (h.field === "status" && h.after) {
        event.changed.statusId = h.after.status || h.after
        event.changed.statusName = h.after.status || h.after
      }
      if (h.field === "name" && h.after) event.changed.title = String(h.after)
      if (h.field === "assignee" && h.after?.id) event.changed.assigneeId = String(h.after.id)
      if (h.field === "priority" && h.after?.id) event.changed.priorityId = String(h.after.id)
    }
    return [event]
  }

  // ─── URLs ─────────────────────────────────────────────────────────────────────

  workItemUrl(externalId: string): string {
    return `https://app.clickup.com/t/${externalId}`
  }
  projectUrl(): string {
    return `https://app.clickup.com/`
  }
}
