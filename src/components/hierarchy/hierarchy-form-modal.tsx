"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, Loader2 } from "lucide-react"

interface HierarchyFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  projectId: string
  
  // What are we editing/creating?
  level: "module" | "feature" | "component"
  mode: "create" | "edit"
  
  // Edit data if mode is 'edit'
  editData?: {
    id: string
    name: string
    description?: string | null
    orderIndex?: number
  }

  // Parent IDs for creation
  parentModuleId?: string // Required when creating feature
  parentFeatureId?: string // Required when creating component
}

export function HierarchyFormModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  level,
  mode,
  editData,
  parentModuleId,
  parentFeatureId
}: HierarchyFormModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [orderIndex, setOrderIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (mode === "edit" && editData) {
      setName(editData.name)
      setDescription(editData.description || "")
      setOrderIndex(editData.orderIndex || 0)
    } else {
      setName("")
      setDescription("")
      setOrderIndex(0)
    }
    setError("")
  }, [mode, editData, isOpen])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    setSaving(true)
    setError("")

    try {
      let url = ""
      let method = "POST"
      const body: any = {
        name: name.trim(),
        description: description.trim() || null,
        orderIndex: Number(orderIndex)
      }

      if (mode === "create") {
        if (level === "module") {
          url = `/api/projects/${projectId}/modules`
        } else if (level === "feature") {
          url = `/api/modules/${parentModuleId}/features`
        } else if (level === "component") {
          url = `/api/features/${parentFeatureId}/components`
        }
      } else {
        method = "PUT"
        if (level === "module") {
          url = `/api/modules/${editData?.id}`
        } else if (level === "feature") {
          url = `/api/features/${editData?.id}`
        } else if (level === "component") {
          url = `/api/components/${editData?.id}`
        }
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        onSuccess()
        onClose()
      } else {
        const data = await res.json()
        setError(data.error || "Something went wrong")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-accent/20">
          <h3 className="font-bold text-lg capitalize">
            {mode} {level}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="node-name">Name *</Label>
            <Input
              id="node-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${level === "module" ? "Authentication" : level === "feature" ? "User Registration" : "Signup Form"}`}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="node-desc">Description</Label>
            <Input
              id="node-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="node-order">Order Index</Label>
            <Input
              id="node-order"
              type="number"
              value={orderIndex}
              onChange={(e) => setOrderIndex(Number(e.target.value))}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
