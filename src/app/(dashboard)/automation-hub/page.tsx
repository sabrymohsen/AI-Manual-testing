"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AutomationHubRootPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect the user to the projects list so they can select an active project context
    router.push("/projects")
  }, [router])

  return (
    <div className="py-20 text-center text-xs font-semibold text-slate-400">
      <span>Redirecting to projects dashboard selection...</span>
    </div>
  )
}
