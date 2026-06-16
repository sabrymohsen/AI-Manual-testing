"use client"

import { useEffect, useState } from "react"
import { Search, AlertCircle, Check, X } from "lucide-react"

interface Requirement {
  id: string
  requirementKey: string
  title: string
  moduleId: string | null
  featureId: string | null
  componentId: string | null
  module: { name: string } | null
  feature: { name: string } | null
  component: { name: string } | null
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
    <div className="border p-5 rounded-2xl bg-accent/5 space-y-4 shadow-sm border-accent/20">
      <div>
        <h3 className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
          Linked Requirements
        </h3>
        <p className="text-slate-400 text-[11px] mt-0.5">
          Map this test case to project user stories to trace testing coverage.
        </p>
      </div>

      {/* Selected Chips */}
      {selectedChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedChips.map((req) => (
            <div
              key={req.id}
              className="bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-sm"
            >
              <span>
                {req.requirementKey} — {req.title}
              </span>
              <button
                type="button"
                onClick={() => handleToggle(req.id)}
                className="hover:bg-blue-100 rounded-full p-0.5 transition-colors text-blue-600"
              >
                <X size={12} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-medium">
          <AlertCircle size={16} className="shrink-0" />
          <span>Warning: No requirement is linked. This test case will lack traceability.</span>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search requirement key or title to link..."
          className="w-full bg-white border border-slate-200 pl-8 pr-3 py-1.5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
        />
      </div>

      {/* Selection list */}
      {!loading && filtered.length > 0 && (
        <div className="border border-slate-150 rounded-xl max-h-36 overflow-y-auto divide-y divide-slate-100 bg-white">
          {filtered.map((req) => {
            const isSelected = selectedIds.includes(req.id)
            return (
              <div
                key={req.id}
                onClick={() => handleToggle(req.id)}
                className={`p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50 transition-colors ${
                  isSelected ? "bg-blue-50/10" : ""
                }`}
              >
                <div>
                  <span className="font-bold text-slate-800 block">
                    {req.requirementKey} — {req.title}
                  </span>
                  {req.module && (
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Path: {req.module.name}
                      {req.feature && ` / ${req.feature.name}`}
                      {req.component && ` / ${req.component.name}`}
                    </span>
                  )}
                </div>
                {isSelected && <Check className="text-blue-600 h-4 w-4" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
