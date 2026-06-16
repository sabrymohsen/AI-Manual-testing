"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { X, Loader2, ArrowRight } from "lucide-react"

interface HierarchyNode {
  id: string
  name: string
  features?: Array<{
    id: string
    name: string
    components?: Array<{
      id: string
      name: string
    }>
  }>
}

interface MoveCaseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projectId: string
  testCaseId: string
  testCaseTitle: string
  
  // Current values
  currentModuleId?: string | null
  currentFeatureId?: string | null
  currentComponentId?: string | null
}

export function MoveCaseModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  testCaseId,
  testCaseTitle,
  currentModuleId,
  currentFeatureId,
  currentComponentId
}: MoveCaseModalProps) {
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([])
  const [loading, setLoading] = useState(true)
  const [moving, setMoving] = useState(false)
  
  const [selectedModuleId, setSelectedModuleId] = useState("")
  const [selectedFeatureId, setSelectedFeatureId] = useState("")
  const [selectedComponentId, setSelectedComponentId] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      fetch(`/api/projects/${projectId}/hierarchy`)
        .then((res) => res.json())
        .then((data) => {
          setHierarchy(data.modules || [])
          setSelectedModuleId(currentModuleId || "")
          setSelectedFeatureId(currentFeatureId || "")
          setSelectedComponentId(currentComponentId || "")
          setLoading(false)
        })
        .catch(() => {
          setError("Failed to load project structure")
          setLoading(false)
        })
    }
  }, [isOpen, projectId, currentModuleId, currentFeatureId, currentComponentId])

  if (!isOpen) return null

  // Derived options
  const activeModule = hierarchy.find((m) => m.id === selectedModuleId)
  const features = activeModule?.features || []
  
  const activeFeature = features.find((f) => f.id === selectedFeatureId)
  const components = activeFeature?.components || []

  async function handleMove() {
    setMoving(true)
    setError("")

    try {
      const res = await fetch(`/api/test-cases/${testCaseId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: selectedModuleId || null,
          featureId: selectedFeatureId || null,
          componentId: selectedComponentId || null
        })
      })

      if (res.ok) {
        onSuccess()
        onClose()
      } else {
        const data = await res.json()
        setError(data.error || "Failed to move test case")
      }
    } catch {
      setError("Network error moving test case")
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-accent/20">
          <div>
            <h3 className="font-bold text-lg">Move Test Case</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[320px]" title={testCaseTitle}>
              {testCaseTitle}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Module select */}
              <div className="space-y-1.5">
                <Label htmlFor="move-module">Module</Label>
                <select
                  id="move-module"
                  value={selectedModuleId}
                  onChange={(e) => {
                    setSelectedModuleId(e.target.value)
                    setSelectedFeatureId("")
                    setSelectedComponentId("")
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Unassigned (No Module) --</option>
                  {hierarchy.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Feature select */}
              <div className="space-y-1.5">
                <Label htmlFor="move-feature">Feature</Label>
                <select
                  id="move-feature"
                  value={selectedFeatureId}
                  disabled={!selectedModuleId}
                  onChange={(e) => {
                    setSelectedFeatureId(e.target.value)
                    setSelectedComponentId("")
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">-- No Feature --</option>
                  {features.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Component select */}
              <div className="space-y-1.5">
                <Label htmlFor="move-component">Component</Label>
                <select
                  id="move-component"
                  value={selectedComponentId}
                  disabled={!selectedFeatureId}
                  onChange={(e) => setSelectedComponentId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">-- No Component --</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" onClick={onClose} disabled={moving || loading}>
              Cancel
            </Button>
            <Button onClick={handleMove} disabled={moving || loading} className="flex items-center gap-1.5">
              {moving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Moving...
                </>
              ) : (
                <>
                  Move Case <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
