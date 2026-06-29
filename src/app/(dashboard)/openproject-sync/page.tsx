"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

export default function GlobalOpenProjectSyncGateway() {
  const router = useRouter()
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    const activeId = localStorage.getItem("activeProjectId")
    if (activeId) {
      router.replace(`/projects/${activeId}/openproject-sync`)
    } else {
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
      title="OpenProject Sync Center"
      description="Select a project workspace scope to synchronize defects, columns mappings, and requirements."
      targetWorkflow="openproject-sync"
    />
  )
}
