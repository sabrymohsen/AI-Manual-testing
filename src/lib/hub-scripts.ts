/**
 * Automation Hub test library: project scoping, starter tests, and the one-off
 * conversion of SHAFT-era Java scripts to Playwright JavaScript.
 */
import { prisma } from "@/lib/db"
import { DEFAULT_HUB_TEMPLATES, isLegacyJavaScript, javascriptReplacementFor } from "@/lib/hub-templates"

/** Readable names: letters, digits, spaces, "-" and "_", up to 80 characters. */
export const HUB_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/

export function hubNameError(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "Give the test a name"
  if (!HUB_NAME_PATTERN.test(name.trim())) {
    return "Use letters, numbers, spaces, - or _ (up to 80 characters), starting with a letter or number"
  }
  return null
}

export function cleanFolder(folder: unknown): string {
  return typeof folder === "string" ? folder.trim().replace(/\s+/g, " ").slice(0, 60) : ""
}

/** Tests a project sees: its own plus shared examples (projectId null). */
export function projectScriptsWhere(projectId: string) {
  return { OR: [{ projectId }, { projectId: null }] }
}

/**
 * Replace Java/SHAFT code that can never run with working JavaScript. Kept as
 * a rewrite of the same row, so the script keeps its id, name and history.
 */
export async function convertLegacyScripts(scripts: { id: string; name: string; type: string; code: string; folder?: string }[]) {
  let converted = 0
  for (const s of scripts) {
    if (!isLegacyJavaScript(s.code)) continue
    const { code, folder } = javascriptReplacementFor(s.name, s.type)
    await prisma.testScript.update({
      where: { id: s.id },
      data: { code, ...(s.folder ? {} : { folder }), type: s.type === "Database" ? "API" : s.type },
    })
    converted++
  }
  return converted
}

/** A project's first visit gets the starter tests, owned by that project. */
export async function seedProjectIfEmpty(projectId: string): Promise<boolean> {
  const count = await prisma.testScript.count({ where: projectScriptsWhere(projectId) })
  if (count > 0) return false
  await prisma.testScript.createMany({
    data: DEFAULT_HUB_TEMPLATES.map((t) => ({
      name: t.name,
      type: t.type,
      folder: t.folder,
      tags: t.tags,
      code: t.code,
      projectId,
    })),
  })
  return true
}
