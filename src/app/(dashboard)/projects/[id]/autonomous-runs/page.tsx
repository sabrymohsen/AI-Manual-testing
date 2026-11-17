"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

export default function RedirectToAgentDashboard() {
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    if (params.id) {
      router.replace(`/projects/${params.id}/agent?mode=Autonomous`)
    }
  }, [params.id, router])

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-muted-foreground font-semibold text-sm animate-pulse">Redirecting to QA Agent...</p>
    </div>
  )
}
