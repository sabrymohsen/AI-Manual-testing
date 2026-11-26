"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "@/components/ui/icons"

/**
 * Light/dark switch for the top bar. Saves the choice to the profile so it
 * follows the user to other devices. `savedTheme` is the profile value: it is
 * applied once when this browser has no choice of its own yet.
 */
export function ThemeToggle({ savedTheme }: { savedTheme?: string | null }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!savedTheme) return
    try {
      if (!localStorage.getItem("qa-theme")) setTheme(savedTheme)
    } catch {
      /* storage blocked: keep the default */
    }
  }, [savedTheme, setTheme])

  const isDark = mounted && resolvedTheme === "dark"
  const label = isDark ? "Switch to light theme" : "Switch to dark theme"

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = isDark ? "light" : "dark"
        setTheme(next)
        fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: next }),
        }).catch(() => {})
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  )
}
