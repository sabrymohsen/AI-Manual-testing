"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { Loader2 } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

/**
 * Side-by-side choice of two versions and a paragraph diff between them —
 * the "what changed, so what do I re-test?" view.
 */
interface Op {
  op: "same" | "added" | "removed"
  text: string
}

export function BrdCompare({
  brdId,
  versions,
}: {
  brdId: string
  versions: { id: string; versionNumber: number }[]
}) {
  const [to, setTo] = useState(versions[0]?.id ?? "")
  const [from, setFrom] = useState(versions[1]?.id ?? "")
  const [data, setData] = useState<{ ops: Op[]; added: number; removed: number; noText: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [onlyChanges, setOnlyChanges] = useState(true)

  useEffect(() => {
    if (!from || !to || from === to) return
    setLoading(true)
    setError(null)
    fetch(`/api/brds/${brdId}/compare?from=${from}&to=${to}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setData(d)
      })
      .catch((e) => setError(e.message || "Couldn't compare"))
      .finally(() => setLoading(false))
  }, [brdId, from, to])

  if (versions.length < 2) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Only one version so far — nothing to compare.</p>
  }

  // Unchanged paragraphs collapse to a count so the changes stand out.
  const rows: (Op | { op: "gap"; count: number })[] = []
  for (const o of data?.ops ?? []) {
    if (onlyChanges && o.op === "same") {
      const last = rows[rows.length - 1]
      if (last && last.op === "gap") last.count++
      else rows.push({ op: "gap", count: 1 })
    } else rows.push(o)
  }

  const select = (value: string, set: (v: string) => void, label: string) => (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => set(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.versionNumber}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {select(from, setFrom, "Compare")}
        {select(to, setTo, "with")}
        {data && !loading && (
          <span className="text-xs">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">+{data.added}</span>{" "}
            <span className="font-medium text-red-700 dark:text-red-400">−{data.removed}</span> paragraphs
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
          Only show changes
        </label>
      </div>

      {from === to ? (
        <p className="text-sm text-muted-foreground">Pick two different versions.</p>
      ) : loading ? (
        <div className="flex justify-center py-10">
          <BusyDot />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : data?.noText ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          One of these versions has no readable text (a scanned PDF?), so they can&apos;t be compared.
        </p>
      ) : data && data.added + data.removed === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No text changes between these versions.</p>
      ) : (
        <div className="space-y-1 rounded-lg border bg-card p-3 text-sm" dir="auto">
          {rows.map((r, i) =>
            r.op === "gap" ? (
              <p key={i} className="py-0.5 text-center text-xs text-muted-foreground">
                · · · {r.count} unchanged paragraph{r.count === 1 ? "" : "s"} · · ·
              </p>
            ) : (
              <p
                key={i}
                className={cn(
                  "whitespace-pre-wrap rounded px-2 py-1",
                  r.op === "added" && "border-l-2 border-emerald-500 bg-emerald-500/10",
                  r.op === "removed" && "border-l-2 border-red-500 bg-red-500/10 text-muted-foreground line-through"
                )}
              >
                <span className="sr-only">{r.op === "added" ? "Added: " : r.op === "removed" ? "Removed: " : ""}</span>
                {r.text}
              </p>
            )
          )}
        </div>
      )}
    </div>
  )
}
