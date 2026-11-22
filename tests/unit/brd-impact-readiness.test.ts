import { describe, it, expect } from "vitest"
import { impactsFor, impactMap, levelFor, mustCover, terms, type ImpactRequirement } from "@/lib/brd/impact"
import { gateFor, isBlocking, nextQuestionKey, questionsFor, stakeholderEmail } from "@/lib/brd/readiness"
import { buildGenerationContext } from "@/lib/brd/generation-context"

const req = (r: Partial<ImpactRequirement> & { id: string; key: string }): ImpactRequirement => ({
  title: r.key,
  description: "",
  acceptanceCriteria: [],
  ...r,
})

const login = req({ id: "1", key: "FR-01", title: "User logs in with email and password", description: "A registered user signs in.", priority: "Critical", parentKey: "EPIC-1" })
const errors = req({ id: "2", key: "FR-02", title: "Clear login error messages", description: "Show an error when the password is wrong (see FR-01).", parentKey: "EPIC-1", priority: "High" })
const profile = req({ id: "3", key: "FR-03", title: "Edit profile photo", description: "Upload a photo for the profile avatar.", priority: "Low", parentKey: "EPIC-2" })
const fr12 = req({ id: "4", key: "FR-12", title: "Export report", description: "CSV export of monthly report." })
const epic = req({ id: "5", key: "EPIC-1", title: "Account access", description: "Everything about logging in." })

describe("BRD impact analysis", () => {
  it("scores Likelihood x Severity into the pipeline levels", () => {
    expect(levelFor(9)).toBe("Critical")
    expect(levelFor(6)).toBe("High")
    expect(levelFor(4)).toBe("Medium")
    expect(levelFor(3)).toBe("Medium")
    expect(levelFor(2)).toBe("Low")
  })

  it("links a requirement to the one it names, with the sentence as evidence", () => {
    const out = impactsFor(errors, [login, errors, profile])
    const hit = out.find((i) => i.key === "FR-01")!
    expect(hit.relation).toBe("depends-on")
    expect(hit.likelihood).toBe(3)
    expect(hit.severity).toBe(3) // Critical / login is a core flow
    expect(hit.level).toBe("Critical")
    expect(hit.evidence).toContain("FR-01")
  })

  it("sees the reverse link: who depends on this requirement", () => {
    const hit = impactsFor(login, [login, errors]).find((i) => i.key === "FR-02")!
    expect(hit.relation).toBe("downstream")
    expect(hit.score).toBeGreaterThanOrEqual(6)
  })

  it("does not invent links between unrelated requirements", () => {
    expect(impactsFor(profile, [login, errors, profile])).toEqual([])
  })

  it("does not read FR-1 inside FR-12", () => {
    const fr1 = req({ id: "9", key: "FR-1", title: "Something" })
    const mentions12 = req({ id: "10", key: "FR-20", title: "Uses FR-12 output" })
    expect(impactsFor(mentions12, [fr1, fr12, mentions12]).map((i) => i.key)).toEqual(["FR-12"])
  })

  it("follows the document's own ids when the app key differs (REQ-1 is 'FR-90' in the text)", () => {
    const a = req({ id: "a", key: "REQ-1", title: "Customer signs in", description: "FR-90. A registered customer logs in with email and password." })
    const b = req({ id: "b", key: "REQ-2", title: "Login errors", description: "FR-91. Show an error when the password is wrong, as defined in FR-90." })
    const hit = impactsFor(b, [a, b]).find((i) => i.key === "REQ-1")!
    expect(hit.relation).toBe("depends-on")
    expect(hit.evidence).toContain("FR-90")
    // its own leading id is not a reference to itself or to others
    expect(impactsFor(a, [a, b]).find((i) => i.key === "REQ-2")?.relation).toBe("downstream")
  })

  it("links short requirements that share a meaningful share of their words", () => {
    const a = req({ id: "a", key: "REQ-1", title: "Customer signs in with email and password", description: "Wrong password 5 times locks the account." })
    const b = req({ id: "b", key: "REQ-2", title: "Clear error messages", description: "Show an error when the password is wrong or empty." })
    const hit = impactsFor(b, [a, b]).find((i) => i.key === "REQ-1")!
    expect(hit.relation).toBe("shared-data")
    expect(hit.level === "High" || hit.level === "Critical").toBe(true) // login/password = core flow
  })

  it("links stories to their epic", () => {
    const hits = impactsFor(epic, [epic, login, errors]).map((i) => [i.key, i.relation])
    expect(hits).toContainEqual(["FR-01", "child-story"])
  })

  it("ignores retired requirements and itself", () => {
    const retired = { ...errors, status: "removed" }
    expect(impactsFor(login, [login, retired])).toEqual([])
    expect(impactMap([login, retired])["2"]).toEqual([])
  })

  it("keeps only Critical/High for mandatory regression coverage", () => {
    const all = impactsFor(errors, [login, errors, profile])
    expect(mustCover(all).every((i) => i.level === "Critical" || i.level === "High")).toBe(true)
  })

  it("matches Arabic words with and without the article", () => {
    const t = terms("تسجيل الدخول للمستخدم والطلبات")
    expect(t.has("دخول")).toBe(true)
  })
})

describe("BRD readiness gate", () => {
  const qs = [
    { key: "Q-01", priority: "High", status: "Open", question: "Exact error text?", relatedKeys: ["FR-02"] },
    { key: "Q-02", priority: "Low", status: "Open", question: "Logo colour?", relatedKeys: [] },
    { key: "Q-03", priority: "Medium", status: "Answered", question: "Lockout after 5?", relatedKeys: ["FR-01"] },
  ]

  it("blocks on open High/Medium questions, not Low ones", () => {
    expect(isBlocking(qs[0])).toBe(true)
    expect(isBlocking(qs[1])).toBe(false)
    const g = gateFor(qs, null)
    expect(g.state).toBe("blocked")
    expect(g.blockingKeys).toEqual(["Q-01"])
    expect(g.open).toBe(2)
    expect(g.answered).toBe(1)
  })

  it("is ready when nothing blocks, and records an override otherwise", () => {
    expect(gateFor([qs[1], qs[2]], null).state).toBe("ready")
    const g = gateFor(qs, { byName: "Layla", why: "Demo tomorrow", at: new Date() })
    expect(g.state).toBe("override")
    expect(g.override?.byName).toBe("Layla")
  })

  it("numbers questions Q-01, Q-02 …", () => {
    expect(nextQuestionKey([])).toBe("Q-01")
    expect(nextQuestionKey(["Q-01", "Q-09", "X"])).toBe("Q-10")
  })

  it("finds the open questions of one requirement", () => {
    expect(questionsFor("fr-02", qs).map((q) => q.key)).toEqual(["Q-01"])
    expect(questionsFor("FR-01", qs)).toEqual([]) // answered
  })

  it("drafts a stakeholder email with blocking questions first", () => {
    const e = stakeholderEmail("Login BRD", qs, "Chen")
    expect(e.subject).toContain("2 open")
    expect(e.subject).toContain("1 blocking")
    expect(e.body.indexOf("Q-01")).toBeLessThan(e.body.indexOf("Q-02"))
    expect(e.body).not.toContain("Q-03")
    expect(e.body).toContain("Chen")
  })
})

describe("test generation context", () => {
  it("gives the AI the criteria, the regression targets and the open questions", () => {
    const text = buildGenerationContext(
      { ...errors, taskId: null, section: null, status: "active", priority: "High", parentKey: null, acceptanceCriteria: ["Wrong password shows an error"] },
      impactsFor(errors, [login, errors]),
      [{ key: "Q-01", question: "Exact error text?" }],
      false
    )
    expect(text).toContain("AC-1. Wrong password shows an error")
    expect(text).toContain("REGRESSION")
    expect(text).toContain("FR-01")
    expect(text).toContain("Q-01: Exact error text?")
    expect(text).toContain("do NOT assume")
  })
})

describe("AI JSON with raw line breaks", () => {
  it("is escaped so JSON.parse accepts it", async () => {
    const { sanitizeJsonControlChars } = await import("@/lib/json-sanitize")
    const raw = '[{"title":"Login\nerror","steps":[]}]'
    expect(() => JSON.parse(raw)).toThrow()
    expect(JSON.parse(sanitizeJsonControlChars(raw))[0].title).toBe("Login\nerror")
  })
})
