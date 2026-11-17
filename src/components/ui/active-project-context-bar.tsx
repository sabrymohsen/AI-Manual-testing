import React from "react"
import { useProjectIntegration } from "@/hooks/use-project-integration"
import { useProjectSummary } from "@/hooks/use-metrics"
import { Globe, ClipboardList, Bug, ShieldAlert, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface ActiveProjectContextBarProps {
  projectId: string
}

export function ActiveProjectContextBar({ projectId }: ActiveProjectContextBarProps) {
  const router = useRouter()
  const { summary, loading } = useProjectSummary(projectId)
  const { name: trackerName } = useProjectIntegration(projectId)

  if (loading || !summary) {
    return (
      <div className="h-12 border rounded-xl bg-muted/50 animate-pulse mb-6 flex items-center px-4 justify-between" />
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 border rounded-xl bg-slate-500/[0.02] mb-6 text-xs font-semibold select-none shadow-sm border-border">
      <div className="flex items-center gap-3">
        <div className="space-y-0.5">
          <span className="text-[11px] font-medium text-muted-foreground/60">Active Context Scope</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm tracking-tight">{summary.name}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold border border-primary/25">{summary.environment}</span>
          </div>
        </div>
      </div>

      {/* Quick Summary Counts and Links */}
      <div className="flex items-center gap-6 flex-wrap">
        {summary.baseUrl && (
          <div className="space-y-0.5 hidden sm:block">
            <span className="text-[11px] font-medium text-muted-foreground/60 block">Target URL</span>
            <a href={summary.baseUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
              {summary.baseUrl.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}

        <div className="space-y-0.5">
          <span className="text-[11px] font-medium text-muted-foreground/60 block">{trackerName}</span>
          <span className={`flex items-center gap-1.5 font-semibold ${summary.opConnected ? "text-emerald-600" : "text-amber-500"}`}>
            <Globe className="h-3.5 w-3.5" />
            {summary.opConnected ? "Connected" : "Setup Required"}
          </span>
        </div>

        <div className="space-y-0.5 cursor-pointer" onClick={() => router.push(`/projects/${projectId}/test-cases`)}>
          <span className="text-[11px] font-medium text-muted-foreground/60 block">Test Cases</span>
          <span className="font-semibold text-foreground flex items-center gap-1">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" /> {summary.testCasesCount} cases
          </span>
        </div>

        <div className="space-y-0.5 cursor-pointer" onClick={() => router.push(`/projects/${projectId}/bug-reports`)}>
          <span className="text-[11px] font-medium text-muted-foreground/60 block">Open Bugs</span>
          <span className="font-semibold text-rose-600 flex items-center gap-1">
            <Bug className="h-3.5 w-3.5 text-rose-400" /> {summary.openBugsCount} defects
          </span>
        </div>

        <button 
          onClick={() => {
            localStorage.removeItem("activeProjectId")
            window.dispatchEvent(new Event("projectChanged"))
            router.push("/dashboard")
          }}
          className="h-8 px-3 rounded-lg border hover:bg-muted flex items-center gap-1 bg-card text-muted-foreground font-semibold border-border"
        >
          Switch Project <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
