"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

export default function RedirectToTelemetryDetail() {
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    if (params.id && params.runId) {
      router.replace(`/projects/${params.id}/agent/runs/${params.runId}`)
    }
  }, [params.id, params.runId, router])

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-slate-500 font-semibold text-sm animate-pulse">Redirecting to Telemetry Dashboard...</p>
    </div>
  )
}
