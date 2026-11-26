"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft } from "@/components/ui/icons"

/** The page one level up, used when there is no in-app history to go back to. */
export function parentPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean)
  if (parts.length <= 1) return "/dashboard"
  // /projects/<id> has no useful parent page of its own besides the list.
  parts.pop()
  return "/" + parts.join("/")
}

/**
 * Back arrow shown in the app's top bar on every page except the Dashboard
 * (the home page, nothing sits behind it). Goes back in history when the
 * previous page was inside the app, otherwise to the parent page, so a link
 * opened in a new tab still has a way back.
 */
export function BackButton() {
  const router = useRouter()
  const pathname = usePathname()
  const [hasHistory, setHasHistory] = useState(false)

  useEffect(() => {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null
      setHasHistory(window.history.length > 1 && (!ref || ref.origin === window.location.origin))
    } catch {
      setHasHistory(false)
    }
  }, [pathname])

  if (pathname === "/dashboard" || pathname === "/") return null

  return (
    <button
      type="button"
      onClick={() => (hasHistory ? router.back() : router.push(parentPath(pathname)))}
      aria-label="Go back"
      title="Go back"
      className="caption-1 me-auto inline-flex items-center gap-2 rounded-lg px-2 py-1 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back
    </button>
  )
}
