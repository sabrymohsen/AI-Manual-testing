"use client"

import { useParams } from "next/navigation"
import { useTestRunProgress } from "@/lib/hooks/use-test-run-progress"
import { StepResultItem } from "@/components/test-runs/step-result"

export default function TestRunDetailPage() {
  const params = useParams()
  const { progress, loading } = useTestRunProgress(
    params.id as string,
    params.runId as string
  )

  if (loading) {
    return <p className="text-muted-foreground">Loading test run...</p>
  }

  if (!progress) {
    return <p className="text-destructive">Test run not found</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Test Run</h1>
          <p className="text-sm text-muted-foreground">
            Status: {progress.status} · {progress.durationMs > 0 ? `${progress.durationMs}ms` : "in progress"}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <span className={`text-sm px-3 py-1 rounded-full font-medium ${
          progress.status === "Passed" ? "bg-green-100 text-green-700" :
          progress.status === "Failed" ? "bg-red-100 text-red-700" :
          progress.status === "Running" ? "bg-blue-100 text-blue-700" :
          progress.status === "Queued" ? "bg-gray-100 text-gray-700" :
          "bg-yellow-100 text-yellow-700"
        }`}>
          {progress.status}
        </span>
      </div>

      <div className="space-y-3">
        {progress.stepResults.map((step) => (
          <StepResultItem
            key={step.id}
            {...step}
          />
        ))}
      </div>

      {progress.stepResults.length === 0 && (
        <p className="text-muted-foreground">No steps executed yet</p>
      )}
    </div>
  )
}
