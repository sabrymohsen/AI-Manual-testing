"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Legacy route: Testing Workstation is now Live QA Session.
export default function LegacyGlobalWorkstationRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/live-qa-session")
  }, [router])

  return null
}
