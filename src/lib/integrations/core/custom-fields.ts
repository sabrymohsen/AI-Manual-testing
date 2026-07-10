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
