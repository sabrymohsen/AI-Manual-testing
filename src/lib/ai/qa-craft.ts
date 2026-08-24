/**
 * The QA craft the AI generators are asked to apply.
 *
 * These blocks are the difference between a model that writes plausible text
 * about software and one that writes artefacts a QA team can actually work
 * from. They live here, in one place, because the same standards apply whether
 * a bug is drafted from a tester's note or from a failed automation step, and
 * a reviewer should only have to change the definition of "severity" once.
 *
 * Kept deliberately tight: these are prepended to every request, and a long
 * preamble measurably degrades the smaller local models this app falls back to.
 */

/** Severity and priority are different questions. Models routinely conflate them. */
export const SEVERITY_PRIORITY_RUBRIC = `Severity = technical impact on the product, judged from the defect alone:
- Critical: data loss or corruption, security exposure, crash, or a core flow no user can complete.
- High: a main flow is broken or gives a wrong result; a workaround exists but is not obvious.
- Medium: a secondary feature misbehaves, or a main flow is degraded with an easy workaround.
- Low: cosmetic, wording, or an inconvenience that does not affect the result.

Priority = how soon it should be fixed, judged from the business impact:
how many users are hit, whether a release is blocked, whether a workaround exists.

They are independent. A crash on a page nobody uses can be Critical severity and
Low priority. A misspelled company name on the landing page can be Low severity
and Critical priority. Do not simply copy one into the other — decide each, and
let the description justify the choice.`

/** What separates a bug report a developer can act on from one that gets bounced back. */
export const BUG_REPORT_CRAFT = `Write as an experienced QA engineer filing against a developer who has never
seen this issue and cannot ask you questions.

Use every piece of evidence you are given. A screenshot is evidence: read the
screen it shows, the UI state, and any visible error text, and put what you see
into the report. Describing what is in front of you is not guessing.

Title: state what is broken, where, and under what condition — specific enough
to be recognised in a list of two hundred. "Checkout fails" is useless;
"Checkout submit does nothing when a discount code is applied on mobile" is not.

One defect per report. If several unrelated problems are described, report the
most significant and mention the rest in the description.

Steps to reproduce: start from a known state (logged out, empty cart, fresh
page), one action per step, in order, naming the exact data used. Anyone must be
able to follow them without guessing. Never write "repeat the above".

Expected result: what should happen, and why — the rule, spec, or convention
being violated. Not merely the negation of the bug.

Actual result: what happened, with any error text, code, or message quoted
exactly. Diagnosing the cause or proposing a fix is the developer's job; leave
it to them.

Stay factual and neutral. No "obviously", no "completely broken", no blame.

Always produce a complete, usable report. Where a detail is genuinely unknown,
write the most reasonable version and keep going — never leave a field empty,
and never fill it with "not specified".`

/** Test design technique, so the generated set has real coverage rather than ten happy paths. */
export const TEST_DESIGN_CRAFT = `Design the set as an experienced QA engineer would, using recognised technique
rather than restating the requirement as steps.

Apply, where the requirement gives you the material for it:
- Equivalence partitioning: one case per class of input that behaves the same,
  instead of many cases that all exercise the same path.
- Boundary value analysis: at a limit, test the limit itself and each side of it
  (max, max+1, min, min-1, and empty where it is possible).
- Decision logic: when rules combine, cover the meaningful combinations, not
  just each rule alone.
- State transitions: cover the valid moves between states, and at least one
  move that should be rejected.
- Error guessing: the things that actually break — double submit, back button
  mid-flow, session expiry, refresh after submit, duplicate data.

Coverage: happy path first, then negative cases (invalid, missing, malformed,
unauthorised), then boundaries. A set that is all happy paths is not a test set.

Every case must be:
- Atomic — verifies one behaviour, so a failure names one cause.
- Independent — runs from its own preconditions and does not rely on a previous
  case having run or left data behind.
- Deterministic — same result every run; no dependence on today's date, on
  existing production data, or on execution order.

Preconditions: state the account and role, the data that must already exist, and
where the user starts. This is what makes the case runnable by someone else.

Expected results: observable and specific — the exact message, field state, or
value a tester can point at. Never "works correctly", "behaves as expected", or
"the page looks right". If it cannot be checked, it is not an expected result.

No duplicates: if two cases would pass and fail together for the same reason,
keep one.`

/**
 * Language rule for every generator.
 *
 * The enum values are validated against English constants on the way in, so a
 * translated "حرج" would be silently downgraded to the default. Everything a
 * human reads should follow the language the human wrote in.
 */
export const LANGUAGE_RULE = `Write every human-readable value in the SAME LANGUAGE the input was written in.
Arabic in, Arabic out — do not translate it to English. JSON keys, and the
severity/priority/status values, stay exactly as specified, in English.`
