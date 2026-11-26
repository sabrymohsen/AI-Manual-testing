"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { KanbanSquare, Loader2, X } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

export interface BoardReq {
  id: string
  key: string
  title: string
  type: string | null
  parentKey: string | null
  status: string
  story: { id: string; key: string } | null
  epic: { id: string; title: string } | null
}

const isEpic = (t: string | null) => /^(epic|ملحمة)$/i.test((t ?? "").trim())
const isStory = (t: string | null) => !t || /^(user story|functional|قصة مستخدم|وظيفي)$/i.test(t.trim())

export function boardSummary(r: { storiesCreated: number; epicsCreated: number; alreadyOnBoard: number; testCasesLinked: number }) {
  const parts = [`${r.storiesCreated} stor${r.storiesCreated === 1 ? "y" : "ies"}`, `${r.epicsCreated} epic${r.epicsCreated === 1 ? "" : "s"}`]
  let s = `Created ${parts.join(" and ")} on the Scrum board`
  if (r.testCasesLinked) s += `, ${r.testCasesLinked} test case link${r.testCasesLinked === 1 ? "" : "s"} copied`
  if (r.alreadyOnBoard) s += ` (${r.alreadyOnBoard} already there)`
  return s
}

/**
 * Pick the BRD's epics and user stories and create them on the Scrum board.
 * Epics and stories are ticked by default; loose rules/fields aren't, since
 * they usually belong inside a story as acceptance criteria.
 */
export function BrdToBoard({
  brdId,
  projectId,
  reqs,
  onDone,
  onClose,
}: {
  brdId: string
  projectId: string
  reqs: BoardReq[]
  onDone: () => void
  onClose: () => void
}) {
  const pending = useMemo(
    () => reqs.filter((r) => r.status !== "removed" && !(isEpic(r.type) ? r.epic : r.story)),
    [reqs]
  )
  const [picked, setPicked] = useState<Set<string>>(() => new Set(pending.filter((r) => isEpic(r.type) || isStory(r.type)).map((r) => r.id)))
  const [busy, setBusy] = useState(false)
  const onBoard = reqs.filter((r) => r.story).length

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  async function send() {
    setBusy(true)
    try {
      const res = await fetch(`/api/brds/${brdId}/board`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementIds: Array.from(picked) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Couldn't create the stories")
      toast.success(boardSummary(d), {
        action: { label: "Open board", onClick: () => window.open(`/projects/${projectId}/scrum?view=backlog`, "_self") },
      })
      onDone()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Create on Scrum board</p>
          <p className="text-xs text-muted-foreground">
            Epics become board epics; each user story goes to the backlog under its epic, with its acceptance criteria. Stories with no epic go
            under one epic named after this BRD. Tests linked to a requirement are linked to its story.
            {onBoard > 0 && <> {onBoard} already on the board.</>}
          </p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {pending.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          Everything is already on the board.{" "}
          <Link href={`/projects/${projectId}/scrum`} className="text-primary hover:underline">
            Open board
          </Link>
        </p>
      ) : (
        <>
          <div className="flex gap-3 text-xs">
            <button className="text-primary hover:underline" onClick={() => setPicked(new Set(pending.map((r) => r.id)))}>
              Select all
            </button>
            <button
              className="text-primary hover:underline"
              onClick={() => setPicked(new Set(pending.filter((r) => isEpic(r.type) || isStory(r.type)).map((r) => r.id)))}
            >
              Epics and stories only
            </button>
            <button className="text-primary hover:underline" onClick={() => setPicked(new Set())}>
              None
            </button>
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border bg-card p-1">
            {pending.map((r) => (
              <label
                key={r.id}
                className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent", !isEpic(r.type) && r.parentKey && "ps-6")}
              >
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="rounded" />
                <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{r.key}</span>
                <span dir="auto" className={cn("min-w-0 flex-1 truncate", isEpic(r.type) && "font-semibold")}>
                  {r.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{r.type ?? "Requirement"}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md border px-3 py-1 text-xs font-medium">
              Cancel
            </button>
            <button
              onClick={send}
              disabled={busy || picked.size === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KanbanSquare className="h-3.5 w-3.5" />}
              Create {picked.size} on board
            </button>
          </div>
        </>
      )}
    </div>
  )
}
