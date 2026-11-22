/**
 * QA skills for the app's own AI.
 *
 * Each skill is a short block of expert testing guidance. Every AI call already
 * names itself with a `command` label ("generate-test-case", "draft-bug-report",
 * "bug-assistance:suggest-severity" …), so provider-chat attaches the skills that
 * match that label to the system prompt. One place lights up every feature,
 * whichever provider is configured.
 *
 * Kept deliberately short: the default local model (Ollama) runs with a 4K-token
 * context, so at most MAX_SKILLS_PER_CALL skills, MAX_SKILL_CHARS in total, are
 * attached to a call. Skills are guidance only — the feature's own prompt still
 * decides the output format, and the header below says so.
 *
 * Skills are always on: there is deliberately no switch to turn them off.
 */

export interface QaSkill {
  id: string
  name: string
  /** One line for the Skills tab. */
  description: string
  /** Text added to the system prompt. Keep under ~700 characters. */
  instructions: string
  /**
   * Command labels this skill applies to. An entry ending in ":" or "*" matches
   * by prefix ("bug-assistance:" matches every bug-assistance action).
   */
  commands: string[]
}

export const MAX_SKILLS_PER_CALL = 3
export const MAX_SKILL_CHARS = 2200

const TEST_GENERATION = [
  "generate-test-case",
  "generate-test-cases",
  "generate-test-cases-from-requirement",
  "autonomous-generate-tests",
]

// Order matters: when more skills match than fit, the earlier ones win.
export const QA_SKILLS: QaSkill[] = [
  // ── Professional-tester pipeline rules (from AI_Skills_project) ──────────
  // These come first so they win the size budget on the features they cover.
  {
    id: "never-assume",
    name: "Never assume — ask",
    description: "Unknowns become open questions, never invented answers; expected results come only from the requirement.",
    instructions:
      "Never invent a requirement, rule, message text, limit or role. Walk each acceptance criterion through: actor/role, preconditions, inputs (required, type, length, format), boundaries, exact output and message wording (prefixes, punctuation, case), what happens next, error handling, data and cleanup. Anything not stated is a gap: write it as an open question for the business (who to ask, why it blocks testing), not as an answer. Expected results are copied exactly from the requirement; when one rests on an open question, say so and mark that case Blocked instead of guessing. If you had to use what the site shows today, label it 'observed, not confirmed'.",
    commands: [
      "analyze-brd",
      "generate-test-case",
      "generate-test-cases",
      "generate-test-cases-from-requirement",
      "suggest-expected-result",
    ],
  },
  {
    id: "impact-analysis",
    name: "Impact analysis",
    description: "Ranks what else a requirement can break (Likelihood x Severity) with evidence for every link.",
    instructions:
      "For every requirement or story, list the other modules it can break: what it depends on, what depends on it, shared components (same form, page, header, cart, API), shared data (account, session, order) and areas the text calls fragile. Score Likelihood 3 (changes it directly) / 2 (shares data or flow) / 1 (indirect) times Severity 3 (blocks a core flow, data loss, security, money) / 2 (wrong with a workaround) / 1 (cosmetic). 9 = Critical, 6 = High, 3-4 = Medium, 1-2 = Low. Back each impact with an exact quote, or raise a question if the link is uncertain. Never invent a link.",
    commands: ["analyze-brd", "agent-brain-plan"],
  },
  {
    id: "impact-coverage",
    name: "Story + regression coverage",
    description: "A target case for every acceptance criterion and a regression case for every Critical/High impacted module.",
    instructions:
      "Cover two scopes. Target: at least one case per acceptance criterion (positive, negative, boundary), each traced to its criterion. Impacted: a regression case for every Critical or High impacted module, checking that it still works after the change (for example a valid login still reaches the home page after new error handling). Prefer fewer strong cases over many weak ones, but never drop a criterion or a Critical/High impact to fit a limit: say what is not covered. Each case has one goal, exact test data, and an expected result someone can observe.",
    commands: ["generate-test-cases", "generate-test-cases-from-requirement"],
  },
  {
    id: "bug-triage",
    name: "Bug triage — only confirmed defects",
    description: "Every failure gets a decision: Bug, Requirement issue, Test issue, Environment, Duplicate or Not a bug.",
    instructions:
      "Before calling anything a bug, triage it: (1) did the test run as designed? No = Test issue or Environment, never a bug. (2) Is the expected result confirmed by the requirement? No = Requirement issue (name the open question), not a bug. (3) Does the evidence show wrong behaviour? Yes = Bug; unclear = Not a bug with the reason. (4) Same cause as an earlier finding = Duplicate. A failure in a module that worked before is a regression: at least High if that module is Critical, at least Medium if High. Actual = the exact text or state observed; Expected = the exact text from the test case, never changed.",
    commands: ["draft-bug-report", "generate-bug-report", "autonomous-run-summary"],
  },
  {
    id: "honest-results",
    name: "Honest results",
    description: "Failed, Error, Flaky, Blocked and Skipped are reported separately; expected results are never bent to get green.",
    instructions:
      "Report results honestly and separately. Failed = the app answered and the answer is wrong (wrong text, missing element on a rendered page, 4xx/5xx from the app). Error = the test could not run or observe (site down, session died, missing data). Flaky = passed only on a retry after an infrastructure error. Blocked = rests on an open question. Skipped = pointless after an earlier failure. Never merge or hide these, never change an expected result or force a step (JS click, force) to get a pass, and compare text exactly, including prefix, punctuation and case. A console error is a finding even when the page looks right.",
    commands: ["autonomous-run-summary", "explain-failure", "diagnosis-chat", "agent-chat"],
  },
  {
    id: "case-to-automation",
    name: "Faithful automation of a test case",
    description: "Automated steps do exactly what the manual case says and assert its exact expected result.",
    instructions:
      "When turning a test case or goal into automated steps: follow the case's steps in order, one action per step, and end every case with an assertion of its exact expected result (text, URL or element state), never only 'page loaded'. Do not add steps the case did not ask for or skip ones it did; if a step cannot be automated, say so. Stay on the site under test, use synthetic data (example.com emails, fake names, published test cards), never real credentials, and undo data you create when the case allows it.",
    commands: ["plain-english-generate-steps", "autonomous-generate-tests"],
  },
  // ── General QA craft ─────────────────────────────────────────────────────
  {
    id: "test-design",
    name: "Test design techniques",
    description: "Equivalence classes, boundary values, decision tables, state transitions and negative paths when creating test cases.",
    instructions:
      "Derive cases with formal techniques, not guesswork: equivalence partitioning (one case per valid and per invalid class), boundary values (min-1, min, max, max+1 for lengths, ranges, counts, dates), decision tables for rules with several conditions, state transitions for statuses and workflows, and error guessing (empty, whitespace-only, very long, unicode/RTL/emoji, HTML/script text, duplicates, double submit, refresh or back mid-flow, expired session). Always include positive, negative, boundary and permission/role cases. Do not repeat cases that test the same class. Title format: '<Feature> - <condition> - <expected outcome>'.",
    commands: [...TEST_GENERATION, "agent-brain-plan", "agent-chat"],
  },
  {
    id: "test-steps",
    name: "Clear, runnable test steps",
    description: "One action per step, exact test data, and an observable expected result for every step.",
    instructions:
      "Each step is ONE user action written as an imperative ('Click \"Save\"', 'Type \"jane@test.dev\" in Email'). Use exact data values, never 'some valid value'. Every step has an expected result someone can see or check (text shown, URL, element state, saved value after reload), never 'it works' or 'success'. Put setup (role, existing data, start page) in preconditions, not steps. Finish with an assertion that proves the goal of the test, not only that a page loaded.",
    commands: [...TEST_GENERATION, "plain-english-generate-steps", "suggest-expected-result"],
  },
  {
    id: "locators",
    name: "Resilient locators",
    description: "Prefer role, label, text and test-id locators over brittle CSS/XPath when targeting elements.",
    instructions:
      "Target elements the way a user finds them, in this order: role + accessible name (button 'Save'), label, placeholder, visible text, data-testid / data-test / data-qa, and only then a short stable CSS selector. Never use XPath with indexes, nth-child chains, generated class names (css-1x2y3z, sc-abc), or the whole page ('html', 'body'). Scope ambiguous targets to their container (the dialog, the table row). Wait for a visible state or URL, never a fixed delay.",
    commands: ["generate-test-case", "autonomous-generate-tests", "plain-english-generate-steps", "diagnosis-chat", "agent-chat"],
  },
  {
    id: "bug-reporting",
    name: "Bug report writing",
    description: "Specific titles, minimal reproducible steps, expected vs actual, environment and evidence.",
    instructions:
      "Title: '[Area] what is wrong + where/when', specific and under ~12 words; never 'X doesn't work' or 'bug in X'. Steps: the minimum numbered steps from a clean start, one action each, with exact data. Expected: what should happen (per the requirement if known). Actual: what happened, with error messages verbatim. Add environment (URL, browser, role) and evidence (console errors, failing request method + URL + status). One bug per report. State facts; mark any suspected cause as a guess. Never include passwords, tokens or personal data.",
    commands: ["draft-bug-report", "generate-bug-report", "bug-assistance:", "autonomous-run-summary"],
  },
  {
    id: "severity",
    name: "Severity and priority rubric",
    description: "Consistent Critical / High / Medium / Low ratings based on impact.",
    instructions:
      "Rate severity by impact: Critical = crash, data loss or corruption, security hole, or the core flow is blocked with no workaround. High = a major feature is broken or gives wrong results, workaround is painful. Medium = partly wrong, a reasonable workaround exists. Low = cosmetic, typo, minor layout. Priority adds urgency (customer-facing, many users, release blocker). A visual glitch is Low even if it looks bad; anything that loses user data is Critical. A regression (something that worked before) in a core module is at least High.",
    commands: ["draft-bug-report", "generate-bug-report", "bug-assistance:suggest-severity", "bug-assistance:developer-summary"],
  },
  {
    id: "failure-diagnosis",
    name: "Failure diagnosis",
    description: "Classifies a failed test as product bug, test bug, flaky timing or environment before suggesting a fix.",
    instructions:
      "Before proposing a fix, classify the failure from the evidence: PRODUCT BUG (app returned an error or wrong data, console exception, 4xx/5xx), TEST BUG (locator no longer matches, wrong expected value, test depends on other tests' data), FLAKY TIMING (passes on retry; acted before the element was ready or a request finished) or ENVIRONMENT (server down, timeout reaching the site, missing data or credentials). Quote the exact error line you relied on. For timing, recommend waiting for a specific state, never a longer sleep or more retries. For a product bug, say it should be reported, not worked around in the test.",
    commands: ["explain-failure", "diagnosis-chat", "autonomous-run-summary", "agent-chat"],
  },
  {
    id: "test-data",
    name: "Realistic test data",
    description: "Valid, realistic and edge-case data that never uses real people or secrets.",
    instructions:
      "Generate data that passes the field's real validation (email format, phone length, date ranges) and looks realistic. For each field also think of the edge values: shortest and longest allowed, special characters, unicode/Arabic, leading/trailing spaces. Use reserved example domains (example.com, test.dev) and obviously fake names and numbers; never real people's data, real card numbers (use published test cards) or real credentials. Make unique values unique (add a timestamp or counter).",
    commands: ["plain-english-generate-data", "generate-test-case", "generate-test-cases"],
  },
  {
    id: "exploratory",
    name: "Exploratory testing heuristics",
    description: "Risk-first exploration: main value paths, bad input, interruptions, permissions and consistency.",
    instructions:
      "Explore the riskiest areas first: the main value path, forms that save data, permissions, and anything new. Vary input (empty, max length, special characters, duplicates), interrupt flows (double click, back, refresh, two tabs), check persistence after reload, and compare with similar pages for consistency. Treat console errors and failed network requests as findings even when the page looks fine. Record each finding as: action -> what you observed.",
    commands: ["agent-brain-plan", "agent-brain-context", "autonomous-generate-tests", "autonomous-run-summary"],
  },
  {
    id: "accessibility",
    name: "Accessibility checks",
    description: "WCAG 2.2 AA basics: keyboard access, names and labels, contrast, focus and error messages.",
    instructions:
      "Include accessibility where relevant (WCAG 2.2 AA): every control reachable and usable by keyboard with a visible focus; inputs have visible labels; buttons and icons have accessible names; images have alt text; errors are shown as text next to the field, not by color alone; text contrast at least 4.5:1; dialogs trap focus and close with Esc; the page works at 200% zoom.",
    commands: ["generate-test-cases-from-requirement", "agent-brain-plan", "agent-chat"],
  },
  {
    id: "brd-analysis",
    name: "BRD requirements analysis",
    description: "Pulls testable requirements out of Arabic or English BRDs without inventing any, and flags vague or missing ones.",
    instructions:
      "A good requirement is atomic, testable and traceable: one behaviour, a measurable outcome, and the exact source text. Keep the document's language and terms (Arabic stays Arabic). Treat 'shall/must/يجب' as mandatory and 'should/ينبغي' as desirable. Flag vague words (fast, easy, appropriate, سريع، مناسب، حسب الحاجة), TBD items, undefined roles or statuses, missing validation, error handling and limits. Never fill a gap with an assumption — report it as a question for the business.",
    commands: ["analyze-brd"],
  },
  {
    id: "duplicates",
    name: "Duplicate detection",
    description: "Judges duplicates by what is tested (feature, condition, outcome), not by similar wording.",
    instructions:
      "Two test cases are duplicates when they check the same feature under the same condition for the same expected outcome, even if worded differently. They are NOT duplicates when the input class, boundary, role, browser or expected result differs (e.g. 'empty password' vs 'wrong password'). Explain the deciding difference or overlap in one sentence.",
    commands: ["detect-duplicate-test-case"],
  },
  {
    id: "automation",
    name: "Test automation practices",
    description: "Independent tests, web-first assertions, no fixed sleeps, and the right test level.",
    instructions:
      "When writing or fixing automated tests: each test sets up its own data and can run alone and in parallel; use web-first assertions that wait for a state (visible, has text, has URL) instead of sleeps; keep one behaviour per test; log in once and reuse the session; mock external services you don't own; test rules at the lowest level that can catch them (unit, then API, then UI). Never fix a flaky test by only adding retries or longer timeouts.",
    commands: ["agent-chat", "diagnosis-chat", "autonomous-generate-tests"],
  },
]

export const QA_SKILL_IDS = QA_SKILLS.map((s) => s.id)

/** Human labels for the commands, shown in the Skills tab. */
export const COMMAND_LABELS: Record<string, string> = {
  "generate-test-case": "Generate test case",
  "generate-test-cases": "Generate test cases",
  "generate-test-cases-from-requirement": "Test cases from requirement",
  "autonomous-generate-tests": "Autonomous agent",
  "autonomous-run-summary": "Autonomous run summary",
  "agent-brain-plan": "Agent Brain plan",
  "agent-brain-context": "Agent Brain context",
  "agent-chat": "AI Agent chat",
  "plain-english-generate-steps": "Plain-English steps",
  "plain-english-generate-data": "Plain-English test data",
  "suggest-expected-result": "Suggest expected result",
  "draft-bug-report": "Bug draft from failed step",
  "generate-bug-report": "Generate bug report",
  "bug-assistance:": "Bug report assistant",
  "bug-assistance:suggest-severity": "Suggest severity",
  "bug-assistance:developer-summary": "Developer summary",
  "explain-failure": "Explain failure",
  "diagnosis-chat": "Test Doctor chat",
  "detect-duplicate-test-case": "Duplicate check",
  "analyze-brd": "BRD requirements analysis",
}

function matches(pattern: string, command: string): boolean {
  if (pattern.endsWith(":") || pattern.endsWith("*")) {
    return command.startsWith(pattern.replace(/\*$/, ""))
  }
  return pattern === command
}

/** Skills that apply to a command, in priority order, within the size budget. */
export function skillsForCommand(command: string | undefined): QaSkill[] {
  if (!command) return []
  const picked: QaSkill[] = []
  let chars = 0
  for (const skill of QA_SKILLS) {
    if (!skill.commands.some((p) => matches(p, command))) continue
    if (picked.length >= MAX_SKILLS_PER_CALL) break
    if (chars + skill.instructions.length > MAX_SKILL_CHARS) continue
    picked.push(skill)
    chars += skill.instructions.length
  }
  return picked
}

/** The block appended to a system prompt, or "" when no skill applies. */
export function skillsBlock(skills: QaSkill[]): string {
  if (!skills.length) return ""
  const body = skills.map((s) => `### ${s.name}\n${s.instructions}`).join("\n\n")
  return (
    "\n\n## QA expertise to apply\n" +
    "Use this guidance where it fits the task. It never changes the required output format above: if the task asks for JSON, a single word or plain text only, answer exactly in that format.\n\n" +
    body
  )
}

/** System prompt with the matching skills appended. */
export function withQaSkills(system: string | undefined, command: string | undefined): string | undefined {
  const block = skillsBlock(skillsForCommand(command))
  if (!block) return system
  return (system || "You are an expert QA engineer.") + block
}
