"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

// Legacy route: Testing Workstation is now Live QA Session.
export default function LegacyTestingWorkstationRedirect() {
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/projects/${params.id}/live-qa-session`)
  }, [params.id, router])

  return null
}
