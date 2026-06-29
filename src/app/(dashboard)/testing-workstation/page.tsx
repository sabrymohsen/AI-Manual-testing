"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

export default function GlobalTestingWorkstationGateway() {
  const router = useRouter()
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    const activeId = localStorage.getItem("activeProjectId")
    if (activeId) {
      router.replace(`/projects/${activeId}/testing-workstation`)
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
      title="Testing Workstation Execution"
      description="Select a project workspace scope to run live manual test sessions and capture screenshots."
      targetWorkflow="testing-workstation"
    />
  )
}
