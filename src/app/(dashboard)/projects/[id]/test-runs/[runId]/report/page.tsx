"use client"

import { useEffect, useState } from "react"
import { useProjectIntegration } from "@/hooks/use-project-integration"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StepResultItem } from "@/components/test-runs/step-result"
import { ConsoleLogsPanel } from "@/components/test-runs/console-logs-panel"
import { NetworkLogsPanel } from "@/components/test-runs/network-logs-panel"
import { BugReportForm } from "@/components/bug-reports/bug-report-form"
import { Bug, Play, Edit, CloudUpload, CheckCircle2, XCircle, RefreshCw, ExternalLink, Loader2 } from "@/components/ui/icons"

export default function ReportPage() {
  const params = useParams()
  // Show whichever tracker the project syncs with, not a fixed vendor name.
  const { name: trackerName } = useProjectIntegration(params.id as string)
  const router = useRouter()
  const [testRun, setTestRun] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showBugForm, setShowBugForm] = useState(false)
  const [failedStep, setFailedStep] = useState<any>(null)
  const [rerunning, setRerunning] = useState(false)
  const [opSync, setOpSync] = useState<{ status: string; externalUrl: string | null; externalId: string | null } | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const TERMINAL = ["Passed", "Failed", "Blocked", "Warning", "Cancelled"]
    let interval: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/api/projects/${params.id}/test-runs/${params.runId}`)
        const data = await res.json()
        if (cancelled) return
        setTestRun(data.testRun)
        setLoading(false)
        // Stop polling once the run reaches a terminal state.
        if (interval && data.testRun && TERMINAL.includes(data.testRun.status)) {
          clearInterval(interval)
          interval = null
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    // Poll for live step/status updates while the run is still executing.
    interval = setInterval(load, 2000)

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [params.id, params.runId])

  // Load OpenProject sync status for the test run's test case
  useEffect(() => {
    if (!testRun?.testCase?.id) return
    async function loadSync() {
      try {
        const res = await fetch(`/api/projects/${params.id}/integrations/sync-status`)
        if (res.ok) {
          const data = await res.json()
          const mapping = data.syncMap?.[testRun.testCase.id]
          if (mapping) {
            setOpSync({ status: mapping.lastSyncStatus || "synced", externalUrl: mapping.externalUrl, externalId: mapping.externalId })
          } else {
            setOpSync({ status: "not_synced", externalUrl: null, externalId: null })
          }
        }
      } catch { /* non-critical */ }
    }
    loadSync()
  }, [testRun, params.id])

  async function handleSyncResult() {
    setSyncing(true)
    try {
      const res = await fetch(`/api/test-runs/${params.runId}/sync/openproject`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setOpSync({ status: "success", externalUrl: data.externalUrl || opSync?.externalUrl || null, externalId: data.externalId || opSync?.externalId || null })
      } else {
        setOpSync((prev) => prev ? { ...prev, status: "failed" } : { status: "failed", externalUrl: null, externalId: null })
      }
    } catch {
      setOpSync((prev) => prev ? { ...prev, status: "failed" } : { status: "failed", externalUrl: null, externalId: null })
    } finally {
      setSyncing(false)
    }
  }

  async function handleRerun() {
    if (!testRun?.testCase?.id) return
    setRerunning(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCaseId: testRun.testCase.id,
          credentialId: testRun.credentialId,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        router.push(`/projects/${params.id}/test-runs/${data.testRun.id}`)
      } else {
        alert("Failed to start rerun execution")
      }
    } catch {
      alert("Network error starting rerun")
    } finally {
      setRerunning(false)
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading report...</p>
  if (!testRun) return <p className="text-destructive">Test run not found</p>

  const failedSteps = testRun.stepResults?.filter((s: any) => s.status === "Failed") || []

  const tc = testRun.testCase
  const breadcrumb = tc
    ? [
        tc.moduleRelation?.name || tc.module || "General",
        tc.feature?.name,
        tc.component?.name,
        tc.title
      ]
        .filter(Boolean)
        .join(" / ")
    : "Standalone Visual Diff"

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Test Run Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {breadcrumb} · {testRun.browserType} · {testRun.viewport}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {testRun.testCase && (
            <>
              <Button
                variant="outline"
                className="flex items-center gap-1"
                onClick={() => router.push(`/projects/${params.id}/test-cases/${testRun.testCase.id}/edit`)}
              >
                <Edit className="h-3.5 w-3.5" /> Edit Test Case
              </Button>
              <Button
                className="flex items-center gap-1"
                onClick={handleRerun}
                disabled={rerunning}
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {rerunning ? "Rerunning..." : "Rerun Test"}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => window.open(`/api/exports/${params.runId}/markdown`, "_blank")}
          >
            Export Markdown
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="font-semibold">{testRun.status}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Duration</p>
          <p className="font-semibold">{testRun.durationMs}ms</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Role</p>
          <p className="font-semibold">{testRun.roleUsed || "None"}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Steps</p>
          <p className="font-semibold">{testRun.stepResults?.length || 0}</p>
        </div>
      </div>

      {/* Tracker sync status */}
      {opSync && (
        <div className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
          opSync.status === "success" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800" :
          opSync.status === "failed" ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" :
          opSync.status === "not_synced" ? "bg-muted/50 border-muted" :
          "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800"
        }`}>
          <div className="flex items-center gap-2">
            {opSync.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> :
             opSync.status === "failed" ? <XCircle className="h-4 w-4 text-red-600" /> :
             opSync.status === "not_synced" ? <CloudUpload className="h-4 w-4 text-muted-foreground" /> :
             <CloudUpload className="h-4 w-4 text-blue-600" />}
            <span className="font-medium">
              {trackerName}: {opSync.status === "success" ? "Result Synced" : opSync.status === "failed" ? "Sync Failed" : opSync.status === "not_synced" ? "Not Synced" : "Pending"}
            </span>
            {opSync.externalUrl && (
              <a href={opSync.externalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                WP #{opSync.externalId} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleSyncResult} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1">{opSync.status === "not_synced" ? "Sync" : "Retry"}</span>
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Step Results</h2>
        {testRun.stepResults?.map((step: any) => (
          <div key={step.id} className="space-y-1">
            <StepResultItem {...step} />
            {step.status === "Failed" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFailedStep(step); setShowBugForm(true) }}
                className="ml-8"
              >
                <Bug className="h-4 w-4 mr-1" /> Create Bug Report
              </Button>
            )}
            {step.logs && step.logs.length > 0 && (
              <div className="ml-8">
                <p className="text-xs text-muted-foreground mb-1">Console Logs:</p>
                <ConsoleLogsPanel logs={step.logs} />
              </div>
            )}
            {step.networkLogs && step.networkLogs.length > 0 && (
              <div className="ml-8">
                <p className="text-xs text-muted-foreground mb-1">Network Logs:</p>
                <NetworkLogsPanel logs={step.networkLogs} />
              </div>
            )}
          </div>
        ))}
      </div>

      {showBugForm && (
        <BugReportForm
          testRunId={params.runId as string}
          projectId={params.id as string}
          defaultValues={
            failedStep
              ? {
                  actionDescription: failedStep.actionDescription,
                  stepsToReproduce: `${failedStep.stepNumber}. ${failedStep.actionDescription}`,
                  expectedResult: failedStep.expectedResult,
                  actualResult: failedStep.actualResult || "",
                  screenshotPath: failedStep.screenshotAfter || undefined,
                }
              : undefined
          }
          onClose={() => { setShowBugForm(false); setFailedStep(null) }}
          onSaved={() => { setShowBugForm(false); setFailedStep(null) }}
        />
      )}
    </div>
  )
}
