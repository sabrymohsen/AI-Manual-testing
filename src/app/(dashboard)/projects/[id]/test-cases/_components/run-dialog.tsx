"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Loader2, Play } from "@/components/ui/icons"
import type { RunOptions } from "../_hooks/use-test-library"

/**
 * Where to run: environment, browser and viewport for a manual run.
 *
 * Starting a run used to hard-code Staging / Chromium / Desktop, so a tester
 * re-testing a UAT fix on mobile had no way to record that. The last choice is
 * remembered per browser so repeat runs are one click.
 */

const STORAGE_KEY = "test-library.run-options"
const DEFAULTS: RunOptions = { environment: "Staging", browserType: "Chromium", viewport: "Desktop" }

function load(): RunOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

const GROUPS: { key: keyof RunOptions; label: string; options: string[] }[] = [
  { key: "environment", label: "Environment", options: ["Dev", "Staging", "UAT", "Production"] },
  { key: "browserType", label: "Browser", options: ["Chromium", "Firefox", "WebKit"] },
  { key: "viewport", label: "Viewport", options: ["Desktop", "Tablet", "Mobile"] },
]

export function RunDialog({
  open,
  title,
  description,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description?: string
  pending?: boolean
  onCancel: () => void
  onConfirm: (options: RunOptions) => void
}) {
  const [opts, setOpts] = useState<RunOptions>(DEFAULTS)

  useEffect(() => {
    if (open) setOpts(load())
  }, [open])

  const startRef = useRef<HTMLButtonElement>(null)

  function confirm() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(opts))
    } catch {
      // Remembering the choice is a convenience only.
    }
    onConfirm(opts)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => {
          // Start on the main action, not on the first option (which looked selected).
          e.preventDefault()
          startRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="heading-6">{title}</DialogTitle>
          {description && <DialogDescription className="body-6">{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-1">
          {GROUPS.map((g) => (
            <div key={g.key}>
              <p className="caption-1 mb-2 text-muted-foreground">{g.label}</p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={g.label}>
                {g.options.map((o, i) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={opts[g.key] === o}
                    tabIndex={opts[g.key] === o ? 0 : -1}
                    onClick={() => setOpts((p) => ({ ...p, [g.key]: o }))}
                    onKeyDown={(e) => {
                      // Arrow keys move the choice within the group, like a radio group.
                      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
                      if (!step) return
                      e.preventDefault()
                      const next = g.options[(i + step + g.options.length) % g.options.length]
                      setOpts((p) => ({ ...p, [g.key]: next }))
                      const sib = (e.currentTarget.parentElement?.children[(i + step + g.options.length) % g.options.length] as HTMLElement | undefined)
                      sib?.focus()
                    }}
                    className={cn(
                      "h-8 rounded-md border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      opts[g.key] === o
                        ? "border-primary/50 bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button ref={startRef} size="sm" onClick={confirm} disabled={pending} className="gap-2">
            {pending ? <BusyDot /> : <Play className="h-3.5 w-3.5 fill-current" />}
            Start run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
