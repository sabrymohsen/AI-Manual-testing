/**
 * The "[Module] " prefix on a bug title.
 *
 * The team already writes titles this way by hand — "[Temporary Housing]
 * Autofill fails for children" — so a defect's module is readable in the
 * tracker, in an email, and in any list that shows nothing but titles. Doing it
 * by hand means it is forgotten, spelled three ways, or left pointing at the
 * module the bug used to belong to.
 *
 * Deliberately NOT importing anything server-side: this runs in the browser
 * while the tester types, and `@/lib/bug-reports/module` pulls in Prisma.
 */

/** A leading "[...]" and the space after it, if present. */
const LEADING_BRACKET = /^\s*\[([^\]]*)\]\s*/

/**
 * Remove a leading "[Name] " when Name is one of the project's modules.
 *
 * The membership test is what makes this safe to run on every title: a bug
 * called "[iOS 17] Keyboard covers the field" keeps its prefix, because "iOS
 * 17" is not a module. Only a prefix the app itself would have written is
 * treated as one it may rewrite.
 */
export function stripModulePrefix(title: string, moduleNames: string[]): string {
  const match = (title || "").match(LEADING_BRACKET)
  if (!match) return title || ""

  const inside = match[1].trim().toLowerCase()
  const isModule = moduleNames.some(name => name.trim().toLowerCase() === inside)
  return isModule ? title.slice(match[0].length) : title
}

/**
 * Put `moduleName` in front of `title`, replacing whichever module prefix was
 * there before. An empty module (Unfiled) strips the prefix and adds none.
 *
 * Idempotent: applying the same module twice leaves the title unchanged, so it
 * is safe to call on every keystroke, every module change and every AI draft.
 */
export function applyModulePrefix(
  title: string,
  moduleName: string | null | undefined,
  moduleNames: string[]
): string {
  const bare = stripModulePrefix(title || "", moduleNames)
  const name = (moduleName || "").trim()
  if (!name) return bare
  // A trailing space when there is nothing yet, so the tester types after the
  // bracket rather than inside it.
  return bare ? `[${name}] ${bare}` : `[${name}] `
}
