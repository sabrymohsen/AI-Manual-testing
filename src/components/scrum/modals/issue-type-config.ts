import type { TaskType } from "@/types/scrum"

/**
 * Per-type configuration for the Create Issue form.
 *
 * A Bug and a Test Case need genuinely different information, but Task has no
 * dedicated columns for "steps to reproduce" or "expected result". Rather than
 * force a migration, the type-specific prose is composed into `description` as
 * predictable markdown sections (see `composeDescription`), while the fields
 * that DO have real columns — environment, components, labels, affectedVersions
 * — are sent as structured data.
 */

export interface IssueTypeConfig {
  /** Field keys this type shows, in render order. */
  sections: SectionKey[]
  /** Placeholder for the title input. */
  titlePlaceholder: string
  /** Short helper under the title field. */
  titleHint?: string
  /** Whether estimation (story points) is meaningful for this type. */
  showStoryPoints: boolean
  /** Accent classes for the type chip when selected. */
  accent: string
}

export type SectionKey =
  | "description"
  | "acceptanceCriteria"
  | "stepsToReproduce"
  | "expectedResult"
  | "actualResult"
  | "preconditions"
  | "testSteps"
  | "environment"

export const ISSUE_TYPE_CONFIG: Record<
  Extract<TaskType, "STORY" | "TASK" | "BUG" | "TEST_CASE">,
  IssueTypeConfig
> = {
  STORY: {
    sections: ["description", "acceptanceCriteria"],
    titlePlaceholder: "As a user, I want to…",
    titleHint: "Phrase it as user value, not implementation.",
    showStoryPoints: true,
    accent: "border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-400",
  },
  TASK: {
    sections: ["description"],
    titlePlaceholder: "What needs doing?",
    showStoryPoints: true,
    accent: "border-blue-600/40 bg-blue-600/10 text-blue-700 dark:text-blue-400",
  },
  BUG: {
    sections: ["description", "stepsToReproduce", "expectedResult", "actualResult", "environment"],
    titlePlaceholder: "Summarise the defect in one line",
    titleHint: "What breaks, and where. Keep the detail for the fields below.",
    showStoryPoints: false,
    accent: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400",
  },
  TEST_CASE: {
    sections: ["description", "preconditions", "testSteps", "expectedResult"],
    titlePlaceholder: "Verify that…",
    titleHint: "One behaviour per case, stated as what is being verified.",
    showStoryPoints: false,
    accent: "border-teal-600/40 bg-teal-600/10 text-teal-700 dark:text-teal-400",
  },
}

export const SECTION_META: Record<
  SectionKey,
  { label: string; placeholder: string; rows: number; hint?: string }
> = {
  description: {
    label: "Description",
    placeholder: "Context, background, links…",
    rows: 3,
  },
  acceptanceCriteria: {
    label: "Acceptance criteria",
    placeholder: "- [ ] Given … when … then …\n- [ ] …",
    rows: 3,
    hint: "One checkable outcome per line.",
  },
  stepsToReproduce: {
    label: "Steps to reproduce",
    placeholder: "1. Go to …\n2. Click …\n3. Observe …",
    rows: 4,
    hint: "Numbered, from a known starting state.",
  },
  expectedResult: {
    label: "Expected result",
    placeholder: "What should happen",
    rows: 2,
  },
  actualResult: {
    label: "Actual result",
    placeholder: "What actually happens",
    rows: 2,
  },
  preconditions: {
    label: "Preconditions",
    placeholder: "Data, permissions, or state required before the first step",
    rows: 2,
  },
  testSteps: {
    label: "Test steps",
    placeholder: "1. …\n2. …",
    rows: 4,
  },
  environment: {
    label: "Environment",
    placeholder: "e.g. Chrome 126 / macOS 14 / staging",
    rows: 1,
    hint: "Stored on the issue, not in the description.",
  },
}

/** Sections that map to real columns rather than the description body. */
export const STRUCTURED_SECTIONS: SectionKey[] = ["environment"]

const SECTION_HEADING: Partial<Record<SectionKey, string>> = {
  acceptanceCriteria: "Acceptance Criteria",
  stepsToReproduce: "Steps to Reproduce",
  expectedResult: "Expected Result",
  actualResult: "Actual Result",
  preconditions: "Preconditions",
  testSteps: "Test Steps",
}

/**
 * Fold the free-text sections into one markdown `description` string.
 * The plain "description" section stays at the top with no heading so short
 * issues don't gain ceremony they didn't ask for.
 */
export function composeDescription(
  type: keyof typeof ISSUE_TYPE_CONFIG,
  values: Partial<Record<SectionKey, string>>
): string | null {
  const parts: string[] = []

  const body = values.description?.trim()
  if (body) parts.push(body)

  for (const key of ISSUE_TYPE_CONFIG[type].sections) {
    if (key === "description" || STRUCTURED_SECTIONS.includes(key)) continue
    const value = values[key]?.trim()
    if (!value) continue
    const heading = SECTION_HEADING[key] ?? key
    // Format list items if lines start with hyphen
    const formattedVal = value
      .split("\n")
      .map((line) => {
        const trimmed = line.trim()
        if (trimmed.startsWith("- [ ] ")) {
          return `<p><input type="checkbox" disabled /> ${trimmed.substring(6)}</p>`
        }
        if (trimmed.startsWith("- ")) {
          return `<ul><li>${trimmed.substring(2)}</li></ul>`
        }
        return line.startsWith("<p>") ? line : `<p>${line}</p>`
      })
      .join("")

    parts.push(`<h3>${heading}</h3>${formattedVal}`)
  }

  return parts.length > 0 ? parts.join("") : null
}

/** Comma/newline separated free text → trimmed, de-duplicated list. */
export function parseList(input: string): string[] {
  const seen = new Set<string>()
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || seen.has(s.toLowerCase())) return false
      seen.add(s.toLowerCase())
      return true
    })
}
