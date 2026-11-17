"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ClipboardPaste, Database, Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { parseStep, suggestSteps, variablesSet, variablesUsed } from "@/lib/plain-english/grammar"
import { describeStructuredStep, plainEnglishStepFields } from "@/lib/plain-english/structured"

export interface EditorStep {
  actionDescription: string
  expectedResult: string
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
  timeoutMs: number
  assertions: any[]
  actionMetadata?: any
  [key: string]: any
}

export function isPlainStep(step: { actionMetadata?: any }) {
  return !!step.actionMetadata && step.actionMetadata.plainEnglish === true
}

export function newPlainStep(sentence: string): EditorStep {
  const { step } = plainEnglishStepFields(sentence)
  return { expectedResult: "", timeoutMs: 10000, assertions: [], ...step }
}

// Names that exist without a Set variable step.
const BUILT_IN_VARIABLES = new Set(["username", "password", "response", "js-result"])

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

function StepInput({
  value,
  onChange,
  onCommit,
  onEnter,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (_v: string) => void
  onCommit?: (_v: string) => void
  onEnter?: (_v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const suggestions = useMemo(() => (open ? suggestSteps(value, 7) : []), [open, value])
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pick = (s: string) => {
    onChange(s)
    setOpen(false)
  }

  return (
    <div className="relative flex-1">
      <input
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={e => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            setOpen(false)
            onCommit?.(value)
          }, 150)
        }}
        onKeyDown={e => {
          if (open && suggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault()
            setActive(a => (e.key === "ArrowDown" ? (a + 1) % suggestions.length : (a - 1 + suggestions.length) % suggestions.length))
          } else if (e.key === "Tab" && open && suggestions.length && value.trim() && !parseStep(value).ok) {
            e.preventDefault()
            pick(suggestions[active])
          } else if (e.key === "Enter") {
            e.preventDefault()
            if (open && suggestions.length && !value.trim()) pick(suggestions[active])
            else {
              setOpen(false)
              onEnter?.(value)
            }
          } else if (e.key === "Escape") setOpen(false)
        }}
        className="h-9 w-full rounded-md border bg-card px-3 font-mono text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-indigo-100"
        spellCheck={false}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-10 z-30 max-h-64 overflow-y-auto rounded-md border bg-card py-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  pick(s)
                }}
                className={`block w-full px-3 py-1.5 text-left font-mono text-xs ${i === active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"}`}
              >
                {s}
              </button>
            </li>
          ))}
          <li className="border-t px-3 py-1 text-[10px] text-muted-foreground">↑↓ to move · Tab to use · replace the quoted words with yours</li>
        </ul>
      )}
    </div>
  )
}

export function PlainEnglishEditor({
  steps,
  onChange,
  projectId,
  onEditDetailed,
  manual = false,
}: {
  steps: EditorStep[]
  onChange: (_steps: EditorStep[]) => void
  projectId?: string
  onEditDetailed?: () => void
  /** A person runs manual steps, so automation-wording warnings don't apply. */
  manual?: boolean
}) {
  const [draft, setDraft] = useState("")
  const [openExpected, setOpenExpected] = useState<Set<number>>(new Set())
  const [panel, setPanel] = useState<null | "paste" | "ai" | "data">(null)
  const [pasteText, setPasteText] = useState("")
  const [aiInstruction, setAiInstruction] = useState("")
  const [aiUrl, setAiUrl] = useState("")
  const [aiBusy, setAiBusy] = useState(false)
  const [aiResult, setAiResult] = useState<{ steps: { text: string; ok: boolean; meaning?: string; error?: string; use: boolean }[]; note?: string | null } | null>(null)
  const [dataDescription, setDataDescription] = useState("")
  const [dataNames, setDataNames] = useState("")
  const [dataBusy, setDataBusy] = useState(false)
  const [dataValues, setDataValues] = useState<Record<string, string> | null>(null)

  const parsedRows = useMemo(() => steps.map(s => (isPlainStep(s) ? parseStep(s.actionDescription) : null)), [steps])

  // Warn about {variables} read before anything sets them.
  const unsetVariables = useMemo(() => {
    const known = new Set(BUILT_IN_VARIABLES)
    const warnings = new Map<number, string[]>()
    steps.forEach((s, i) => {
      const parsed = parsedRows[i]
      if (!parsed) return
      const missing = variablesUsed(s.actionDescription).filter(v => !known.has(v))
      if (missing.length) warnings.set(i, missing)
      if (parsed.ok) variablesSet(parsed.command).forEach(v => known.add(v))
    })
    return warnings
  }, [steps, parsedRows])

  useEffect(() => {
    if (aiUrl) return
    const firstGoto = parsedRows.find(p => p?.ok && p.command.type === "goto")
    if (firstGoto && firstGoto.ok && firstGoto.command.type === "goto" && !firstGoto.command.url.includes("{")) setAiUrl(firstGoto.command.url)
  }, [parsedRows, aiUrl])

  const setSentence = (i: number, sentence: string, commit = false) => {
    const next = [...steps]
    const { step, parsed } = plainEnglishStepFields(sentence)
    next[i] = { ...next[i], ...step, actionDescription: commit && parsed.ok ? parsed.text : sentence }
    onChange(next)
  }
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i))
  const move = (i: number, to: number) => {
    if (to < 0 || to >= steps.length) return
    const next = [...steps]
    const [m] = next.splice(i, 1)
    next.splice(to, 0, m)
    onChange(next)
  }
  const addSentences = (sentences: string[], at = steps.length) => {
    const clean = sentences.map(s => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim()).filter(Boolean)
    if (!clean.length) return
    const next = [...steps]
    next.splice(at, 0, ...clean.map(s => newPlainStep(s)))
    onChange(next)
  }

  const runAi = async () => {
    if (!projectId) return
    setAiBusy(true)
    setAiResult(null)
    try {
      const r = await post<{ steps: { text: string; ok: boolean; meaning?: string; error?: string }[]; note?: string | null }>(`/api/projects/${projectId}/plain-english/generate`, {
        instruction: aiInstruction,
        pageUrl: aiUrl || null,
        previousSteps: steps.map(s => s.actionDescription).filter(Boolean).slice(-40),
      })
      setAiResult({ steps: r.steps.map(s => ({ ...s, use: s.ok })), note: r.note })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAiBusy(false)
    }
  }

  const runData = async () => {
    if (!projectId) return
    setDataBusy(true)
    setDataValues(null)
    try {
      const r = await post<{ values: Record<string, string> }>(`/api/projects/${projectId}/plain-english/test-data`, {
        description: dataDescription,
        names: dataNames.split(/[,\s]+/).map(n => n.trim()).filter(Boolean),
      })
      setDataValues(r.values)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDataBusy(false)
    }
  }

  const understood = parsedRows.filter(p => p?.ok).length
  const notUnderstood = parsedRows.filter(p => p && !p.ok).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          {manual ? "Write each step the way a tester should do it." : "Write each step as a sentence."} {!manual && steps.length > 0 && (notUnderstood ? <span className="text-amber-700">{notUnderstood} step(s) need rewording.</span> : understood ? <span className="text-emerald-700">All {understood} step(s) understood.</span> : null)}
        </p>
        <Button type="button" size="sm" variant={panel === "paste" ? "default" : "outline"} onClick={() => setPanel(p => (p === "paste" ? null : "paste"))}>
          <ClipboardPaste /> Paste steps
        </Button>
        {projectId && (
          <>
            <Button type="button" size="sm" variant={panel === "ai" ? "default" : "outline"} onClick={() => setPanel(p => (p === "ai" ? null : "ai"))}>
              <Sparkles /> Write with AI
            </Button>
            <Button type="button" size="sm" variant={panel === "data" ? "default" : "outline"} onClick={() => setPanel(p => (p === "data" ? null : "data"))}>
              <Database /> Make up test data
            </Button>
          </>
        )}
      </div>

      {panel === "paste" && (
        <div className="space-y-2 rounded-lg border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">One step per line. Numbering and bullets are removed.</p>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={6} className="w-full rounded-md border bg-card p-2 font-mono text-xs" placeholder={'Go to "https://example.com/login"\nType "demo user" in the "Username" field\nClick "Sign in"'} />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              addSentences(pasteText.split(/\r?\n/))
              setPasteText("")
              setPanel(null)
            }}
            disabled={!pasteText.trim()}
          >
            <Plus /> Add {pasteText.split(/\r?\n/).filter(l => l.trim()).length || ""} steps
          </Button>
        </div>
      )}

      {panel === "ai" && (
        <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">Describe what to do. The AI reads the page, writes the steps, and each step is checked before you insert it. Runs never call the AI.</p>
          <textarea value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} rows={3} className="w-full rounded-md border bg-card p-2 text-sm" placeholder="Fill out the contact form as a QA manager working at Acme and submit it" />
          <input value={aiUrl} onChange={e => setAiUrl(e.target.value)} className="h-8 w-full rounded-md border bg-card px-2 text-xs" placeholder="Page the steps are for (optional, lets the AI use the real labels)" />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={runAi} disabled={aiBusy || aiInstruction.trim().length < 3}>
              {aiBusy ? <Loader2 className="animate-spin" /> : <Wand2 />} {aiBusy ? "Writing steps…" : "Write steps"}
            </Button>
            {aiBusy && <span className="text-xs text-muted-foreground">This can take a minute or two with a reasoning model.</span>}
          </div>
          {aiResult && (
            <div className="space-y-1 rounded-md border bg-card p-2">
              {aiResult.note && <p className="text-xs text-amber-700">{aiResult.note}</p>}
              {aiResult.steps.map((s, i) => (
                <label key={i} className="flex items-start gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
                  <input type="checkbox" checked={s.use} onChange={e => setAiResult(r => r && { ...r, steps: r.steps.map((x, j) => (j === i ? { ...x, use: e.target.checked } : x)) })} className="mt-0.5 accent-indigo-600" />
                  <span className="flex-1">
                    <span className="font-mono text-foreground">{s.text}</span>
                    <span className={`block ${s.ok ? "text-muted-foreground" : "text-amber-700"}`}>{s.ok ? s.meaning : `Not understood: ${s.error}`}</span>
                  </span>
                </label>
              ))}
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  addSentences(aiResult.steps.filter(s => s.use).map(s => s.text))
                  setAiResult(null)
                  setPanel(null)
                }}
                disabled={!aiResult.steps.some(s => s.use)}
              >
                <Plus /> Insert {aiResult.steps.filter(s => s.use).length} step(s)
              </Button>
            </div>
          )}
        </div>
      )}

      {panel === "data" && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <p className="text-xs text-muted-foreground">Describe a person or record. Values are made once, now, and saved as steps — every run uses the same data.</p>
          <input value={dataDescription} onChange={e => setDataDescription(e.target.value)} className="h-8 w-full rounded-md border bg-card px-2 text-sm" placeholder="A French fashion designer applying for a business account" />
          <input value={dataNames} onChange={e => setDataNames(e.target.value)} className="h-8 w-full rounded-md border bg-card px-2 text-xs" placeholder="Names to fill (optional): firstName, lastName, email, phone" />
          <Button type="button" size="sm" onClick={runData} disabled={dataBusy || dataDescription.trim().length < 3}>
            {dataBusy ? <Loader2 className="animate-spin" /> : <Wand2 />} {dataBusy ? "Making data…" : "Make data"}
          </Button>
          {dataValues && (
            <div className="space-y-1 rounded-md border bg-card p-2 font-mono text-xs">
              {Object.entries(dataValues).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-primary">{`{${k}}`}</span>
                  <span className="truncate text-foreground">{v}</span>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                className="mt-1"
                onClick={() => {
                  // Before the first step, so every later step can read them.
                  addSentences(Object.entries(dataValues).map(([k, v]) => `Set variable ${k} = "${v.replace(/"/g, '\\"')}"`), 0)
                  toast.success("Added at the top. Use them as {name} in your steps.")
                  setDataValues(null)
                  setPanel(null)
                }}
              >
                <Plus /> Add as steps
              </Button>
            </div>
          )}
        </div>
      )}

      <ol className="space-y-2">
        {steps.map((step, i) => {
          const parsed = parsedRows[i]
          if (!parsed) {
            const sentence = describeStructuredStep(step)
            return (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/50 p-2">
                <span className="mt-2 w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
                <div className="flex-1 text-sm">
                  <p className="text-foreground">{step.actionDescription || step.actionType}</p>
                  <p className="text-xs text-muted-foreground">Detailed step ({step.actionType})</p>
                </div>
                {sentence ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onChange(steps.map((s, j) => (j === i ? { ...s, ...newPlainStep(sentence), expectedResult: s.expectedResult, assertions: s.assertions } : s)))}>
                    Convert
                  </Button>
                ) : (
                  onEditDetailed && (
                    <Button type="button" size="sm" variant="ghost" onClick={onEditDetailed}>
                      Edit
                    </Button>
                  )
                )}
                <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} aria-label="Delete step">
                  <Trash2 className="text-rose-600" />
                </Button>
              </li>
            )
          }
          const missing = unsetVariables.get(i)
          return (
            <li key={i} className="rounded-lg border bg-card p-2">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
                <StepInput value={step.actionDescription} onChange={v => setSentence(i, v)} onCommit={v => setSentence(i, v, true)} />
                <div className="flex">
                  <Button type="button" size="icon" variant="ghost" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">
                    <ChevronUp />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => move(i, i + 1)} disabled={i === steps.length - 1} aria-label="Move down">
                    <ChevronDown />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} aria-label="Delete step">
                    <Trash2 className="text-rose-600" />
                  </Button>
                </div>
              </div>
              <div className="ml-8 mt-1 space-y-1 text-xs">
                {manual && !parsed.ok ? null : parsed.ok ? (
                  <p className="flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {parsed.meaning}
                  </p>
                ) : (
                  <p className="flex flex-wrap items-center gap-1 text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> {parsed.error}
                    {parsed.suggestion && (
                      <button type="button" onClick={() => setSentence(i, parsed.suggestion!, true)} className="rounded border border-amber-300 px-1.5 py-0.5 font-mono text-[11px] hover:bg-amber-50">
                        Try: {parsed.suggestion}
                      </button>
                    )}
                  </p>
                )}
                {missing && <p className="text-muted-foreground">Reads {missing.map(m => `{${m}}`).join(", ")} — set it in an earlier step or in the project&apos;s test data.</p>}
                {openExpected.has(i) || step.expectedResult ? (
                  <input
                    value={step.expectedResult}
                    onChange={e => onChange(steps.map((s, j) => (j === i ? { ...s, expectedResult: e.target.value } : s)))}
                    placeholder="Expected result (optional, shown in reports)"
                    className="h-7 w-full rounded border px-2 text-xs"
                  />
                ) : (
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setOpenExpected(s => new Set(s).add(i))}>
                    + expected result
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex items-center gap-2 rounded-lg border border-dashed p-2">
        <span className="w-6 text-right text-xs text-muted-foreground">{steps.length + 1}</span>
        <StepInput
          value={draft}
          onChange={setDraft}
          placeholder='Type an action, e.g. Click "Sign in" — press Enter to add'
          onEnter={v => {
            if (!v.trim()) return
            addSentences([v])
            setDraft("")
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (!draft.trim()) return
            addSentences([draft])
            setDraft("")
          }}
        >
          <Plus /> Add
        </Button>
      </div>
      {draft.trim() && !manual && (
        <p className="ml-8 text-xs">
          {(() => {
            const p = parseStep(draft)
            return p.ok ? <span className="text-emerald-700">{p.meaning}</span> : <span className="text-amber-700">{p.error}</span>
          })()}
        </p>
      )}
    </div>
  )
}
