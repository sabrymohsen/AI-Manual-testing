"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

export default function WorkstationWorkflowPage() {
  const router = useRouter()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    const activeId = localStorage.getItem("activeProjectId")
    setProjectId(activeId)
    setResolved(true)

    const handleProjectChange = () => {
      setProjectId(localStorage.getItem("activeProjectId"))
    }
    window.addEventListener("projectChanged", handleProjectChange)
    return () => window.removeEventListener("projectChanged", handleProjectChange)
  }, [])

  useEffect(() => {
    if (projectId) {
      router.replace(`/projects/${projectId}/live-qa-session`)
    }
  }, [projectId, router])

  if (!resolved || projectId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse font-semibold">
        Opening Live QA Session...
      </div>
    )
  }

  return (
    <ProjectSelectionGateway 
      title="Live QA Session"
      description="Select a project workspace scope to run live manual test sessions and capture screenshots."
      targetWorkflow="live-qa-session"
    />
  )
}
