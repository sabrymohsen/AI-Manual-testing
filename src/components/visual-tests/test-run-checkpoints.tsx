"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ScanEye } from "lucide-react"

/** Banner on a test run page when its "Visually check this screen" steps took screenshots. */
export function TestRunCheckpoints({ projectId, testRunId, live }: { projectId: string; testRunId: string; live: boolean }) {
  const [run, setRun] = useState<any>(null)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch(`/api/visual-tests/for-test-run/${testRunId}`)
        .then(r => (r.ok ? r.json() : { run: null }))
        .then(d => !cancelled && setRun(d.run))
        .catch(() => {})
    load()
    const t = live ? setInterval(load, 5000) : null
    return () => {
      cancelled = true
      if (t) clearInterval(t)
    }
  }, [testRunId, live])

  if (!run || !run.totalScreens) return null
  const waiting = run.unresolvedCount > 0
  return (
    <Link
      href={`/projects/${projectId}/visual-tests/runs/${run.id}`}
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${waiting ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
    >
      <ScanEye className="h-5 w-5 shrink-0" />
      <span className="flex-1">
        {run.totalScreens} visual checkpoint(s):{" "}
        {waiting ? `${run.unresolvedCount} look different and need your review.` : run.failedCount ? `${run.failedCount} rejected.` : run.newCount === run.totalScreens ? "first screenshots recorded as approved." : "all match."}
      </span>
      <span className="font-medium underline">Review</span>
    </Link>
  )
}
