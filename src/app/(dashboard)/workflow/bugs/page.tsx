"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

export default function BugsWorkflowPage() {
  const router = useRouter()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const activeId = localStorage.getItem("activeProjectId")
    setProjectId(activeId)
    setLoading(false)

    if (activeId) {
      router.replace(`/projects/${activeId}/bug-reports`)
    }

    const handleProjectChange = () => {
      const nextId = localStorage.getItem("activeProjectId")
      setProjectId(nextId)
      if (nextId) {
        router.replace(`/projects/${nextId}/bug-reports`)
      }
    }
    window.addEventListener("projectChanged", handleProjectChange)
    return () => window.removeEventListener("projectChanged", handleProjectChange)
  }, [router])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse font-semibold">
        Routing to Bug Reports...
      </div>
    )
  }

  if (!projectId) {
    return (
      <ProjectSelectionGateway 
        title="Bug Reports Triage"
        description="Select a project workspace scope to triage bug reports, duplicate issues, and issue-tracker mappings."
        targetWorkflow="bug-reports"
      />
    )
  }

  return (
    <div className="flex h-full items-center justify-center text-muted-foreground font-semibold">
      Redirecting to Bug Reports...
    </div>
  )
}
