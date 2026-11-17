"use client"

import { useEffect, useState } from "react"
import { Search, AlertCircle, Check, X } from "lucide-react"

interface Requirement {
  id: string
  requirementKey: string
  title: string
  epic: { epicKey: string; title: string } | null
  feature: { featureKey: string; name: string } | null
}

interface LinkedRequirementsSelectorProps {
  projectId: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function LinkedRequirementsSelector({
  projectId,
  selectedIds,
  onChange
}: LinkedRequirementsSelectorProps) {
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetchRequirements()
  }, [projectId])

  const fetchRequirements = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/requirements`)
      if (res.ok) {
        const data = await res.json()
        setRequirements(data.requirements || [])
      }
    } catch {
      console.error("Failed to load requirements for selection")
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const filtered = requirements.filter((r) => {
    const s = search.toLowerCase()
    return (
      r.requirementKey.toLowerCase().includes(s) ||
      r.title.toLowerCase().includes(s)
    )
  })

  const selectedChips = requirements.filter((r) => selectedIds.includes(r.id))

  return (
    <div className="space-y-2">
      {/* Selected Chips */}
      {selectedChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedChips.map((req) => (
            <span
              key={req.id}
              className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <span className="font-mono text-[11px] text-muted-foreground">{req.requirementKey}</span>
              <span className="truncate">{req.title}</span>
              <button
                type="button"
                onClick={() => handleToggle(req.id)}
                aria-label={`Unlink ${req.requirementKey}`}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle size={14} className="shrink-0 text-amber-500" />
          Not linked to a story yet. Link one so coverage reports count this case.
        </p>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search requirement key or title to link..."
          className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Selection list */}
      {!loading && filtered.length > 0 && (
        <div className="max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
          {filtered.map((req) => {
            const isSelected = selectedIds.includes(req.id)
            return (
              <div
                key={req.id}
                onClick={() => handleToggle(req.id)}
                className={`p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-muted/50 transition-colors ${
                  isSelected ? "bg-blue-50/10" : ""
                }`}
              >
                <div>
                  <span className="font-semibold text-foreground block">
                    {req.requirementKey} — {req.title}
                  </span>
                  {(req.epic || req.feature) && (
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      Path: {req.epic ? `${req.epic.epicKey} ${req.epic.title}` : ""}
                      {req.feature && `${req.epic ? " / " : ""}${req.feature.name}`}
                    </span>
                  )}
                </div>
                {isSelected && <Check className="h-4 w-4 text-primary" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
