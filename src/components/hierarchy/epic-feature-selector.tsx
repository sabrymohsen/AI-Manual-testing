"use client"

import { toast } from "sonner"
import { useEffect, useState } from "react"

interface Epic {
  id: string
  epicKey: string
  title: string
}

interface Feature {
  id: string
  featureKey: string
  name: string
  epic: { id: string; epicKey: string; title: string } | null
}

interface EpicFeatureSelectorProps {
  projectId: string
  epicId: string
  onChangeEpicId: (id: string) => void
  featureId: string
  onChangeFeatureId: (id: string) => void
}

/**
 * Cascading Epic → Feature picker (both optional). Replaces the old
 * Module/Feature/Component "Link Hierarchy path" selector.
 *
 * Picking a feature that belongs to another epic re-aligns the Epic field;
 * picking an epic filters the feature list to that epic (plus unparented
 * features). "＋ New" creates a feature inline under the selected epic.
 */
export function EpicFeatureSelector({
  projectId,
  epicId,
  onChangeEpicId,
  featureId,
  onChangeFeatureId,
}: EpicFeatureSelectorProps) {
  const [epics, setEpics] = useState<Epic[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [creating, setCreating] = useState(false)
  const [newFeatureName, setNewFeatureName] = useState("")
  const [saving, setSaving] = useState(false)

  const loadAll = async () => {
    try {
      const [epicRes, featRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/epics`),
        fetch(`/api/projects/${projectId}/features`),
      ])
      if (epicRes.ok) setEpics((await epicRes.json()).epics || [])
      if (featRes.ok) setFeatures((await featRes.json()).features || [])
    } catch {}
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const visibleFeatures = epicId
    ? features.filter((f) => !f.epic || f.epic.id === epicId)
    : features

  const handleFeatureChange = (id: string) => {
    onChangeFeatureId(id)
    if (id) {
      const feature = features.find((f) => f.id === id)
      if (feature?.epic && feature.epic.id !== epicId) {
        onChangeEpicId(feature.epic.id)
      }
    }
  }

  const handleEpicChange = (id: string) => {
    onChangeEpicId(id)
    // Clear the feature if it belongs to a different epic
    if (featureId) {
      const feature = features.find((f) => f.id === featureId)
      if (feature?.epic && feature.epic.id !== id) onChangeFeatureId("")
    }
  }

  const handleCreateFeature = async () => {
    if (!newFeatureName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFeatureName.trim(), epicId: epicId || null }),
      })
      if (res.ok) {
        const data = await res.json()
        setNewFeatureName("")
        setCreating(false)
        await loadAll()
        handleFeatureChange(data.feature.id)
      } else {
        const err = await res.json()
        toast.error(err.error || "Failed to create feature")
      }
    } catch {
      toast.error("Network error creating feature")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-2">Epic</label>
        <select
          value={epicId}
          onChange={(e) => handleEpicChange(e.target.value)}
          className="w-full px-3 py-2 border border-border bg-card rounded-xl text-xs focus:outline-none"
        >
          <option value="">No Epic</option>
          {epics.map((ep) => (
            <option key={ep.id} value={ep.id}>{ep.epicKey} — {ep.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-2">Feature</label>
        {creating ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newFeatureName}
              onChange={(e) => setNewFeatureName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateFeature() } }}
              placeholder="Feature name…"
              className="flex-1 min-w-0 px-3 py-2 border border-violet-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <button
              type="button"
              onClick={handleCreateFeature}
              disabled={saving || !newFeatureName.trim()}
              className="px-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? "…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewFeatureName("") }}
              className="px-2 rounded-xl border border-border text-muted-foreground hover:text-muted-foreground text-xs"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={featureId}
              onChange={(e) => handleFeatureChange(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 border border-border bg-card rounded-xl text-xs focus:outline-none"
            >
              <option value="">No Feature</option>
              {visibleFeatures.map((f) => (
                <option key={f.id} value={f.id}>{f.featureKey} — {f.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="px-3 rounded-xl border border-violet-200 text-violet-600 hover:bg-violet-50 text-xs font-semibold whitespace-nowrap"
              title="Create a new feature"
            >
              ＋ New
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
