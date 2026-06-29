"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

export default function IntegrationsWorkflowPage() {
  const router = useRouter()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const activeId = localStorage.getItem("activeProjectId")
    setProjectId(activeId)
    setLoading(false)

    if (activeId) {
      router.replace(`/projects/${activeId}/openproject-sync`)
    }

    const handleProjectChange = () => {
      const nextId = localStorage.getItem("activeProjectId")
      setProjectId(nextId)
      if (nextId) {
        router.replace(`/projects/${nextId}/openproject-sync`)
      }
    }
    window.addEventListener("projectChanged", handleProjectChange)
    return () => window.removeEventListener("projectChanged", handleProjectChange)
  }, [router])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse font-semibold">
        Routing to OpenProject Sync...
      </div>
    )
  }

  if (!projectId) {
    return (
      <ProjectSelectionGateway 
        title="OpenProject Sync Center"
        description="Select a project workspace scope to synchronize defects, columns mappings, and requirements."
        targetWorkflow="openproject-sync"
      />
    )
  }

  return (
    <div className="flex h-full items-center justify-center text-muted-foreground font-semibold">
      Redirecting to OpenProject Sync...
    </div>
  )
}
