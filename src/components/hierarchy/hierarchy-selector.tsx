"use client"

import { useState, useEffect } from "react"
import { Plus, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { HierarchyFormModal } from "./hierarchy-form-modal"

interface ComponentNode {
  id: string
  name: string
}

interface FeatureNode {
  id: string
  name: string
  components: ComponentNode[]
}

interface ModuleNode {
  id: string
  name: string
  features: FeatureNode[]
}

interface HierarchySelectorProps {
  projectId: string
  moduleId: string
  onChangeModuleId: (id: string) => void
  featureId: string
  onChangeFeatureId: (id: string) => void
  componentId: string
  onChangeComponentId: (id: string) => void
  showLabels?: boolean
  required?: boolean
}

export function HierarchySelector({
  projectId,
  moduleId,
  onChangeModuleId,
  featureId,
  onChangeFeatureId,
  componentId,
  onChangeComponentId,
  showLabels = true,
  required = false
}: HierarchySelectorProps) {
  const [hierarchy, setHierarchy] = useState<ModuleNode[]>([])
  const [loading, setLoading] = useState(true)

  // Quick creation modal states
  const [formOpen, setFormOpen] = useState(false)
  const [formLevel, setFormLevel] = useState<"module" | "feature" | "component">("module")

  const fetchHierarchy = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/projects/${projectId}/hierarchy`)
      if (res.ok) {
        const data = await res.json()
        setHierarchy(data.modules || [])
      }
    } catch (err) {
      console.error("Failed to load hierarchy in selector:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHierarchy()
  }, [projectId])

  // Derived arrays
  const activeModule = hierarchy.find((m) => m.id === moduleId)
  const features = activeModule?.features || []

  const activeFeature = features.find((f) => f.id === featureId)
  const components = activeFeature?.components || []

  const handleQuickCreateSuccess = async () => {
    await fetchHierarchy()
  }

  const handleOpenCreate = (level: "module" | "feature" | "component") => {
    setFormLevel(level)
    setFormOpen(true)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
      {/* Module Dropdown */}
      <div className="space-y-2">
        {showLabels && <Label htmlFor="select-module">Module {required && "*"}</Label>}
        <div className="flex gap-2">
          {loading ? (
            <div className="flex h-10 w-full items-center justify-center rounded-md border bg-accent/20">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <select
              id="select-module"
              value={moduleId}
              required={required}
              onChange={(e) => {
                onChangeModuleId(e.target.value)
                onChangeFeatureId("")
                onChangeComponentId("")
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">-- Select Module --</option>
              {hierarchy.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => handleOpenCreate("module")}
            title="Create new Module"
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded-md border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Feature Dropdown */}
      <div className="space-y-2">
        {showLabels && <Label htmlFor="select-feature">Feature</Label>}
        <div className="flex gap-2">
          <select
            id="select-feature"
            value={featureId}
            disabled={!moduleId}
            onChange={(e) => {
              onChangeFeatureId(e.target.value)
              onChangeComponentId("")
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value="">-- Select Feature --</option>
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!moduleId}
            onClick={() => handleOpenCreate("feature")}
            title="Create new Feature"
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded-md border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Component Dropdown */}
      <div className="space-y-2">
        {showLabels && <Label htmlFor="select-component">Component</Label>}
        <div className="flex gap-2">
          <select
            id="select-component"
            value={componentId}
            disabled={!featureId}
            onChange={(e) => onChangeComponentId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value="">-- Select Component --</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!featureId}
            onClick={() => handleOpenCreate("component")}
            title="Create new Component"
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded-md border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <HierarchyFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={handleQuickCreateSuccess}
        projectId={projectId}
        level={formLevel}
        mode="create"
        parentModuleId={moduleId || undefined}
        parentFeatureId={featureId || undefined}
      />
    </div>
  )
}
