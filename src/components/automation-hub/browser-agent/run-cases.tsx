"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, ExternalLink, Loader2, MinusCircle, Play, Search, Square, XCircle } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import { AgentBrowser, fillData, parseTestData, sleep } from "@/lib/browser-agent/client"
import { parseSnapshot, redactSecrets } from "@/lib/browser-agent/snapshot"
import { splitUser } from "@/lib/plain-english/grammar"
import { withLoginSteps, withRememberSteps } from "@/lib/browser-agent/user-steps"
import { LiveView, type AgentSettings } from "./browser-agent"

interface CaseStep {
  action: string
  expected: string
}
interface TestCaseItem {
  id: string
  title: string
  preconditions?: string | null
  /** The BRDs it was generated from: their test users log in for the run. */
  brdIds?: string[]
  steps: CaseStep[]
}
interface BrdUsers {
  id: string
  name: string
  users: { key: string; role: string; loginUrl: string | null; hasPassword: boolean }[]
}

/** A case's users from its BRDs (the first BRD wins a shared key). */
function caseUsers(tc: TestCaseItem, brds: BrdUsers[]) {
  const out: (BrdUsers["users"][number] & { brd: string })[] = []
  for (const id of tc.brdIds || []) {
    const b = brds.find((x) => x.id === id)
    for (const u of b?.users || []) if (!out.some((o) => o.key.toLowerCase() === u.key.toLowerCase())) out.push({ ...u, brd: b!.name })
  }
  return out
}
type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped"
interface StepRun {
  action: string
  expected: string
  status: StepStatus
  actual?: string
  actions: string[]
  durationMs: number
  screenshot?: string
}
interface CaseRun {
  id: string | null
  title: string
  status: "queued" | "running" | "passed" | "failed" | "stopped" | "error"
  steps: StepRun[]
  executionId?: string
  error?: string
}

/** "Action | Expected result" per line → steps. */
function parseAdHoc(text: string): CaseStep[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [action, ...rest] = l.split("|")
      return { action: action.trim(), expected: rest.join("|").trim() }
    })
    .filter((s) => s.action)
}

export function RunCasesPanel({ projectId, settings, onOpenRun }: { projectId: string; settings: AgentSettings; onOpenRun: (id: string) => void }) {
  const [cases, setCases] = useState<TestCaseItem[] | null>(null)
  const [brds, setBrds] = useState<BrdUsers[]>([])
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [adHoc, setAdHoc] = useState(false)
  const [adHocTitle, setAdHocTitle] = useState("")
  const [adHocSteps, setAdHocSteps] = useState("")
  const [runs, setRuns] = useState<CaseRun[]>([])
  const [running, setRunning] = useState(false)
  const [shot, setShot] = useState<string>()
  const [page, setPage] = useState<{ title: string; url: string } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const stopRef = useRef(false)
  // One browser per user of the running test ("As reviewer: …" steps).
  const browsersRef = useRef<Map<string, AgentBrowser>>(new Map())

  useEffect(() => {
    fetch(`/api/hub/browser-agent/cases?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d) => {
        setCases(d.cases || [])
        setBrds(d.brds || [])
      })
      .catch(() => setCases([]))
  }, [projectId])

  // Leaving the tab closes the agent's browser.
  useEffect(() => () => void closeAll(browsersRef.current), [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (cases || []).filter((c) => !q || c.title.toLowerCase().includes(q))
  }, [cases, search])

  const say = (line: string) => setLog((l) => [...l.slice(-300), line])
  const patchRun = (i: number, fn: (r: CaseRun) => CaseRun) => setRuns((rs) => rs.map((r, j) => (j === i ? fn(r) : r)))

  const start = async () => {
    const list: TestCaseItem[] = adHoc
      ? [{ id: "", title: adHocTitle.trim() || "Quick test", steps: parseAdHoc(adHocSteps) }]
      : (cases || []).filter((c) => picked.includes(c.id))
    if (!list.length || list.some((c) => !c.steps.length)) return toast.error(adHoc ? "Write at least one step" : "Pick at least one test case")
    const hasStart = /^https?:\/\//i.test(settings.startUrl.trim())
    const firstUserHasLogin = (tc: TestCaseItem) => {
      const first = splitUser(tc.steps[0]?.action || "").user
      return !!caseUsers(tc, brds).find((u) => u.key.toLowerCase() === (first || "").toLowerCase())?.loginUrl
    }
    if (!hasStart && !list.every(firstUserHasLogin)) return toast.error("Enter the start page address (https://…)")
    const { data, secrets } = parseTestData(settings.testData)
    const batchId = list.length > 1 ? crypto.randomUUID() : undefined

    stopRef.current = false
    setRunning(true)
    setLog([])

    // Cases from a BRD: each user logs in first, values passed between users are remembered.
    list.forEach((tc, i) => {
      const users = caseUsers(tc, brds)
      if (!users.length) return
      const ar = /[؀-ۿ]/.test(tc.steps.map((s) => s.action).join(" "))
      list[i] = { ...tc, steps: withLoginSteps(withRememberSteps(tc.steps, Object.keys(data), ar), users, ar) }
    })
    setRuns(list.map((c) => ({ id: c.id || null, title: c.title, status: "queued", steps: c.steps.map((s) => ({ ...s, status: "pending", actions: [], durationMs: 0 })) })))

    for (let ci = 0; ci < list.length; ci++) {
      if (stopRef.current) {
        patchRun(ci, (r) => ({ ...r, status: "stopped" }))
        continue
      }
      const tc = list[ci]
      const caseStarted = Date.now()
      // The BRD's users: logins fill {reviewer_username} / {reviewer_password}.
      const users = caseUsers(tc, brds)
      const usedKeys = Array.from(new Set(tc.steps.map((s) => splitUser(s.action).user).filter(Boolean) as string[]))
      const missing = users.length ? usedKeys.filter((k) => !users.some((u) => u.key.toLowerCase() === k.toLowerCase())) : []
      const noPassword = users.filter((u) => !u.hasPassword && usedKeys.some((k) => k.toLowerCase() === u.key.toLowerCase()))
      if (missing.length || noPassword.length) {
        const where = users[0]?.brd ? ` Add ${missing.length + noPassword.length === 1 ? "it" : "them"} in BRD Hub → ${users[0].brd} → Test users.` : ""
        const msg = [missing.length ? `No login for: ${missing.join(", ")}.` : "", noPassword.length ? `No password for: ${noPassword.map((u) => u.key).join(", ")}.` : ""].filter(Boolean).join(" ") + where
        patchRun(ci, (r) => ({ ...r, status: "error", error: msg }))
        say(`✗ ${tc.title}: ${msg}`)
        continue
      }
      const caseData: Record<string, string> = { ...data }
      const caseSecrets: Record<string, string> = { ...secrets }
      for (const u of users) {
        // Names the AI may use; on the server the values are filled in there.
        caseData[`${u.key}_username`] ??= `{${u.key}_username}`
        caseData[`${u.key}_password`] ??= `{${u.key}_password}`
        caseSecrets[`${u.key}_password`] ??= ""
      }
      if (users.length && settings.runsOn === "computer") {
        // On this computer the desktop app types the login, so it needs the values.
        const res = await fetch("/api/hub/browser-agent/logins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, brdIds: tc.brdIds }),
        })
        const d = await res.json().catch(() => ({}))
        for (const u of d.users || []) {
          caseData[`${u.key}_username`] = u.username
          caseData[`${u.key}_password`] = u.password
          if (u.password) caseSecrets[`${u.key}_password`] = u.password
        }
      }
      const browsers = new Map<string, AgentBrowser>()
      browsersRef.current = browsers
      // Values the agent copied from the page ("Remember the request number as {request_id}").
      const remembered: Record<string, string> = {}
      let user = splitUser(tc.steps[0]?.action || "").user || ""
      const show = (b: AgentBrowser) => b.page && setPage({ ...b.page, title: user ? `[${user}] ${b.page.title}` : b.page.title })
      const results: StepRun[] = tc.steps.map((s) => ({ ...s, status: "pending", actions: [], durationMs: 0 }))
      const caseLog: string[] = []
      const note = (line: string) => {
        caseLog.push(line)
        say(line)
      }
      patchRun(ci, (r) => ({ ...r, status: "running" }))
      note(`▶ ${tc.title}`)
      try {
        for (let si = 0; si < tc.steps.length; si++) {
          const split = splitUser(tc.steps[si].action)
          if (split.user) user = split.user
          const step = { action: split.rest || tc.steps[si].action, expected: tc.steps[si].expected }
          const sr = results[si]
          if (stopRef.current) break
          let browser = browsers.get(user)
          if (!browser) {
            browser = new AgentBrowser(projectId, settings.runsOn, settings.headed)
            browser.brdIds = tc.brdIds || []
            browsers.set(user, browser)
            const login = users.find((u) => u.key.toLowerCase() === user.toLowerCase())
            const url = login?.loginUrl || settings.startUrl.trim()
            if (!/^https?:\/\//i.test(url)) throw new Error(`No page to open for ${user || "the test"}: set the start page, or ${user ? `${user}'s` : "the user's"} login page in the BRD's Test users.`)
            if (user) note(`  ⇢ ${user}${login ? ` (${login.role})` : ""}: own browser${login?.loginUrl ? " at their login page" : ""}`)
            await browser.openAt(url)
            show(browser)
            setShot(await browser.screenshot())
          }
          sr.status = "running"
          patchRun(ci, (r) => ({ ...r, steps: results.map((x) => ({ ...x })) }))
          note(`  ${si + 1}. ${step.action}`)
          const t0 = Date.now()
          const done: { action: string; error?: string }[] = []
          for (;;) {
            if (stopRef.current) break
            const snap = redactSecrets(await browser.snapshot(), caseSecrets)
            const ask = () => fetch("/api/hub/browser-agent/next", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId,
                testTitle: tc.title,
                previous: results.slice(0, si).map((p) => ({ action: p.action, passed: p.status === "passed" })),
                step,
                user: user || undefined,
                page: { ...browser.page, snapshot: snap },
                done,
                dataNames: Object.keys(caseData),
                remembered,
              }),
            })
            let res = await ask()
            let next = await res.json().catch(() => ({}))
            // A slow local model can time out once; ask again before giving up.
            if (!res.ok && /time ?out|aborted/i.test(String(next.error))) {
              note("     · the AI was slow, asking again")
              res = await ask()
              next = await res.json().catch(() => ({}))
            }
            if (!res.ok) throw new Error(next.error || "The AI call failed")
            // "reviewer_password" written without braces means the placeholder.
            if (typeof next.value === "string" && Object.prototype.hasOwnProperty.call({ ...caseData, ...remembered }, next.value.trim())) next.value = `{${next.value.trim()}}`
            if (next.kind === "done") {
              sr.status = next.passed ? "passed" : "failed"
              sr.actual = next.actual
              break
            }
            if (next.kind === "remember") {
              const flat = (t: string) => t.replace(/\s+/g, " ").trim()
              const ok = flat(snap).includes(flat(next.value))
              const desc = `remember {${next.name}} = "${next.value}"`
              const error = ok ? undefined : "that text isn't on the page — copy it exactly from the outline"
              if (ok) remembered[next.name] = next.value
              done.push({ action: desc, error })
              sr.actions.push(error ? `${desc} — failed: ${error}` : desc)
              note(`     · ${desc}${error ? ` ✗ ${error}` : ""}`)
              continue
            }
            const els = parseSnapshot(snap)
            const el = next.ref ? els.find((e) => e.ref === next.ref) : null
            const label = el ? `${el.role} "${el.name || el.value || next.ref}"` : ""
            const shownValue = next.value && !Object.keys(caseSecrets).some((n) => next.value.includes(`{${n}}`)) ? ` "${next.value}"` : next.value ? " (secret)" : ""
            const desc = `${next.cmd}${label ? ` ${label}` : ""}${next.cmd === "fill" || next.cmd === "select" || next.cmd === "press" || next.cmd === "goto" ? shownValue : ""}`
            let error: string | undefined
            if (next.cmd === "wait") {
              await sleep(Math.min(5, Math.max(1, Number(next.value) || 1)) * 1000)
            } else {
              // Login placeholders stay as written for the server to fill (their value is the placeholder itself).
              // A {name} nobody gave a value ("{return_title}"): type a readable sample and remember it.
              if (next.value && ["fill", "type"].includes(next.cmd)) {
                for (const m of String(next.value).matchAll(/\{([\p{L}\p{N}_ -]{1,40})\}/gu)) {
                  const n = m[1]
                  if (n in caseData || n in remembered) continue
                  remembered[n] = `Test ${n.replace(/[_-]+/g, " ").trim()} ${String(Date.now()).slice(-4)}`
                  note(`     · {${n}} has no value: using "${remembered[n]}"`)
                }
              }
              const values = { ...caseData, ...remembered }
              const args = next.ref ? [next.ref, ...(next.value !== undefined && ["fill", "select"].includes(next.cmd) ? [fillData(next.value, values)] : [])] : next.value ? [fillData(next.value, values)] : []
              const r = await browser.exec(next.cmd, args).catch((e: any) => ({ ok: false, error: e?.message }) as any)
              if (!r.ok) error = r.error || "failed"
              show(browser)
            }
            // The same action again on an unchanged page: tell the AI it did nothing.
            // (Clicks only: a filled password field looks the same in the outline.)
            if (!error && (next.cmd === "click" || next.cmd === "dblclick")) {
              const after = redactSecrets(await browser.snapshot().catch(() => snap), caseSecrets)
              if (after === snap) error = "nothing changed on the page — don't repeat it"
            }
            done.push({ action: desc, error })
            sr.actions.push(error ? `${desc} — failed: ${error.slice(0, 200)}` : desc)
            note(`     · ${desc}${error ? ` ✗ ${error.slice(0, 160)}` : ""}`)
            patchRun(ci, (r) => ({ ...r, steps: results.map((x) => ({ ...x, actions: [...x.actions] })) }))
          }
          sr.durationMs = Date.now() - t0
          sr.screenshot = await browser.screenshot()
          if (sr.screenshot) setShot(sr.screenshot)
          if (sr.status === "running") sr.status = "skipped"
          note(`     ${sr.status === "passed" ? "✓" : "✗"} ${sr.actual || sr.status}`)
          patchRun(ci, (r) => ({ ...r, steps: results.map((x) => ({ ...x })) }))
          if (sr.status !== "passed") break
        }
        for (const r of results) if (r.status === "pending" || r.status === "running") r.status = "skipped"
        const failed = results.some((r) => r.status === "failed")
        const stopped = stopRef.current && !failed
        await closeAll(browsers)
        if (Object.keys(remembered).length) note(`Remembered: ${Object.entries(remembered).map(([k, v]) => `{${k}} = "${v}"`).join(", ")}`)

        const save = await fetch("/api/hub/browser-agent/results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            testCaseId: tc.id || undefined,
            title: tc.title,
            runsOn: settings.runsOn,
            batchId,
            startUrl: settings.startUrl.trim(),
            durationMs: Date.now() - caseStarted,
            log: caseLog.join("\n"),
            steps: results.map((r) => ({
              action: r.action,
              expected: r.expected,
              status: stopped && r.status === "skipped" ? "skipped" : r.status,
              actual: r.actual || (r.status === "skipped" ? "Not run" : undefined),
              durationMs: r.durationMs,
              screenshot: r.screenshot,
            })),
          }),
        })
        const saved = await save.json().catch(() => ({}))
        if (!save.ok) throw new Error(saved.error || "Couldn't save the results")
        patchRun(ci, (r) => ({ ...r, status: stopped ? "stopped" : failed ? "failed" : "passed", executionId: saved.executionId, steps: results.map((x) => ({ ...x })) }))
        note(`${failed ? "✗ Failed" : stopped ? "■ Stopped" : "✓ Passed"} — saved to Runs`)
      } catch (e: any) {
        await closeAll(browsers)
        note(`✗ ${e?.message || e}`)
        patchRun(ci, (r) => ({ ...r, status: "error", error: e?.message || String(e), steps: results.map((x) => ({ ...x })) }))
        if (/AI provider|desktop app|server is already running/i.test(String(e?.message))) {
          toast.error(e.message)
          stopRef.current = true
        }
      }
    }
    browsersRef.current = new Map()
    setRunning(false)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">{adHoc ? "Quick test" : "Test cases"}</p>
            <button onClick={() => setAdHoc((v) => !v)} className="text-xs font-medium text-primary hover:underline" disabled={running}>
              {adHoc ? "Pick from test cases" : "Write steps instead"}
            </button>
          </div>
          {adHoc ? (
            <div className="space-y-2">
              <input value={adHocTitle} onChange={(e) => setAdHocTitle(e.target.value)} placeholder="Test name" className="h-8 w-full rounded-md border bg-card px-2 text-xs font-normal" dir="auto" />
              <textarea
                value={adHocSteps}
                onChange={(e) => setAdHocSteps(e.target.value)}
                rows={7}
                dir="auto"
                placeholder={
                  "One step per line: action | expected result\nAs submitter: Log in with {submitter_user} and {submitter_password} | Home page opens\nAs submitter: Send a new request and remember its number as {request_id} | \"Request sent\" is shown\nAs reviewer: Log in with {reviewer_user} and {reviewer_password} | Inbox opens\nAs reviewer: Open request {request_id} and approve it | Status is \"Approved\""
                }
                className="w-full rounded-md border bg-card px-2 py-2 text-xs font-normal"
              />
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search test cases" className="h-8 w-full rounded-md border bg-card pl-8 pr-2 text-xs font-normal" />
              </div>
              <div className="max-h-80 overflow-auto rounded-md border">
                {cases === null ? (
                  <p className="flex items-center gap-2 p-3 text-xs font-normal text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </p>
                ) : shown.length === 0 ? (
                  <p className="p-3 text-xs font-normal text-muted-foreground">{cases.length ? "No match." : "This project has no test cases with steps yet. Write steps instead."}</p>
                ) : (
                  shown.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-start gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={picked.includes(c.id)}
                        disabled={running}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground" dir="auto">
                          {c.title}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {c.steps.length} steps
                          {caseUsers(c, brds).length > 0 && (
                            <span dir="auto">
                              {" · "}
                              {caseUsers(c, brds)
                                .filter((u) => c.steps.some((s) => splitUser(s.action).user?.toLowerCase() === u.key.toLowerCase()))
                                .map((u) => u.role)
                                .join(", ") || `${caseUsers(c, brds).length} BRD users`}
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </>
          )}
          <div className="mt-3 flex items-center gap-2">
            {running ? (
              <Button size="sm" variant="outline" className="text-rose-600" onClick={() => (stopRef.current = true)}>
                <Square className="h-3.5 w-3.5" /> Stop after this action
              </Button>
            ) : (
              <Button size="sm" onClick={start}>
                <Play className="h-4 w-4" /> {adHoc ? "Run with AI" : `Run ${picked.length || ""} with AI`}
              </Button>
            )}
            <span className="text-xs font-normal text-muted-foreground">Each step: the AI acts, then checks the expected result.</span>
          </div>
          <p className="mt-2 text-xs font-normal text-muted-foreground">
            Cases made from a BRD log in with that BRD&apos;s test users (BRD Hub → Test users); no test data needed.
            <br />
            More than one user? Start a step with <span className="font-mono">As reviewer:</span> — each user gets their own browser and login, and stays signed in.
            Say “remember the request number as {"{request_id}"}” to use a value from the page in later steps.
          </p>
        </div>

        {runs.length > 0 && (
          <div className="space-y-2">
            {runs.map((r, i) => (
              <CaseCard key={i} run={r} onOpenRun={onOpenRun} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <LiveView shot={shot} page={page} busy={running} note="Pick test cases and press Run — the agent's browser shows here." />
        {log.length > 0 && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100" dir="auto">
            {log.join("\n")}
          </pre>
        )}
      </div>
    </div>
  )
}

function closeAll(browsers: Map<string, AgentBrowser>) {
  return Promise.all(Array.from(browsers.values()).map((b) => b.close()))
}

function StepIcon({ s }: { s: StepStatus }) {
  if (s === "passed") return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
  if (s === "failed") return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
  if (s === "running") return <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
  return <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

function CaseCard({ run, onOpenRun }: { run: CaseRun; onOpenRun: (id: string) => void }) {
  const tone =
    run.status === "passed"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : run.status === "failed" || run.status === "error"
        ? "text-rose-700 bg-rose-50 border-rose-200"
        : "text-muted-foreground bg-muted border-border"
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground" dir="auto">
          {run.title}
        </span>
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{run.status === "error" ? "couldn't run" : run.status}</span>
        {run.executionId && (
          <button onClick={() => onOpenRun(run.executionId!)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Open run <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
      {run.error && <p className="mt-1 text-xs font-normal text-rose-700">{run.error}</p>}
      <ol className="mt-2 space-y-2">
        {run.steps.map((s, i) => (
          <li key={i} className="text-xs">
            <div className="flex items-start gap-2">
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <StepIcon s={s.status} />
              <span className="min-w-0 flex-1 font-normal text-foreground" dir="auto">
                {s.action}
              </span>
            </div>
            {s.actual && (
              <p className={`ml-10 text-xs font-normal ${s.status === "failed" ? "text-rose-700" : "text-muted-foreground"}`} dir="auto">
                {s.actual}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
