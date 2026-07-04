"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

export default function BugReportDetailPageRedirect() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const bugId = params.bugId as string

  useEffect(() => {
    // Redirect to the main unified bug workspace and open the detail drawer automatically
    router.replace(`/projects/${projectId}/bug-reports?bugId=${bugId}`)
  }, [projectId, bugId, router])

  return (
    <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse font-semibold text-xs">
      Loading unified defect workspace panel...
    </div>
  )
}
