"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProjectSelectionGateway } from "@/components/ui/project-selection-gateway"

/**
 * A sidebar page that lives inside a project (/scrum, /automation-hub…): go to
 * it in the active project, or let the user pick one when none is active.
 */
export function ActiveProjectRedirect({ workflow, title, description }: { workflow: string; title: string; description: string }) {
  const router = useRouter()
  const [pick, setPick] = useState(false)

  useEffect(() => {
    let activeId: string | null = null
    try {
      activeId = localStorage.getItem("activeProjectId")
    } catch {}
    if (activeId) router.replace(`/projects/${activeId}/${workflow}`)
    else setPick(true)
  }, [router, workflow])

  if (!pick) return <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">Opening {title}…</div>
  return <ProjectSelectionGateway title={title} description={description} targetWorkflow={workflow} />
}
