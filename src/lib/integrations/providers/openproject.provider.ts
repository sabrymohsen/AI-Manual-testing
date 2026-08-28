/**
 * OpenProjectProvider — adapts the existing OpenProjectClient to WorkItemProvider.
 *
 * This is a thin translation layer: the proven HAL+JSON logic in OpenProjectClient
 * is reused verbatim; this class only maps between OpenProject's href-based shapes
 * and the normalized domain model. Behavior for existing OpenProject projects is
 * intentionally unchanged.
 */
import crypto from "crypto"
import {
  OpenProjectClient,
  type OpWorkPackage,
} from "@/lib/integrations/openproject/openproject.client"
import type { ProviderConnection, WorkItemProvider } from "../core/provider"
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

function hrefId(href: string | undefined | null): string | null {
  if (!href) return null
  return href.split("/").pop() || null
}

export class OpenProjectProvider implements WorkItemProvider {
  readonly provider: ProviderId = "OpenProject"
  private client: OpenProjectClient
  private webhookSecret: string | null

  constructor(conn: ProviderConnection) {
    this.client = new OpenProjectClient(conn.baseUrl, conn.externalProjectKey, conn.apiToken)
    this.webhookSecret = conn.webhookSecret || null
  }

  private mapWp(wp: OpWorkPackage): WorkItem {
    const links = wp._links || {}
    return {
      externalId: String(wp.id),
      url: this.client.workPackageUrl(wp.id),
      title: wp.subject,
      description: wp.description?.raw || "",
      statusId: hrefId(links.status?.href),
      statusName: links.status?.title || null,
      typeId: hrefId(links.type?.href),
      typeName: links.type?.title || null,
      assigneeId: hrefId(links.assignee?.href),
      priorityId: hrefId(links.priority?.href),
      priorityName: links.priority?.title || null,
      parentId: hrefId(links.parent?.href),
      fields: {},
      lockVersion: wp.lockVersion,
      raw: wp,
    }
  }

  // ─── Connection & metadata ──────────────────────────────────────────────────

  async testConnection(): Promise<TestConnectionResult> {
    const r = await this.client.testConnection()
    return {
      success: r.success,
      message: r.message,
      projectName: r.projectName,
      types: (r.types || []).map((t) => ({ id: String(t.id), name: t.name })),
      statuses: (r.statuses || []).map((s) => ({
        id: String(s.id),
        name: s.name,
        isClosed: s.isClosed,
        isDefault: s.isDefault,
      })),
      boards: (r.boards || []).map((b) => ({ id: String(b.id), name: b.name, type: b.type as Board["type"] })),
      canCreate: r.canCreateWorkPackages,
      errors: r.errors,
    }
  }

  async getTypes(): Promise<WorkItemType[]> {
    return (await this.client.getTypes()).map((t) => ({ id: String(t.id), name: t.name }))
  }

  async getStatuses(): Promise<WorkItemStatus[]> {
    return (await this.client.getStatuses()).map((s) => ({
      id: String(s.id),
      name: s.name,
      isClosed: s.isClosed,
      isDefault: s.isDefault,
    }))
  }

  async getBoards(): Promise<Board[]> {
    return (await this.client.getBoards()).map((b) => ({
      id: String(b.id),
      name: b.name,
      type: b.type as Board["type"],
    }))
  }

  async getBoardColumns(boardId: string): Promise<BoardColumn[]> {
    const cols = await this.client.getBoardColumns(Number(boardId))
    return cols.map((c) => ({
      id: String(c.widgetId),
      name: c.name,
      columnType: c.columnType,
      attributeId: c.attributeId,
    }))
  }

  async getTypeCustomFields(
    typeId: string,
    opts: { onlyRequired?: boolean } = {}
  ): Promise<CustomFieldDef[]> {
    const fields = await this.client.getTypeCustomFields(typeId, opts)
    return fields.map((f) => ({
      key: f.key,
      name: f.name,
      required: f.required,
      isLink: f.isLink,
      isMulti: f.isMulti,
      isFormattable: f.isFormattable,
      allowedValues: f.allowedValues.map((v) => ({ id: v.href, title: v.title })),
    }))
  }

  async getMembers(): Promise<Member[]> {
    return this.client.getMembers()
  }

  async getPriorities(): Promise<Priority[]> {
    return this.client.getPriorities()
  }

  // ─── Work item payload assembly ───────────────────────────────────────────────

  private buildBody(input: WorkItemInput): { body: Record<string, any>; links: Record<string, any> } {
    const links: Record<string, any> = {}
    if (input.typeId) links.type = { href: this.client.typeHref(input.typeId) }
    // OpenProject assignee/parent are numeric user/WP ids; legacy free-text values
    // are non-numeric and safely ignored (preserves prior behavior).
    if (input.assigneeId && /^\d+$/.test(input.assigneeId)) {
      links.assignee = { href: this.client.assigneeHref(input.assigneeId) }
    }
    if (input.priorityId) links.priority = { href: this.client.priorityHref(input.priorityId) }
    if (input.parentId && /^\d+$/.test(input.parentId)) {
      links.parent = { href: this.client.parentHref(input.parentId) }
    }
    if (input.statusId) links.status = { href: this.client.statusHref(input.statusId) }

    for (const [key, val] of Object.entries(input.linkFields || {})) {
      if (Array.isArray(val)) links[key] = val.map((href) => ({ href }))
      else if (val) links[key] = { href: val }
    }

    const body: Record<string, any> = {}
    if (input.title !== undefined) body.subject = input.title
    if (input.description !== undefined) {
      body.description = { format: "markdown", raw: input.description }
    }
    for (const [key, val] of Object.entries(input.scalarFields || {})) {
      // Formattable envelope {format,raw} is passed through; primitives pass as-is.
      body[key] = val
    }
    return { body, links }
  }

  async createWorkItem(input: WorkItemInput): Promise<WorkItem> {
    const { body, links } = this.buildBody(input)
    // body.subject is set by buildBody when input.title is provided (required on create).
    const wp = await this.client.createWorkPackage({ ...body, _links: links } as any)
    return this.mapWp(wp)
  }

  async updateWorkItem(externalId: string, input: WorkItemInput): Promise<WorkItem> {
    const current = await this.client.getWorkPackage(externalId)
    const { body, links } = this.buildBody(input)
    const payload = { ...body, ...(Object.keys(links).length > 0 ? { _links: links } : {}) }
    const wp = await this.client.updateWorkPackage(externalId, payload, current.lockVersion)
    return this.mapWp(wp)
  }

  async getWorkItem(externalId: string): Promise<WorkItem> {
    return this.mapWp(await this.client.getWorkPackage(externalId))
  }

  async findByMarker(entityType: EntityType, localId: string): Promise<WorkItem | null> {
    const marker = entityMarker(entityType, localId)
    try {
      const results = await this.client.searchWorkPackages([
        { description: { operator: "~", values: [marker] } },
      ])
      return results.length > 0 ? this.mapWp(results[0]) : null
    } catch {
      return null
    }
  }

  /** Story-type name hints used when no explicit type is configured. */
  private static STORY_TYPE_HINTS = ["user story", "story", "feature", "requirement", "epic"]

  /** Container types a module can be imported from, most specific name first. */
  private static EPIC_TYPE_HINTS = ["epic", "feature"]

  async searchByRole(role: "testCase" | "bug" | "userStory" | "epic"): Promise<WorkItem[]> {
    let wps: OpWorkPackage[]
    if (role === "epic") {
      // Epic and Feature only. An instance that has neither yields nothing to
      // import, which is the honest answer — falling back to every work package
      // would offer tasks and bugs as modules.
      const types = await this.client.getTypes().catch(() => [])
      const epicTypes = types.filter((t) =>
        OpenProjectProvider.EPIC_TYPE_HINTS.includes(t.name.toLowerCase())
      )
      if (epicTypes.length === 0) return []
      wps = await this.client.searchWorkPackages([
        { type: { operator: "=", values: epicTypes.map((t) => String(t.id)) } },
      ])
    } else if (role === "userStory") {
      const types = await this.client.getTypes().catch(() => [])
      const storyType = OpenProjectProvider.STORY_TYPE_HINTS
        .map((h) => types.find((t) => t.name.toLowerCase() === h))
        .find(Boolean)
      if (storyType) {
        wps = await this.client.searchWorkPackages([{ type: { operator: "=", values: [String(storyType.id)] } }])
      } else {
        const all = await this.client.searchWorkPackages([])
        wps = all.filter((wp) => {
          const t = (wp._links?.type?.title || "").toLowerCase()
          return OpenProjectProvider.STORY_TYPE_HINTS.some((h) => t === h)
        })
      }
    } else if (role === "bug") {
      // Filter to the Bug type. Returning every work package here would be
      // actively dangerous: callers that act on the result (the tracker rebuild
      // deletes them) would hit tasks, features and stories too.
      const types = await this.client.getTypes().catch(() => [])
      const bugType = types.find((t) => /^(bug|defect)$/i.test(t.name))
      if (bugType) {
        wps = await this.client.searchWorkPackages([{ type: { operator: "=", values: [String(bugType.id)] } }])
      } else {
        const all = await this.client.searchWorkPackages([])
        wps = all.filter((wp) => /bug|defect/i.test(wp._links?.type?.title || ""))
      }
    } else {
      wps = await this.client.searchWorkPackages([])
    }
    return wps.map((wp) => this.mapWp(wp))
  }

  async deleteWorkItem(externalId: string): Promise<boolean> {
    return this.client.deleteWorkPackage(externalId)
  }

  async addComment(externalId: string, markdown: string): Promise<boolean> {
    return this.client.addWorkPackageComment(externalId, markdown)
  }

  // ─── Attachments ──────────────────────────────────────────────────────────────

  getAttachmentNames(externalId: string): Promise<string[]> {
    return this.client.getWorkPackageAttachmentNames(externalId)
  }

  uploadAttachment(
    externalId: string,
    fileName: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<boolean> {
    return this.client.uploadWorkPackageAttachment(externalId, fileName, data, contentType)
  }

  // ─── Board placement ──────────────────────────────────────────────────────────

  boardContains(boardId: string, externalId: string): Promise<boolean> {
    return this.client.boardContainsWorkPackage(Number(boardId), externalId)
  }

  /**
   * Which board columns list this card in their widget id filter — the side of
   * the board this app writes. One read of the grid; no per-column queries.
   *
   * Deliberately does NOT consult each column's own query, even though
   * board-diagnostics does. The query is what OpenProject's board UI updates
   * when someone drags a card, so filter-vs-query disagreement is the normal
   * signature of a user drag we have not caught up with. Treating that as
   * breakage would drag the card straight back out from under them. Two
   * *filters* holding the same id, by contrast, is only ever our own bug.
   */
  async getCardColumns(boardId: string, externalId: string): Promise<string[]> {
    return this.client.getWidgetIdsContaining(Number(boardId), externalId)
  }

  /**
   * The column whose own OpenProject query returns this card — i.e. where the
   * board UI shows it after someone dragged it there.
   *
   * Costs one query read per column, so it is only worth calling when the
   * cheaper filter-side checks have already come back clean. Status/version/
   * assignee columns are skipped: their position follows a work package field
   * that the normal update path already writes, so the query adds nothing.
   */
  async getTrackerColumn(boardId: string, externalId: string): Promise<string | null> {
    const cols = await this.client.getBoardColumns(Number(boardId))
    const target = String(externalId)
    for (const c of cols) {
      if (c.columnType !== "basic" || !c.queryId) continue
      const queryIds = await this.client.getQueryResultIds(c.queryId)
      if (queryIds.includes(target)) return String(c.widgetId)
    }
    return null
  }

  /**
   * Builds the hidden query behind each column, then the board that hosts them.
   * If the board create fails the queries are deleted again — otherwise every
   * failed attempt leaves orphaned hidden queries in the OpenProject project.
   */
  async createStatusBoard(
    name: string,
    columns: Array<{ name: string; statusId: string }>,
    opts: { typeId?: string | null } = {}
  ): Promise<{
    boardId: string
    url: string
    columns: Array<{ name: string; statusId: string; queryId: string }>
  }> {
    const typeId = opts.typeId ?? null
    const built: Array<{ name: string; statusId: string; queryId: string }> = []

    for (const col of columns) {
      const queryId = await this.client.createBoardColumnQuery(col.name, col.statusId, typeId)
      built.push({ name: col.name, statusId: col.statusId, queryId })
    }

    let boardId: number
    try {
      boardId = await this.client.createBoard(
        name,
        built.map((c) => ({ name: c.name, queryId: c.queryId, statusId: c.statusId, typeId }))
      )
    } catch (err) {
      await Promise.all(built.map((c) => this.client.deleteQuery(c.queryId)))
      throw err
    }

    return { boardId: String(boardId), url: this.client.boardUrl(boardId), columns: built }
  }

  private async setAttribute(externalId: string, column: BoardColumn): Promise<boolean> {
    if (!column.attributeId) return false
    const links: Record<string, { href: string }> = {}
    if (column.columnType === "version") links.version = { href: this.client.versionHref(column.attributeId) }
    else if (column.columnType === "assignee") links.assignee = { href: this.client.assigneeHref(column.attributeId) }
    else if (column.columnType === "status") links.status = { href: this.client.statusHref(column.attributeId) }
    else return false
    const wp = await this.client.getWorkPackage(externalId)
    await this.client.updateWorkPackage(externalId, { _links: links }, wp.lockVersion)
    return true
  }

  /**
   * Moves a card on a STATUS board by transitioning the work package's status —
   * a status column has no card list to write to, the board renders each work
   * package under whatever status it currently holds.
   *
   * The type's workflow decides which transitions are legal. We ask first, so a
   * move the workflow forbids fails with a message naming the statuses that are
   * actually reachable instead of OpenProject's bare "can't be blank"-style 422.
   * When the allowed set can't be read we attempt the transition anyway and let
   * the API be the judge.
   */
  private async setStatusColumn(column: BoardColumn, externalId: string): Promise<boolean> {
    if (!column.attributeId) return false

    const allowed = await this.client.getAllowedStatusIds(externalId)
    if (allowed && !allowed.includes(String(column.attributeId))) {
      const names = await this.client.getStatusNames()
      const target = names.get(String(column.attributeId)) || `status ${column.attributeId}`
      const reachable = allowed.map((id) => names.get(id) || id).join(", ")
      throw new Error(
        `Workflow does not allow moving #${externalId} to "${target}". ` +
          `Allowed from its current status: ${reachable || "(none)"}.`
      )
    }
    return this.setAttribute(externalId, column)
  }

  async reconcileColumn(boardId: string, column: BoardColumn, externalId: string): Promise<boolean> {
    if (column.columnType === "basic") {
      return this.client.setBoardCardColumn(Number(boardId), Number(column.id), externalId)
    }
    if (column.columnType === "status") {
      return this.setStatusColumn(column, externalId)
    }
    if (column.columnType === "version" || column.columnType === "assignee") {
      return this.setAttribute(externalId, column)
    }
    return true
  }

  async placeOnColumn(boardId: string, column: BoardColumn, externalId: string): Promise<boolean> {
    if (column.columnType === "basic") {
      return this.client.addWorkPackageToBoardWidget(Number(boardId), Number(column.id), externalId)
    }
    if (column.columnType === "status") {
      return this.setStatusColumn(column, externalId)
    }
    if (column.columnType === "version" || column.columnType === "assignee") {
      return this.setAttribute(externalId, column)
    }
    return true
  }

  // ─── Inbound: OpenProject has no native webhooks; reconciled via polling. ──────

  // ─── Inbound webhooks ─────────────────────────────────────────────────────────
  //
  // These returned `false` / `[]` before, which meant the callback URL the
  // integration screen hands out rejected every delivery OpenProject made: the
  // only inbound path that actually worked was the two-minute poll, so a status
  // change over there took minutes to show up here, if the poll was running at
  // all. Both halves are implemented below; polling stays as the safety net.

  /**
   * OpenProject can authenticate a webhook two ways, and which one you get
   * depends on how the admin filled in the form, so both are accepted:
   *
   *   - a signature header, HMAC-SHA1 of the raw body under the webhook secret;
   *   - the secret carried on the callback URL (?secret=…), which the webhook
   *     route normalizes into x-webhook-secret.
   *
   * With no secret configured there is nothing to check — same posture as the
   * other providers, and the endpoint still requires a matching integration.
   */
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    if (!this.webhookSecret) return true

    if (headers["x-webhook-secret"] === this.webhookSecret) return true

    const signature = headers["x-op-signature"] || headers["x-hub-signature"]
    if (!signature) return false

    const expected =
      "sha1=" +
      crypto.createHmac("sha1", this.webhookSecret).update(rawBody, "utf8").digest("hex")

    // Constant-time compare; length differences are rejected before comparing,
    // because timingSafeEqual throws on mismatched lengths.
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  /**
   * OpenProject posts `{ action: "work_package:updated", work_package: {…} }`,
   * where the work package is the same HAL shape the REST API returns — status,
   * assignee and priority as _links with an href and a human title.
   *
   * Only work-package actions are parsed. Project, time-entry and attachment
   * events carry nothing this app maps to a local record.
   */
  parseWebhook(payload: any): NormalizedInboundEvent[] {
    const action = String(payload?.action || "")
    if (!action.startsWith("work_package")) return []

    const wp = payload?.work_package
    if (!wp?.id) return []

    const links = wp._links || {}
    const event: NormalizedInboundEvent = {
      externalId: String(wp.id),
      changed: {},
      // OpenProject sends the work package's updatedAt, which is the moment the
      // change happened — the right timestamp for last-writer-wins.
      occurredAt: wp.updatedAt ? new Date(wp.updatedAt) : new Date(),
      action: action.endsWith(":deleted") ? "deleted" : "updated",
    }

    const statusId = hrefId(links.status?.href)
    if (statusId) event.changed.statusId = statusId
    if (links.status?.title) event.changed.statusName = links.status.title

    if (wp.subject) event.changed.title = wp.subject
    const assigneeId = hrefId(links.assignee?.href)
    if (assigneeId) event.changed.assigneeId = assigneeId
    const priorityId = hrefId(links.priority?.href)
    if (priorityId) event.changed.priorityId = priorityId

    return [event]
  }

  // ─── URL helpers ──────────────────────────────────────────────────────────────

  workItemUrl(externalId: string): string {
    return this.client.workPackageUrl(externalId)
  }
  projectUrl(): string {
    return this.client.projectUrl
  }
}
