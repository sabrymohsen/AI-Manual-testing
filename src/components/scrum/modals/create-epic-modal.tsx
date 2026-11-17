"use client"

import { useEffect, useState } from "react"
import { useScrumUI } from "@/stores/scrum-ui"
import { useEpicMutations, useScrumProject } from "@/hooks/scrum/use-scrum"
import { DotLabel } from "@/components/scrum/shared"
import { ComposerDialog, ComposerTitle, ComposerText, ChipRow, ChipButton, CreateMoreToggle } from "@/components/ui/issue-composer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Check, Pipette } from "lucide-react"

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
  const [createMore, setCreateMore] = useState(false)
  const { data: project } = useScrumProject(projectId)

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
          if (!createMore) setCreateEpicOpen(false)
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
    <ComposerDialog
      open={createEpicOpen}
      onOpenChange={(o) => { if (!o) { setError(null); setCreateEpicOpen(false) } }}
      title="Create epic"
      description="A container for related stories. Its colour is how it reads on the board."
      crumbs={[
        <span key="key" className="rounded border border-border px-1 font-mono text-[10px]">{project?.boardKey || "EPIC"}</span>,
        <span key="t" className="inline-flex items-center gap-1.5 font-medium">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          New epic
        </span>,
      ]}
      onSubmit={() => submit()}
      canSubmit={!!title.trim()}
      submitting={create.isPending}
      submitLabel="Create epic"
      error={error}
      footerLeft={<CreateMoreToggle checked={createMore} onChange={setCreateMore} />}
    >
      <ComposerTitle
        id="epic-title"
        aria-label="Epic title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Epic name, e.g. Billing refactor"
        autoFocus
        required
      />
      <ComposerText
        id="epic-description"
        value={description}
        onChange={setDescription}
        placeholder="What outcome does this epic deliver?"
        minRows={3}
      />

      <ChipRow>
        <Popover>
          <PopoverTrigger asChild>
            <ChipButton active aria-label="Epic colour">
              <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} />
              {SWATCHES.find((sw) => sw.hex === color)?.name ?? "Custom colour"}
            </ChipButton>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Epic colour">
              {SWATCHES.map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  role="radio"
                  aria-checked={color === sw.hex}
                  aria-label={sw.name}
                  title={sw.name}
                  onClick={() => setColor(sw.hex)}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110",
                    color === sw.hex && "ring-2 ring-foreground/70"
                  )}
                  style={{ backgroundColor: sw.hex }}
                >
                  {color === sw.hex && <Check className="h-3 w-3 text-white" />}
                </button>
              ))}
              <label
                title="Custom colour"
                className="relative ml-1 flex h-6 cursor-pointer items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent"
              >
                <Pipette className="h-3 w-3" /> Custom
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Custom epic colour"
                />
              </label>
            </div>
          </PopoverContent>
        </Popover>

        <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          On cards
          <DotLabel dotColor={color}>{title.trim() || "Epic name"}</DotLabel>
        </span>
      </ChipRow>
    </ComposerDialog>
  )
}
