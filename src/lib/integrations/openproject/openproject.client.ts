/**
 * OpenProject API Client
 *
 * Dedicated client for all OpenProject HAL+JSON API interactions.
 * Uses Basic Auth with apikey:{token} as primary auth method.
 * Never logs the API token.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OpType {
  id: number
  name: string
  href: string
}

export interface OpStatus {
  id: number
  name: string
  href: string
  isClosed: boolean
  isDefault: boolean
}

export interface OpVersion {
  id: number
  name: string
  href: string
  status: string
}

export interface OpBoard {
  id: number
  name: string
  type: string   // "status" | "version" | "assignee" | "basic"
  href: string
}

export interface OpUser {
  id: number
  name: string
  login: string
  href: string
}

export interface OpCustomField {
  key: string          // schema key, e.g. "customField6"
  name: string         // human label, e.g. "Found in Build"
  required: boolean
  fieldType: string    // raw schema type, e.g. "String", "Formattable", "[]CustomOption"
  isMulti: boolean     // true for "[]…" multi-value fields
  isLink: boolean      // value(s) belong under _links (dropdown / references)
  isFormattable: boolean
  allowedValues: Array<{ href: string; title: string }>
}

export interface OpWorkPackage {
  id: number
  lockVersion: number
  subject: string
  description?: { format: string; raw: string; html?: string }
  _links: Record<string, { href: string; title?: string } | null>
  _type: string
  [key: string]: any
}

export interface OpCreateWPData {
  subject: string
  description?: { format: string; raw: string }
  _links: Record<string, any>
  // Custom/scalar fields (e.g. customField6) are passed as top-level properties.
  [key: string]: any
}

export interface OpTestConnectionResult {
  success: boolean
  message: string
  projectName?: string
  types?: OpType[]
  statuses?: OpStatus[]
  versions?: OpVersion[]
  boards?: OpBoard[]
  canCreateWorkPackages?: boolean
  errors?: string[]
}

export interface OpSyncItemResult {
  localId: string
  title: string
  action: "created" | "updated" | "skipped" | "failed"
  externalId?: string
  externalUrl?: string
  error?: string
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class OpenProjectClient {
  private baseUrl: string
  private projectIdentifier: string
  private authHeader: string
  private bearerHeader: string

  constructor(baseUrl: string, projectIdentifier: string, apiToken: string) {
    // Normalize base URL: keep only scheme + domain, strip trailing slash
    const match = baseUrl.trim().match(/^(https?:\/\/[^\/\?#]+)/)
    this.baseUrl = match ? match[1] : baseUrl.trim().replace(/\/$/, "")
    if (!this.baseUrl.startsWith("http")) {
      this.baseUrl = `https://${this.baseUrl}`
    }

    // Normalize project identifier: extract slug if full URL pasted
    const projMatch = projectIdentifier.trim().match(/\/projects\/([^\/\?#]+)/)
    this.projectIdentifier = projMatch
      ? projMatch[1]
      : projectIdentifier.trim().replace(/[\/\?#].*/g, "")

    // Primary: Basic Auth with apikey:{token}
    this.authHeader = `Basic ${Buffer.from(`apikey:${apiToken.trim()}`).toString("base64")}`
    // Fallback: Bearer token (for OpenProject 14+)
    this.bearerHeader = `Bearer ${apiToken.trim()}`
  }

  // ─── Internal fetch with auth + fallback ──────────────────────────────────

  private async apiFetch(
    path: string,
    options: RequestInit = {},
    allowBearerFallback = true
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers as Record<string, string> || {}),
      Authorization: this.authHeader,
    }

    let res: Response
    try {
      res = await fetch(url, { ...options, headers })
    } catch (err: any) {
      throw new Error(`OpenProject unreachable at ${this.baseUrl}: ${err.message}`)
    }

    // Bearer fallback on 401/403
    if (allowBearerFallback && (res.status === 401 || res.status === 403)) {
      try {
        const res2 = await fetch(url, {
          ...options,
          headers: { ...headers, Authorization: this.bearerHeader },
        })
        if (res2.ok || (res2.status !== 401 && res2.status !== 403)) {
          return res2
        }
      } catch {
        // Bearer fallback failed, return original response
      }
    }

    return res
  }

  private async apiJson<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await this.apiFetch(path, options)
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let hint = ""
      if (res.status === 404) hint = " — Resource not found"
      if (res.status === 401) hint = " — Invalid API token"
      if (res.status === 403) hint = " — Permission denied"
      if (res.status === 409) hint = " — Conflict (stale lockVersion)"
      if (res.status === 422) {
        // Extract OpenProject validation error
        try {
          const err = JSON.parse(text)
          const msgs = err?._embedded?.errors?.map((e: any) => e.message) || [err?.message]
          hint = ` — Validation: ${msgs.join(", ")}`
        } catch {
          hint = ` — ${text.slice(0, 200)}`
        }
      }
      throw new Error(`OpenProject API ${res.status}${hint}`)
    }
    return res.json()
  }

  // ─── Connection & Metadata ────────────────────────────────────────────────

  async testConnection(): Promise<OpTestConnectionResult> {
    const errors: string[] = []
    let projectName = ""
    let types: OpType[] = []
    let statuses: OpStatus[] = []
    let versions: OpVersion[] = []
    let canCreate = false

    // 1. Check project exists
    try {
      const proj = await this.apiJson(`/api/v3/projects/${this.projectIdentifier}`)
      projectName = proj.name || proj.identifier || this.projectIdentifier
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Cannot connect to OpenProject project",
        errors: [err.message],
      }
    }

    // 2. Load types
    try {
      types = await this.getTypes()
    } catch (err: any) {
      errors.push(`Types: ${err.message}`)
    }

    // 3. Load statuses
    try {
      statuses = await this.getStatuses()
    } catch (err: any) {
      errors.push(`Statuses: ${err.message}`)
    }

    // 4. Load versions
    try {
      versions = await this.getVersions()
    } catch {
      // Versions are optional — don't add error
    }

    // 5. Load boards (optional — don't add error if missing)
    let boards: OpBoard[] = []
    try {
      boards = await this.getBoards()
    } catch {
      // Boards are optional
    }

    // 6. Check write permissions (attempt to validate a create form)
    try {
      const formRes = await this.apiFetch(
        `/api/v3/projects/${this.projectIdentifier}/work_packages/form`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _links: {} }),
        }
      )
      canCreate = formRes.ok || formRes.status === 422 // 422 = form returned validation but user can create
    } catch {
      canCreate = false
    }

    if (!canCreate) {
      errors.push("Cannot create work packages — check API token permissions")
    }

    return {
      success: errors.length === 0,
      message: errors.length === 0
        ? `Connected to "${projectName}" — ${types.length} types, ${statuses.length} statuses loaded`
        : `Connected with warnings: ${errors.join("; ")}`,
      projectName,
      types,
      statuses,
      versions,
      boards,
      canCreateWorkPackages: canCreate,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  async getProject(): Promise<any> {
    return this.apiJson(`/api/v3/projects/${this.projectIdentifier}`)
  }

  async getTypes(): Promise<OpType[]> {
    const data = await this.apiJson(`/api/v3/projects/${this.projectIdentifier}/types`)
    const elements: any[] = data?._embedded?.elements || []
    return elements.map((t) => ({
      id: t.id,
      name: t.name,
      href: `/api/v3/types/${t.id}`,
    }))
  }

  /**
   * Returns the custom fields defined for a work-package type in this project,
   * including required flags and the allowed values for list (dropdown) fields.
   * Uses the work-package form endpoint, which resolves allowed values inline.
   */
  async getTypeCustomFields(
    typeId: string | number,
    opts: { onlyRequired?: boolean } = {}
  ): Promise<OpCustomField[]> {
    // The form endpoint needs the numeric project id.
    let numericId: string = this.projectIdentifier
    try {
      const proj = await this.apiJson(`/api/v3/projects/${this.projectIdentifier}`)
      if (proj?.id) numericId = String(proj.id)
    } catch {
      // fall back to identifier as-is
    }

    const res = await this.apiFetch(
      `/api/v3/projects/${numericId}/work_packages/form`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _links: { type: { href: this.typeHref(String(typeId)) } } }),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Load type form failed: HTTP ${res.status} — ${text.slice(0, 200)}`)
    }
    const form = await res.json()
    const schema = form?._embedded?.schema || {}

    const fields: OpCustomField[] = []
    for (const [key, raw] of Object.entries<any>(schema)) {
      if (!key.startsWith("customField") || !raw || typeof raw !== "object") continue
      if (opts.onlyRequired && raw.required !== true) continue

      const fieldType: string = raw.type || "String"
      const isMulti = fieldType.startsWith("[]")
      const baseType = fieldType.replace(/^\[\]/, "")
      // Link-valued fields (dropdowns / references) go under _links; scalar/text under the body.
      const isLink = ["CustomOption", "User", "Version", "List"].includes(baseType) ||
        !!(raw._links?.allowedValues || raw._embedded?.allowedValues)
      const isFormattable = baseType === "Formattable"

      let allowedValues: Array<{ href: string; title: string }> = []
      const av = raw._links?.allowedValues
      if (Array.isArray(av)) {
        allowedValues = av.map((o: any) => ({ href: o.href, title: o.title || "" }))
      } else if (av?.href) {
        try {
          const list = await this.apiJson(av.href)
          allowedValues = (list?._embedded?.elements || []).map((o: any) => ({
            href: o._links?.self?.href || "",
            title: o.value || o.name || "",
          }))
        } catch {
          allowedValues = []
        }
      }

      fields.push({
        key,
        name: raw.name || key,
        required: raw.required === true,
        fieldType,
        isMulti,
        isLink,
        isFormattable,
        allowedValues,
      })
    }
    return fields
  }

  async getStatuses(): Promise<OpStatus[]> {
    const data = await this.apiJson(`/api/v3/statuses`)
    const elements: any[] = data?._embedded?.elements || []
    return elements.map((s) => ({
      id: s.id,
      name: s.name,
      href: `/api/v3/statuses/${s.id}`,
      isClosed: s.isClosed || false,
      isDefault: s.isDefault || false,
    }))
  }

  async getVersions(): Promise<OpVersion[]> {
    const data = await this.apiJson(`/api/v3/projects/${this.projectIdentifier}/versions`)
    const elements: any[] = data?._embedded?.elements || []
    return elements.map((v) => ({
      id: v.id,
      name: v.name,
      href: `/api/v3/versions/${v.id}`,
      status: v.status || "open",
    }))
  }

  async getBoards(): Promise<OpBoard[]> {
    // A board's grid "scope" is stored as the URL of its index page, e.g.
    // /projects/<id-or-slug>/boards — but OpenProject may persist either the
    // numeric id OR the slug depending on how the board was created. Filtering by
    // only one form silently returns zero boards (the "no boards appear" bug), so
    // we resolve both forms and also keep an unfiltered fallback scan.
    let numericId: string = this.projectIdentifier
    let slug: string = this.projectIdentifier
    try {
      const proj = await this.apiJson(`/api/v3/projects/${this.projectIdentifier}`)
      if (proj?.id) numericId = String(proj.id)
      if (proj?.identifier) slug = proj.identifier
    } catch {
      // Fall back to identifier as-is
    }

    const mapEl = (b: any): OpBoard => {
      const scopeHref: string = b._links?.scope?.href || ""
      // OpenProject board grids expose the board's name as a top-level `name`
      // property; scope.title / options.name are only fallbacks. Without `name`
      // the dropdown would show "Board <id>" instead of the real board name.
      const name: string =
        b.name || b._links?.scope?.title || b.options?.name || `Board ${b.id}`
      const attribute: string = b.options?.attribute || ""
      const type = attribute || (b.options?.type === "basic" ? "basic" : "status")
      return { id: b.id, name, type, href: scopeHref }
    }

    // 1. Try each scope form explicitly.
    const scopeCandidates = Array.from(new Set([
      `/projects/${numericId}/boards`,
      `/projects/${slug}/boards`,
    ]))
    for (const scope of scopeCandidates) {
      try {
        const scopeFilter = encodeURIComponent(
          JSON.stringify([{ scope: { operator: "=", values: [scope] } }])
        )
        const data = await this.apiJson(`/api/v3/grids?filters=${scopeFilter}&pageSize=50`)
        const elements: any[] = data?._embedded?.elements || []
        if (elements.length > 0) return elements.map(mapEl)
      } catch {
        // Try the next scope form / fallback
      }
    }

    // 2. Fallback: list all grids and keep board scopes for this project.
    try {
      const data = await this.apiJson(`/api/v3/grids?pageSize=100`)
      const elements: any[] = data?._embedded?.elements || []
      const filtered = elements.filter((b) => {
        const href: string = b._links?.scope?.href || ""
        return (
          href.includes("/boards") &&
          (href.includes(`/projects/${numericId}/`) || href.includes(`/projects/${slug}/`))
        )
      })
      return filtered.map(mapEl)
    } catch {
      return []
    }
  }

  /**
   * Returns the columns of a board by reading its grid widgets.
   * Widgets are at grid.widgets (top-level), queryId in widget.options.queryId,
   * column name from query.name.
   * For "free" boards (no attribute filter) the widgetId IS the queryId — placement
   * is done via updateOrderedWorkPackages on that query.
   */
  async getBoardColumns(boardId: number, boardType?: string): Promise<Array<{
    widgetId: number
    name: string
    queryId: string | null
    columnType: "status" | "version" | "assignee" | "basic"
    attributeId: string | null
  }>> {
    const grid = await this.apiJson(`/api/v3/grids/${boardId}`)

    // Widgets are at grid.widgets (top-level in OP API response), not grid._embedded.widgets
    const widgets: any[] = Array.isArray(grid?.widgets) ? grid.widgets : []

    if (widgets.length === 0) return []

    // Sort by startColumn so order matches the visual board left-to-right
    const sorted = [...widgets].sort((a: any, b: any) => (a.startColumn ?? 0) - (b.startColumn ?? 0))

    const columns = await Promise.all(sorted.map(async (w: any) => {
      // queryId is stored in widget.options.queryId (number or string)
      const queryId: string | null = w.options?.queryId != null ? String(w.options.queryId) : null
      let name = ""
      let columnType: "status" | "version" | "assignee" | "basic" = "basic"
      let attributeId: string | null = null

      if (queryId) {
        try {
          const query = await this.apiJson(`/api/v3/queries/${queryId}`)
          name = query?.name || ""

          // Check query filters to detect column type
          const filters: any[] = query?.filters || []
          for (const f of filters) {
            const fHref: string = f._links?.filter?.href || ""
            const vals: any[] = f._links?.values || []
            const firstHref: string = vals[0]?.href || ""
            if (fHref.includes("/status")) {
              columnType = "status"; attributeId = firstHref.split("/").pop() || null; break
            }
            if (fHref.includes("/version")) {
              columnType = "version"; attributeId = firstHref.split("/").pop() || null; break
            }
            if (fHref.includes("/assignee") || fHref.includes("/assigned_to")) {
              columnType = "assignee"; attributeId = firstHref.split("/").pop() || null; break
            }
          }
          // "free" boards have manualSort filter — no attribute, queryId IS the placement key
          if (columnType === "basic") attributeId = queryId
        } catch { /* query not accessible — use fallback name */ }
      }

      if (!name) name = `Column ${w.id}`
      return { widgetId: w.id, name, queryId, columnType, attributeId }
    }))

    return columns
  }

  // ─── Work Packages ────────────────────────────────────────────────────────

  async getWorkPackage(id: string | number): Promise<OpWorkPackage> {
    return this.apiJson(`/api/v3/work_packages/${id}`)
  }

  /**
   * All work packages matching `filters`, following pagination.
   *
   * This used to read a single 100-item page, which silently truncated every
   * caller on any project big enough to matter — a marker lookup would miss an
   * item that exists, and a bulk operation would only ever see the first
   * hundred. `maxItems` is a safety stop, not an expected limit.
   */
  async searchWorkPackages(
    filters: Array<Record<string, any>>,
    opts: { maxItems?: number } = {}
  ): Promise<OpWorkPackage[]> {
    const maxItems = opts.maxItems ?? 2000
    const pageSize = 100
    const filtersParam = encodeURIComponent(JSON.stringify(filters))
    const all: OpWorkPackage[] = []

    // OpenProject's `offset` is a 1-based PAGE number, not a row offset.
    for (let page = 1; all.length < maxItems; page++) {
      const data = await this.apiJson(
        `/api/v3/projects/${this.projectIdentifier}/work_packages?filters=${filtersParam}&pageSize=${pageSize}&offset=${page}`
      )
      const elements: OpWorkPackage[] = data?._embedded?.elements || []
      all.push(...elements)
      const total = typeof data?.total === "number" ? data.total : all.length
      if (elements.length < pageSize || all.length >= total) break
    }

    return all.slice(0, maxItems)
  }

  /**
   * Search for an existing work package by the stable marker in its description.
   * Returns the first match or null.
   */
  async findWorkPackageByMarker(testCaseId: string): Promise<OpWorkPackage | null> {
    const marker = `AI-Manual-QA-Tester:TestCase:${testCaseId}`
    try {
      const results = await this.searchWorkPackages([
        { description: { operator: "~", values: [marker] } },
      ])
      return results.length > 0 ? results[0] : null
    } catch {
      return null
    }
  }

  /**
   * Permanently deletes a work package. Returns true on success (204) or when the
   * work package no longer exists (404 — already gone, treated as success).
   */
  async deleteWorkPackage(wpId: string | number): Promise<boolean> {
    const res = await this.apiFetch(`/api/v3/work_packages/${wpId}`, { method: "DELETE" }, false)
    if (res.status === 204 || res.status === 200 || res.status === 404) return true
    const text = await res.text().catch(() => "")
    throw new Error(`Delete WP #${wpId} failed: HTTP ${res.status} — ${text.slice(0, 200)}`)
  }

  /**
   * Returns the file names of the attachments already on a work package, so a
   * re-sync doesn't upload the same screenshot twice.
   */
  async getWorkPackageAttachmentNames(wpId: string | number): Promise<string[]> {
    try {
      const data = await this.apiJson(`/api/v3/work_packages/${wpId}/attachments`)
      const elements: any[] = data?._embedded?.elements || []
      return elements.map((a: any) => a.fileName).filter(Boolean)
    } catch {
      return []
    }
  }

  /**
   * Uploads a file as an attachment on a work package (multipart form-data).
   * The OpenProject API expects a `metadata` JSON part and a `file` part. The
   * Content-Type header is intentionally left unset so fetch adds the multipart
   * boundary itself.
   */
  async uploadWorkPackageAttachment(
    wpId: string | number,
    fileName: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<boolean> {
    const form = new FormData()
    form.append("metadata", JSON.stringify({ fileName }))
    const bytes = new Uint8Array(data)
    form.append("file", new Blob([bytes], { type: contentType }), fileName)

    const res = await this.apiFetch(
      `/api/v3/work_packages/${wpId}/attachments`,
      { method: "POST", body: form },
      false
    )
    if (res.ok) return true
    const text = await res.text().catch(() => "")
    throw new Error(`Attach "${fileName}" to WP #${wpId} failed: HTTP ${res.status} — ${text.slice(0, 200)}`)
  }

  async createWorkPackage(data: OpCreateWPData): Promise<OpWorkPackage> {
    return this.apiJson(
      `/api/v3/projects/${this.projectIdentifier}/work_packages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    )
  }

  /**
   * Update a work package with lockVersion handling.
   * If 409 Conflict, refetches and retries once.
   */
  async updateWorkPackage(
    wpId: string | number,
    data: Record<string, any>,
    lockVersion: number
  ): Promise<OpWorkPackage> {
    const doUpdate = async (lv: number) => {
      const res = await this.apiFetch(
        `/api/v3/work_packages/${wpId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, lockVersion: lv }),
        },
        false // no bearer fallback on patch
      )
      return res
    }

    let res = await doUpdate(lockVersion)

    // Retry once on conflict
    if (res.status === 409) {
      try {
        const freshWp = await this.getWorkPackage(wpId)
        res = await doUpdate(freshWp.lockVersion)
      } catch {
        // Refetch failed, throw the original conflict
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let hint = ""
      if (res.status === 409) hint = " — Update conflict after retry"
      if (res.status === 422) {
        try {
          const err = JSON.parse(text)
          const msgs = err?._embedded?.errors?.map((e: any) => e.message) || [err?.message]
          hint = ` — Validation: ${msgs.join(", ")}`
        } catch {
          hint = ` — ${text.slice(0, 200)}`
        }
      }
      throw new Error(`Update WP #${wpId} failed: HTTP ${res.status}${hint}`)
    }

    return res.json()
  }

  /**
   * Places a work package into a free-board column by adding it to the column
   * query's ordered work packages list (PUT /api/v3/queries/:queryId/order).
   * Requires the API user to own the query or have admin rights.
   * Returns true on success, false if placement is not permitted (404/403).
   */
  async addWorkPackageToBoardColumn(queryId: string, wpId: string | number): Promise<boolean> {
    const res = await this.apiFetch(
      `/api/v3/queries/${queryId}/order`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ workPackageId: Number(wpId), delta: 0 }]),
      }
    )
    if (res.status === 200 || res.status === 204) return true
    if (res.status === 404 || res.status === 403) return false
    const text = await res.text().catch(() => "")
    throw new Error(`Board placement for WP #${wpId} failed: HTTP ${res.status} — ${text.slice(0, 200)}`)
  }

  /**
   * Read-modify-write a board grid's widgets under optimistic locking.
   *
   * A board PATCH replaces the ENTIRE widgets array, so every card-placement
   * write is a read-modify-write over shared state that the user is editing at
   * the same time in the OpenProject UI (dragging a card rewrites the same
   * widget filters). Sending a widgets array built from a grid we read seconds
   * ago silently reverts their drag — the card snaps back, or shows up in two
   * columns when only part of OpenProject's own bookkeeping is overwritten.
   *
   * `lockVersion` closes that window: OpenProject rejects the PATCH with 409 if
   * the grid changed since we read it, and we re-read and re-apply once. The
   * mutation must therefore be a pure function of the current widgets.
   *
   * Returns false when the grid can't be read or the PATCH is rejected;
   * `mutate` returning null means "nothing to change" and short-circuits.
   */
  private async patchGridWidgets(
    boardId: number,
    mutate: (widgets: any[]) => any[] | null,
    attempt = 0
  ): Promise<boolean> {
    const gridRes = await this.apiFetch(`/api/v3/grids/${boardId}`)
    if (!gridRes.ok) return false
    const grid = await gridRes.json()

    const widgets: any[] = Array.isArray(grid?.widgets) ? grid.widgets : []

    // Refuse to write when the read produced no widgets. A PATCH carrying an
    // empty widgets array does not "leave the board alone" — it deletes every
    // column on it. An unexpected response shape must never be able to do that.
    if (widgets.length === 0) {
      console.warn(`[openproject] Board ${boardId} read returned no widgets; skipping the write.`)
      return false
    }

    const updatedWidgets = mutate(widgets)
    if (!updatedWidgets) return true // already in the desired state

    // Placing a card changes what a column CONTAINS, never which columns exist.
    // If a mutation ever disagrees, the board is left untouched: losing a card's
    // position is recoverable, losing someone's board column is not.
    const before = widgets.map((w: any) => w.id).sort()
    const after = updatedWidgets.map((w: any) => w.id).sort()
    if (before.length !== after.length || before.some((id, i) => id !== after[i])) {
      console.error(
        `[openproject] Refusing to write board ${boardId}: the update would change its columns ` +
          `(${before.length} → ${after.length}).`
      )
      return false
    }

    const body: Record<string, any> = { widgets: updatedWidgets }
    if (grid?.lockVersion != null) body.lockVersion = grid.lockVersion

    const patchRes = await this.apiFetch(`/api/v3/grids/${boardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (patchRes.status === 200) return true

    // 409 = someone else wrote the grid first (a drag in the UI, or a parallel
    // sync). Re-read and re-apply once; a second conflict means the board is
    // being actively edited, so leave it to the user rather than fight them.
    if (patchRes.status === 409 && attempt === 0) {
      return this.patchGridWidgets(boardId, mutate, attempt + 1)
    }
    return false
  }

  /**
   * Replace a widget's id filter with exactly `wpIds`.
   *
   * An empty list drops the filter entirely rather than writing
   * `{ id: { operator: "=", values: [] } }`. OpenProject has no notion of an
   * "=" filter matching nothing — an empty value list is not a valid filter, and
   * a widget carrying one stops behaving as a column. That is how emptying a
   * column (moving its last card out) could take the column itself down.
   */
  private static withIdFilter(widget: any, wpIds: string[]): any {
    const filters = wpIds.length > 0 ? [{ id: { operator: "=", values: wpIds } }] : []
    return { ...widget, options: { ...widget.options, filters } }
  }

  /** The work package ids a board widget currently displays. */
  private static widgetIds(widget: any): string[] {
    return (widget?.options?.filters?.[0]?.id?.values || []).map(String)
  }

  /**
   * Places work packages on a free board column by updating the grid widget's
   * options.filters with an explicit ID filter.
   * This is the CE workaround: the board renders widget.options.filters, not the
   * query's own filters, and manualSort (the EE default) shows nothing in CE.
   */
  async setBoardWidgetIdFilter(boardId: number, widgetId: number, wpIds: string[]): Promise<boolean> {
    return this.patchGridWidgets(boardId, (widgets) =>
      widgets.map((w: any) =>
        w.id === widgetId ? OpenProjectClient.withIdFilter(w, wpIds) : w
      )
    )
  }

  /**
   * Adds a single work package to a free/basic board column WITHOUT dropping the
   * work packages already placed there. Reads the widget's current id filter and
   * merges in the new id (setBoardWidgetIdFilter, by contrast, replaces the whole
   * filter — fine for a full group sync, wrong for placing one bug at a time).
   */
  async addWorkPackageToBoardWidget(boardId: number, widgetId: number, wpId: string | number): Promise<boolean> {
    const target = String(wpId)
    let widgetFound = false
    const ok = await this.patchGridWidgets(boardId, (widgets) => {
      const widget = widgets.find((w: any) => w.id === widgetId)
      widgetFound = !!widget
      if (!widget) return null
      const existing = OpenProjectClient.widgetIds(widget)
      if (existing.includes(target)) return null
      const merged = [...existing, target]
      return widgets.map((w: any) =>
        w.id === widgetId ? OpenProjectClient.withIdFilter(w, merged) : w
      )
    })
    return ok && widgetFound
  }

  /**
   * Create the query behind one board column.
   *
   * Board columns are queries. A column filtered by STATUS needs no id filter of
   * its own — a card appears in it purely because the work package holds that
   * status. That is what makes a status board immune to the whole class of
   * problems the id-filter workaround has: a card can only ever be in one
   * column, because a work package can only hold one status.
   *
   * Board queries are hidden (they don't clutter the project's saved views) and
   * public (everyone viewing the board runs them).
   */
  async createBoardColumnQuery(
    name: string,
    statusId: string | null,
    typeId: string | null = null
  ): Promise<string> {
    const body: Record<string, any> = {
      name,
      public: true,
      hidden: true,
      showHierarchy: false,
      timelineVisible: false,
      displaySums: false,
      _links: {
        project: { href: `/api/v3/projects/${this.projectIdentifier}` },
      },
    }

    const filters: any[] = []
    if (statusId) {
      filters.push({
        _links: {
          filter: { href: "/api/v3/queries/filters/status" },
          operator: { href: "/api/v3/queries/operators/=" },
          values: [{ href: `/api/v3/statuses/${statusId}` }],
        },
      })
    }
    // Without this the column shows every work package holding the status —
    // tasks, features and all — rather than only bugs.
    if (typeId) {
      filters.push({
        _links: {
          filter: { href: "/api/v3/queries/filters/type" },
          operator: { href: "/api/v3/queries/operators/=" },
          values: [{ href: `/api/v3/types/${typeId}` }],
        },
      })
    }
    if (filters.length > 0) body.filters = filters

    const data = await this.apiJson(`/api/v3/queries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const queryId = data?.id
    if (queryId == null) throw new Error(`OpenProject accepted the column query "${name}" but returned no id`)
    return String(queryId)
  }

  /**
   * Create a board (a grid scoped to the project's boards) with one column per
   * entry, left to right in the order given. Returns the new board's id.
   */
  async createBoard(
    name: string,
    columns: Array<{ name: string; queryId: string; statusId?: string | null; typeId?: string | null }>
  ): Promise<number> {
    const widgets = columns.map((col, index) => {
      // The board renders the WIDGET's filters, not the query's — the same
      // reason this app has always injected id filters here. So the status and
      // type restrictions have to be repeated on the widget; setting them only
      // on the query leaves the column showing every work package in the
      // project.
      const filters: Array<Record<string, { operator: string; values: string[] }>> = []
      if (col.statusId) filters.push({ status: { operator: "=", values: [String(col.statusId)] } })
      if (col.typeId) filters.push({ type: { operator: "=", values: [String(col.typeId)] } })

      return {
        identifier: "work_package_query",
        startRow: 1,
        endRow: 2,
        startColumn: index + 1,
        endColumn: index + 2,
        options: {
          queryId: col.queryId,
          name: col.name,
          ...(filters.length > 0 ? { filters } : {}),
        },
      }
    })

    const data = await this.apiJson(`/api/v3/grids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // `name` is a top-level grid attribute. Passing it only inside `options`
        // is what OpenProject answered with "Name can't be blank"; it is sent in
        // both places because the board UI reads the options copy.
        name,
        rowCount: 1,
        columnCount: widgets.length,
        widgets,
        options: { name },
        _links: { scope: { href: `/projects/${this.projectIdentifier}/boards` } },
      }),
    })
    const boardId = data?.id
    if (boardId == null) throw new Error("OpenProject accepted the board but returned no id")
    return Number(boardId)
  }

  /**
   * Delete a query. Used to clean up the column queries when board creation
   * fails partway — otherwise every retry leaves another set of orphans behind
   * in the project. Never throws: cleanup must not mask the original failure.
   */
  async deleteQuery(queryId: string | number): Promise<boolean> {
    try {
      const res = await this.apiFetch(`/api/v3/queries/${queryId}`, { method: "DELETE" }, false)
      return res.status === 204 || res.status === 200 || res.status === 404
    } catch {
      return false
    }
  }

  /** Board URL as a person would open it. */
  boardUrl(boardId: number | string): string {
    return `${this.baseUrl}/projects/${this.projectIdentifier}/boards/${boardId}`
  }

  /** The ids currently pinned into a board widget's injected id filter. */
  async getBoardWidgetIds(boardId: number, widgetId: number): Promise<string[]> {
    const gridRes = await this.apiFetch(`/api/v3/grids/${boardId}`)
    if (!gridRes.ok) return []
    const grid = await gridRes.json()
    const widgets: any[] = Array.isArray(grid?.widgets) ? grid.widgets : []
    const widget = widgets.find((w: any) => w.id === widgetId)
    return widget ? OpenProjectClient.widgetIds(widget) : []
  }

  /**
   * The work package ids a board column's QUERY actually returns.
   *
   * A board column has two sources of truth that can disagree: the id filter
   * this app injects into the grid widget, and the query OpenProject's own board
   * UI maintains when someone drags a card. When they disagree the same card
   * renders in two columns. Reading the query side is what makes that visible.
   */
  async getQueryResultIds(queryId: string | number): Promise<string[]> {
    try {
      const data = await this.apiJson(`/api/v3/queries/${queryId}?pageSize=200`)
      const elements: any[] = data?._embedded?.results?._embedded?.elements || []
      return elements.map((wp: any) => String(wp.id))
    } catch {
      return []
    }
  }

  /**
   * True if the work package already appears in ANY free/basic board column
   * (i.e. it is present in some widget's id filter). Used to keep placement
   * idempotent: if the card is already on the board — possibly moved by the user
   * to a different column — re-placing it would duplicate it.
   */
  async boardContainsWorkPackage(boardId: number, wpId: string | number): Promise<boolean> {
    const gridRes = await this.apiFetch(`/api/v3/grids/${boardId}`)
    if (!gridRes.ok) return false
    const grid = await gridRes.json()
    const widgets: any[] = Array.isArray(grid?.widgets) ? grid.widgets : []
    const target = String(wpId)
    return widgets.some((w: any) => {
      const values: any[] = w?.options?.filters?.[0]?.id?.values || []
      return values.map(String).includes(target)
    })
  }

  /**
   * Reconciles a work package onto a free/basic board so it sits in EXACTLY one
   * column: adds it to the target widget's id filter and removes it from every
   * other column's filter in a single grid PATCH. Idempotent — a no-op when the
   * card is already only in the target column — so it moves a card without ever
   * duplicating it. Use this when the user has chosen a specific column in-app.
   */
  async setBoardCardColumn(boardId: number, targetWidgetId: number, wpId: string | number): Promise<boolean> {
    const target = String(wpId)
    return this.patchGridWidgets(boardId, (widgets) => {
      let changed = false
      const updatedWidgets = widgets.map((w: any) => {
        const values = OpenProjectClient.widgetIds(w)
        const has = values.includes(target)
        if (w.id === targetWidgetId) {
          if (has) return w
          changed = true
          return OpenProjectClient.withIdFilter(w, [...values, target])
        }
        // Any other column that currently holds the card: drop it (that's the "move").
        if (!has) return w
        changed = true
        return OpenProjectClient.withIdFilter(w, values.filter((v) => v !== target))
      })
      return changed ? updatedWidgets : null
    })
  }

  async addWorkPackageComment(wpId: string | number, markdown: string): Promise<boolean> {
    const res = await this.apiFetch(
      `/api/v3/work_packages/${wpId}/activities`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: { format: "markdown", raw: markdown } }),
      }
    )
    return res.ok
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  /**
   * Validate that a parent work package exists and is accessible.
   * We intentionally do NOT enforce project membership here — OpenProject uses
   * numeric IDs internally that don't always match the slug the user configured,
   * and cross-project parent links are valid in OpenProject itself.
   */
  async validateParentWorkPackage(parentId: string): Promise<{
    valid: boolean
    error?: string
    subject?: string
  }> {
    try {
      const wp = await this.getWorkPackage(parentId)
      return { valid: true, subject: wp.subject }
    } catch (err: any) {
      return { valid: false, error: err.message }
    }
  }

  /**
   * Validate that a type ID is available for the configured project.
   */
  async validateTypeForProject(typeId: string): Promise<boolean> {
    try {
      const types = await this.getTypes()
      return types.some((t) => String(t.id) === typeId)
    } catch {
      return false
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  get projectUrl(): string {
    return `${this.baseUrl}/projects/${this.projectIdentifier}`
  }

  workPackageUrl(wpId: string | number): string {
    return `${this.baseUrl}/work_packages/${wpId}`
  }

  typeHref(typeId: string): string {
    return `/api/v3/types/${typeId}`
  }

  statusHref(statusId: string): string {
    return `/api/v3/statuses/${statusId}`
  }

  parentHref(parentId: string): string {
    return `/api/v3/work_packages/${parentId}`
  }

  versionHref(versionId: string): string {
    return `/api/v3/versions/${versionId}`
  }

  priorityHref(priorityId: string | number): string {
    return `/api/v3/priorities/${priorityId}`
  }

  /**
   * Returns the priorities defined in the connected OpenProject instance so a
   * bug's priority can be mapped onto the work package's native priority field.
   */
  async getPriorities(): Promise<Array<{ id: string; name: string }>> {
    try {
      const data = await this.apiJson(`/api/v3/priorities`)
      const elements: any[] = data?._embedded?.elements || []
      return elements.map((e: any) => ({ id: String(e.id), name: e.name || `Priority ${e.id}` }))
    } catch {
      return []
    }
  }

  /**
   * Returns the assignable users (project members) of the connected project by
   * reading OpenProject memberships. Groups/placeholder principals are skipped —
   * only real users can be set as a work-package assignee.
   */
  async getMembers(): Promise<Array<{ id: string; name: string }>> {
    try {
      let numericId: string = this.projectIdentifier
      try {
        const proj = await this.apiJson(`/api/v3/projects/${this.projectIdentifier}`)
        if (proj?.id) numericId = String(proj.id)
      } catch {
        // Fall back to identifier as-is
      }

      const filter = encodeURIComponent(
        JSON.stringify([{ project: { operator: "=", values: [numericId] } }])
      )
      const data = await this.apiJson(`/api/v3/memberships?filters=${filter}&pageSize=100`)
      const elements: any[] = data?._embedded?.elements || []

      const seen = new Set<string>()
      const members: Array<{ id: string; name: string }> = []
      for (const m of elements) {
        const principal = m?._links?.principal
        const href: string = principal?.href || ""
        // Only /users/ principals are assignable (exclude groups/placeholders).
        if (!href.includes("/users/")) continue
        const id = href.split("/").pop() || ""
        if (!id || seen.has(id)) continue
        seen.add(id)
        members.push({ id, name: principal.title || `User ${id}` })
      }
      return members
    } catch {
      return []
    }
  }

  assigneeHref(userId: string): string {
    return `/api/v3/users/${userId}`
  }

  projectHref(): string {
    return `/api/v3/projects/${this.projectIdentifier}`
  }
}
