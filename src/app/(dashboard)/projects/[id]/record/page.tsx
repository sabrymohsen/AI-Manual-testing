"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

export default function RecordLegacyRedirect() {
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    router.replace(`/projects/${params.id}/recorder-studio`)
  }, [router, params.id])

  return (
    <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse font-semibold">
      Redirecting to Recorder Studio...
    </div>
  )
}
