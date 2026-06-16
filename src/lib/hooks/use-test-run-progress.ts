import { useEffect, useState, useRef } from "react"

interface StepResult {
  id: string
  stepNumber: number
  actionDescription: string
  expectedResult: string
  status: string
  actualResult: string | null
  errorDetails: string | null
  durationMs: number
  screenshotBefore: string | null
  screenshotAfter: string | null
}

interface ProgressData {
  status: string
  currentStep: number | null
  stepResults: StepResult[]
  startedAt: string | null
  completedAt: string | null
  durationMs: number
}

export function useTestRunProgress(
  projectId: string,
  runId: string | null
) {
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!runId) {
      setLoading(false)
      return
    }

    async function fetchProgress() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/test-runs/${runId}/progress`
        )
        if (res.ok) {
          const data = await res.json()
          setProgress(data)
          setLoading(false)

          if (
            data.status === "Passed" ||
            data.status === "Failed" ||
            data.status === "Cancelled"
          ) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
            }
          }
        }
      } catch {
        // Ignore fetch errors during polling
      }
    }

    fetchProgress()
    intervalRef.current = setInterval(fetchProgress, 2000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [projectId, runId])

  return { progress, loading }
}
