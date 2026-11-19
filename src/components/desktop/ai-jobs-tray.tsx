"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"

interface Job {
  id: string
  kind: string
  title: string
  status: "running" | "done" | "failed"
  link: string | null
  result: any
  error: string | null
  createdAt: string
}

/** Pages listen for this to refresh when a job finishes: window.addEventListener(AI_JOB_FINISHED, …) */
export const AI_JOB_FINISHED = "qa:ai-job-finished"
/** Pages fire this right after starting a job so the tray shows it at once. */
export const AI_JOB_STARTED = "qa:ai-job-started"

function elapsed(from: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function summary(job: Job) {
  if (job.kind === "generate-tests") {
    const n = job.result?.testCases?.length ?? 0
    return `Drafted ${n} test case${n === 1 ? "" : "s"}${job.result?.linkedToStory ? " and linked them to the story" : ""}`
  }
  return "Done"
}

/**
 * Background AI work (e.g. generating test cases) shown on every page: a small
 * panel while it runs, a message with "Open" when it's done. Lives in the
 * dashboard layout, so moving around the app never stops or hides it.
 */
export function AiJobsTray() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [, tick] = useState(0)
  const told = useRef(new Set<string>())

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-jobs", { cache: "no-store" })
      if (!res.ok) return
      const list: Job[] = (await res.json()).jobs || []
      setJobs(list.filter((j) => j.status === "running"))
      for (const j of list) {
        if (j.status === "running" || told.current.has(j.id)) continue
        told.current.add(j.id)
        const open = j.link ? { label: "Open", onClick: () => router.push(j.link!) } : undefined
        if (j.status === "done") toast.success(`${summary(j)} — ${j.title.replace(/^Generating /, "")}`, { duration: 10000, action: open })
        else toast.error(`${j.title} failed`, { description: j.error || undefined, duration: 15000, action: open })
        window.dispatchEvent(new CustomEvent(AI_JOB_FINISHED, { detail: j }))
        fetch(`/api/ai-jobs/${j.id}/seen`, { method: "POST" }).catch(() => {})
      }
    } catch {
      /* offline — next poll */
    }
  }, [router])

  useEffect(() => {
    poll()
    const onStart = () => poll()
    window.addEventListener(AI_JOB_STARTED, onStart)
    return () => window.removeEventListener(AI_JOB_STARTED, onStart)
  }, [poll])

  // Fast while something runs, slow otherwise (a job may start in another tab).
  const running = jobs.length > 0
  useEffect(() => {
    const t = setInterval(poll, running ? 3000 : 20000)
    const clock = running ? setInterval(() => tick((n) => n + 1), 1000) : null
    return () => {
      clearInterval(t)
      if (clock) clearInterval(clock)
    }
  }, [poll, running])

  if (!running) return null
  return (
    <div className="fixed bottom-4 end-4 z-50 w-80 space-y-1.5 rounded-xl border bg-card p-3 shadow-lg" role="status" aria-live="polite">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" /> AI is working — you can keep using the app
      </p>
      {jobs.map((j) => (
        <div key={j.id} className="flex items-center gap-2 text-[13px]">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          <span dir="auto" className="min-w-0 flex-1 truncate">
            {j.title}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{elapsed(j.createdAt)}</span>
        </div>
      ))}
    </div>
  )
}
