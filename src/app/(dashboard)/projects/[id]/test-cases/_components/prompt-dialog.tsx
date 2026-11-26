"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "@/components/ui/icons"

/** One-field dialog: bulk tag edits and naming a new plan. */
export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  suggestions,
  pending,
  onCancel,
  onSubmit,
}: {
  open: boolean
  title: string
  description?: string
  label: string
  placeholder?: string
  confirmLabel: string
  /** Clickable chips that fill the field, e.g. existing tags. */
  suggestions?: string[]
  pending?: boolean
  onCancel: () => void
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState("")
  useEffect(() => {
    if (open) setValue("")
  }, [open])

  const submit = () => value.trim() && onSubmit(value.trim())

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
        </DialogHeader>
        <label className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                submit()
              }
            }}
            className="h-9 text-sm"
          />
        </label>
        {suggestions && suggestions.length > 0 && (
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() =>
                  setValue((v) => {
                    const parts = v.split(",").map((x) => x.trim()).filter(Boolean)
                    return parts.includes(s) ? v : [...parts, s].join(", ")
                  })
                }
                className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!value.trim() || pending} className="gap-2">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
