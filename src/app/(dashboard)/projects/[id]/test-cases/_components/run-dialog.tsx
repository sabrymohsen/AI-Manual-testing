"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Loader2, Play } from "lucide-react"
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-1">
          {GROUPS.map((g) => (
            <div key={g.key}>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{g.label}</p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={g.label}>
                {g.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={opts[g.key] === o}
                    onClick={() => setOpts((p) => ({ ...p, [g.key]: o }))}
                    className={cn(
                      "h-8 rounded-md border px-3 text-xs transition-colors",
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
          <Button size="sm" onClick={confirm} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            Start run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
