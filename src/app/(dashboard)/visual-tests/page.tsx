"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Visual tests belong to a project; without one selected, send the user to pick it.
export default function VisualTestsRootPage() {
  const router = useRouter()
  useEffect(() => {
    router.push("/projects")
  }, [router])
  return <div className="py-20 text-center text-xs font-semibold text-muted-foreground">Choose a project to see its visual tests…</div>
}
