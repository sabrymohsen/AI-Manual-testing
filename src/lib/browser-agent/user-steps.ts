/**
 * Makes a multi-user test case runnable, whatever the AI that wrote it did:
 *
 * - every user logs in before their first step ("As reviewer: Log in with
 *   {reviewer_username} and {reviewer_password}"), when the BRD has a login
 *   for them and the case doesn't already log them in;
 * - a value one step shows and a later step uses ({request_id}) is remembered
 *   right after the step that shows it.
 *
 * Pure: used when test cases are generated and again by the Browser Agent for
 * older cases.
 */
import { splitUser } from "@/lib/plain-english/grammar"

export interface CaseStep {
  action: string
  expected: string
}

const LOGIN = /\blog\s*-?\s*in\b|\bsign\s*-?\s*in\b|تسجيل\s*الدخول|سجل\s*الدخول|سجّل\s*الدخول|_password\}/i
const REMEMBER = /\b(?:remember|save|store|note)\b|احفظ|حفظ|تذكر/i
const PLACEHOLDER = /\{([\p{L}\p{N}_-]{1,40})\}/gu

/** Adds the missing login step before each user's first step. */
export function withLoginSteps(steps: CaseStep[], users: { key: string; role: string }[], arabic = false): CaseStep[] {
  const byKey = new Map(users.map((u) => [u.key.toLowerCase(), u]))
  const seen = new Set<string>()
  const out: CaseStep[] = []
  for (const s of steps) {
    const key = splitUser(s.action).user
    const u = key ? byKey.get(key.toLowerCase()) : undefined
    if (u && !seen.has(u.key.toLowerCase())) {
      seen.add(u.key.toLowerCase())
      if (!LOGIN.test(s.action)) {
        out.push(
          arabic
            ? { action: `As ${u.key}: سجل الدخول باسم المستخدم {${u.key}_username} وكلمة المرور {${u.key}_password}`, expected: `تم تسجيل دخول ${u.role} ولا تظهر رسالة خطأ في تسجيل الدخول` }
            : { action: `As ${u.key}: Log in with {${u.key}_username} and {${u.key}_password}`, expected: `${u.role} is logged in and no sign-in error is shown` }
        )
      }
    }
    out.push(s)
  }
  return out
}

/**
 * {name}s a step uses that no earlier step or test data gives: the first step
 * whose expected result shows it gets a "Remember … as {name}" step after it.
 */
export function withRememberSteps(steps: CaseStep[], known: string[], arabic = false): CaseStep[] {
  const knownSet = new Set(known.map((k) => k.toLowerCase()))
  const remembered = new Set<string>()
  for (const s of steps) {
    if (!REMEMBER.test(s.action)) continue
    for (const m of s.action.matchAll(PLACEHOLDER)) remembered.add(m[1].toLowerCase())
  }
  const used = new Set<string>()
  for (const s of steps) for (const m of s.action.matchAll(PLACEHOLDER)) used.add(m[1].toLowerCase())
  const out: CaseStep[] = []
  const added = new Set<string>()
  steps.forEach((s) => {
    out.push(s)
    for (const m of s.expected.matchAll(PLACEHOLDER)) {
      const name = m[1]
      const k = name.toLowerCase()
      if (knownSet.has(k) || remembered.has(k) || added.has(k) || !used.has(k) || k.endsWith("_username") || k.endsWith("_password")) continue
      // Only when a LATER step uses it.
      const later = steps.slice(steps.indexOf(s) + 1).some((x) => x.action.toLowerCase().includes(`{${k}}`))
      if (!later) continue
      added.add(k)
      const user = splitUser(s.action).user
      const what = name.replace(/[_-]+/g, " ")
      const action = arabic ? `احفظ قيمة ${what} الظاهرة في الصفحة باسم {${name}}` : `Remember the ${what} shown on the page as {${name}}`
      out.push({ action: user ? `As ${user}: ${action}` : action, expected: arabic ? `تم حفظ {${name}}` : `{${name}} is remembered` })
    }
  })
  return out
}
