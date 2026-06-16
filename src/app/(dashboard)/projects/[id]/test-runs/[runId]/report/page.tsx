"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StepResultItem } from "@/components/test-runs/step-result"
import { ConsoleLogsPanel } from "@/components/test-runs/console-logs-panel"
import { NetworkLogsPanel } from "@/components/test-runs/network-logs-panel"
import { BugReportForm } from "@/components/bug-reports/bug-report-form"
import { Bug, Play, Edit } from "lucide-react"

export default function ReportPage() {
  const params = useParams()
  const router = useRouter()
  const [testRun, setTestRun] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showBugForm, setShowBugForm] = useState(false)
  const [failedStep, setFailedStep] = useState<any>(null)
  const [rerunning, setRerunning] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/test-runs/${params.runId}`)
      .then((res) => res.json())
      .then((data) => {
        setTestRun(data.testRun)
        setLoading(false)
      })
  }, [params.id, params.runId])

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
          <h1 className="text-3xl font-bold tracking-tight">Test Run Report</h1>
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
