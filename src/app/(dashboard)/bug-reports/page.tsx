"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

export default function GlobalBugReportsGateway() {
  const router = useRouter()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    const activeId = localStorage.getItem("activeProjectId")
    if (activeId) {
      router.replace(`/projects/${activeId}/bug-reports`)
    } else {
      setProjectId(null)
      setResolved(true)
    }
  }, [router])

  if (!resolved) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse font-semibold">
        Resolving active project scope...
      </div>
    )
  }

  return (
    <ProjectSelectionGateway 
      title="Bug Reports Triage"
      description="Select a project workspace scope to triage bug reports, duplicate issues, and OpenProject mappings."
      targetWorkflow="bug-reports"
    />
  )
}
