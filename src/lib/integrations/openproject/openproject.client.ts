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
  _links: Record<string, { href: string }>
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
    try {
      // OpenProject grids API requires the numeric project ID in the scope path,
      // not the slug identifier. Fetch the project first to get its numeric ID.
      let numericId: string = this.projectIdentifier
      try {
        const proj = await this.apiJson(`/api/v3/projects/${this.projectIdentifier}`)
        if (proj?.id) numericId = String(proj.id)
      } catch {
        // Fall back to identifier as-is
      }

      const scopeFilter = encodeURIComponent(
        JSON.stringify([{ scope: { operator: "=", values: [`/projects/${numericId}/boards`] } }])
      )
      const data = await this.apiJson(`/api/v3/grids?filters=${scopeFilter}&pageSize=50`)
      const elements: any[] = data?._embedded?.elements || []
      return elements.map((b) => {
        const scopeHref: string = b._links?.scope?.href || ""
        const name: string = b._links?.scope?.title || b.options?.name || `Board ${b.id}`
        const attribute: string = b.options?.attribute || ""
        const type = attribute || (b.options?.type === "basic" ? "basic" : "status")
        return { id: b.id, name, type, href: scopeHref }
      })
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

  async searchWorkPackages(filters: Array<Record<string, any>>): Promise<OpWorkPackage[]> {
    const filtersParam = encodeURIComponent(JSON.stringify(filters))
    const data = await this.apiJson(
      `/api/v3/projects/${this.projectIdentifier}/work_packages?filters=${filtersParam}&pageSize=100`
    )
    return data?._embedded?.elements || []
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
   * Places work packages on a free board column by updating the grid widget's
   * options.filters with an explicit ID filter.
   * This is the CE workaround: the board renders widget.options.filters, not the
   * query's own filters, and manualSort (the EE default) shows nothing in CE.
   */
  async setBoardWidgetIdFilter(boardId: number, widgetId: number, wpIds: string[]): Promise<boolean> {
    const gridRes = await this.apiFetch(`/api/v3/grids/${boardId}`)
    if (!gridRes.ok) return false
    const grid = await gridRes.json()

    const widgets: any[] = Array.isArray(grid?.widgets) ? grid.widgets : []
    const updatedWidgets = widgets.map((w: any) => {
      if (w.id === widgetId) {
        return { ...w, options: { ...w.options, filters: [{ id: { operator: "=", values: wpIds } }] } }
      }
      return w
    })

    const patchRes = await this.apiFetch(`/api/v3/grids/${boardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets: updatedWidgets }),
    })
    return patchRes.status === 200
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

  assigneeHref(userId: string): string {
    return `/api/v3/users/${userId}`
  }

  projectHref(): string {
    return `/api/v3/projects/${this.projectIdentifier}`
  }
}
