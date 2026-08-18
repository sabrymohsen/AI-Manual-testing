/**
 * Shared translation of the app's stored custom-field structure into normalized
 * link/scalar field maps for WorkItemInput.
 *
 * Stored shape (on BugReport.openProjectCustomFields, kept for back-compat):
 *   { [fieldKey]: { kind: "text" | "formattable" | "link-single" | "link-multi", value } }
 *
 * Output:
 *   - linkFields:   key -> external value id (string) or ids (string[])
 *   - scalarFields: key -> primitive, OR { format: "markdown", raw } for formattable
 *
 * Formattable values use OpenProject's {format,raw} envelope as the canonical
 * representation; non-OP providers extract `.raw` (see richTextValue below).
 */
export interface NormalizedFieldValues {
  linkFields: Record<string, string | string[]>
  scalarFields: Record<string, unknown>
}

export function normalizeStoredCustomFields(stored: unknown): NormalizedFieldValues {
  const linkFields: Record<string, string | string[]> = {}
  const scalarFields: Record<string, unknown> = {}
  if (!stored || typeof stored !== "object") return { linkFields, scalarFields }

  for (const [key, entry] of Object.entries(stored as Record<string, any>)) {
    if (!entry || typeof entry !== "object") continue
    const kind: string = entry.kind
    const value = entry.value
    if (kind === "text") {
      if (value !== undefined && value !== null && value !== "") scalarFields[key] = value
    } else if (kind === "formattable") {
      if (value !== undefined && value !== null && value !== "") {
        scalarFields[key] = { format: "markdown", raw: String(value) }
      }
    } else if (kind === "link-single") {
      if (value) linkFields[key] = value
    } else if (kind === "link-multi") {
      const arr = (Array.isArray(value) ? value : [value]).filter(Boolean)
      if (arr.length > 0) linkFields[key] = arr as string[]
    }
  }
  return { linkFields, scalarFields }
}

/** Extract a plain-string value from a scalar field that may be a {format,raw} envelope. */
export function richTextValue(value: unknown): string {
  if (value && typeof value === "object" && "raw" in (value as any)) {
    return String((value as any).raw ?? "")
  }
  return value == null ? "" : String(value)
}

/** True when a scalar field carries the formattable {format,raw} envelope. */
export function isRichTextValue(value: unknown): boolean {
  return !!value && typeof value === "object" && "raw" in (value as any)
}

/**
 * Merge project-level defaults with a bug's own custom-field values.
 *
 * A tracker can mark custom fields required on the bug type (e.g. "Found in
 * Build", "Bug Componant"). Values are captured per bug, so any bug that never
 * had them filled in fails to sync with "… can't be blank" — which is every bug
 * on an automatic sync, where there is nobody to prompt. Project defaults fill
 * those gaps; a value on the bug always wins over the default.
 *
 * Empty strings and empty arrays count as "not set", so a cleared field falls
 * back to the default rather than being sent blank and rejected.
 */
export function mergeStoredCustomFields(defaults: unknown, own: unknown): NormalizedFieldValues {
  const isSet = (entry: any): boolean => {
    if (!entry || typeof entry !== "object") return false
    const value = entry.value
    if (value === undefined || value === null || value === "") return false
    if (Array.isArray(value) && value.length === 0) return false
    return true
  }

  const asRecord = (v: unknown): Record<string, any> =>
    v && typeof v === "object" ? (v as Record<string, any>) : {}

  const merged: Record<string, any> = {}
  for (const [key, entry] of Object.entries(asRecord(defaults))) {
    if (isSet(entry)) merged[key] = entry
  }
  for (const [key, entry] of Object.entries(asRecord(own))) {
    if (isSet(entry)) merged[key] = entry
  }

  return normalizeStoredCustomFields(merged)
}
