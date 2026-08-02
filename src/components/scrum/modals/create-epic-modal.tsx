"use client"

import { useEffect, useState } from "react"
import { useScrumUI } from "@/stores/scrum-ui"
import { useEpicMutations } from "@/hooks/scrum/use-scrum"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AlertCircle, Layers, Loader2 } from "lucide-react"

const SWATCHES = [
  { hex: "#2563eb", name: "Blue" },
  { hex: "#7c3aed", name: "Violet" },
  { hex: "#059669", name: "Emerald" },
  { hex: "#dc2626", name: "Red" },
  { hex: "#d97706", name: "Amber" },
  { hex: "#0891b2", name: "Cyan" },
  { hex: "#db2777", name: "Pink" },
]

export function CreateEpicModal({ projectId }: { projectId: string }) {
  const { createEpicOpen, setCreateEpicOpen } = useScrumUI()
  const { create } = useEpicMutations(projectId)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(SWATCHES[0].hex)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setTitle("")
    setDescription("")
    setColor(SWATCHES[0].hex)
    setError(null)
  }

  // Clear the draft whenever the dialog opens — cancelling used to leave the
  // previous attempt sitting in the form.
  useEffect(() => {
    if (createEpicOpen) reset()
  }, [createEpicOpen])

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim() || create.isPending) return
    setError(null)

    create.mutate(
      { title: title.trim(), description: description.trim() || null, color },
      {
        onSuccess: () => {
          reset()
          setCreateEpicOpen(false)
        },
        onError: (err: any) => {
          setError(
            err?.response?.data?.error ?? err?.message ?? "Could not create the epic. Please try again."
          )
        },
      }
    )
  }

  return (
    <Dialog open={createEpicOpen} onOpenChange={(o) => { if (!o) { setError(null); setCreateEpicOpen(false) } }}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader className="space-y-1 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-purple-600" />
              Create Epic
            </DialogTitle>
            <DialogDescription className="text-xs">
              A container for related stories. Its colour is how it reads on the board.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-1">
              <label htmlFor="epic-title" className="text-xs font-semibold text-muted-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                id="epic-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Billing Refactor"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="epic-description" className="text-xs font-semibold text-muted-foreground">
                Description
              </label>
              <Textarea
                id="epic-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What outcome does this epic deliver?"
                className="resize-y"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-muted-foreground">Epic colour</legend>
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((s) => (
                  <button
                    key={s.hex}
                    type="button"
                    title={s.name}
                    aria-label={s.name}
                    aria-pressed={color === s.hex}
                    onClick={() => setColor(s.hex)}
                    className={cn(
                      "h-8 w-8 rounded-full ring-offset-2 ring-offset-background transition-all hover:scale-110",
                      color === s.hex ? "ring-2 ring-foreground" : "ring-1 ring-border"
                    )}
                    style={{ backgroundColor: s.hex }}
                  />
                ))}
                <label
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  title="Custom colour"
                >
                  <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: color }} />
                  Custom
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="sr-only"
                    aria-label="Custom epic colour"
                  />
                </label>
              </div>

              {/* Live preview of the chip as it appears on a board card */}
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ backgroundColor: `${color}1a`, color }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  {title.trim() || "Epic name"}
                </span>
              </div>
            </fieldset>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setCreateEpicOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create epic
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
