"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

/**
 * Tells users when QA Engine on the server was updated and gives them a
 * "Reload" button, so nobody keeps working on an old version of the pages.
 * (The desktop app's own installer updates are offered by the app itself.)
 */
export function UpdateNotice() {
  const first = useRef<string | null>(null)
  const shown = useRef(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    const check = async () => {
      if (shown.current || document.visibilityState !== "visible") return
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (!res.ok) return
        const { buildId } = await res.json()
        if (!first.current) {
          first.current = buildId
          return
        }
        if (buildId && buildId !== first.current) {
          shown.current = true
          toast("A new version of QA Engine is available", {
            description: "Reload to get the latest changes. Save anything you're typing first.",
            duration: Infinity,
            action: { label: "Reload", onClick: () => window.location.reload() },
          })
        }
      } catch {
        /* offline — try later */
      }
    }
    check()
    const timer = setInterval(check, 5 * 60 * 1000)
    document.addEventListener("visibilitychange", check)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", check)
    }
  }, [])

  return null
}
