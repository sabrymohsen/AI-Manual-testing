"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

export default function RecordingWorkflowRedirectPage() {
  const router = useRouter()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const activeId = localStorage.getItem("activeProjectId")
    setProjectId(activeId)
    setLoading(false)

    if (activeId) {
      router.replace(`/projects/${activeId}/recorder-studio`)
    }

    const handleProjectChange = () => {
      const nextId = localStorage.getItem("activeProjectId")
      setProjectId(nextId)
      if (nextId) {
        router.replace(`/projects/${nextId}/recorder-studio`)
      }
    }
    window.addEventListener("projectChanged", handleProjectChange)
    return () => window.removeEventListener("projectChanged", handleProjectChange)
  }, [router])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse font-semibold">
        Routing to Recorder Studio...
      </div>
    )
  }

  if (!projectId) {
    return (
      <ProjectSelectionGateway 
        title="Recorder Studio Launcher"
        description="Select a project workspace scope to record element actions and compile test cases."
        targetWorkflow="recorder-studio"
      />
    )
  }

  return (
    <div className="flex h-full items-center justify-center text-muted-foreground font-semibold">
      Redirecting to Recorder Studio...
    </div>
  )
}
