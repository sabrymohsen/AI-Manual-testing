"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

export default function GlobalLiveQASessionGateway() {
  const router = useRouter()
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    const activeId = localStorage.getItem("activeProjectId")
    if (activeId) {
      router.replace(`/projects/${activeId}/live-qa-session`)
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
      title="Live QA Session"
      description="Select a project to run a live QA session and capture screenshots."
      targetWorkflow="live-qa-session"
    />
  )
}
