/**
 * Client-side helper for pulling user-story work packages from OpenProject
 * into local Requirements. Single implementation shared by every entry point
 * (currently the Requirements page) so result messaging stays consistent.
 */
export interface OpenProjectImportResult {
  ok: boolean
  message: string
}

export async function importStoriesFromOpenProject(
  projectId: string
): Promise<OpenProjectImportResult> {
  try {
    const res = await fetch(
      `/api/projects/${projectId}/integrations/openproject/import-stories`,
      { method: "POST" }
    )
    const data = await res.json()
    if (!res.ok) {
      return { ok: false, message: data.error || "Import from OpenProject failed" }
    }
    return {
      ok: true,
      message: `OpenProject import: ${data.imported} new, ${data.updated} updated${
        data.skipped ? `, ${data.skipped} skipped` : ""
      } (of ${data.total} found)`,
    }
  } catch {
    return { ok: false, message: "Network error during OpenProject import" }
  }
}
