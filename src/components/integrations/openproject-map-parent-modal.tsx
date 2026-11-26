"use client"

import { useState } from "react"
import { X, Loader2, CheckCircle2, ExternalLink, AlertCircle } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Props {
  projectId: string
  groupId: string
  groupName: string
  currentParentId?: string | null
  currentParentSubject?: string | null
  onSaved: (parentId: string, parentSubject: string | null, parentUrl: string | null) => void
  onSavedAndSync?: () => void
  onClose: () => void
}

export function OpenProjectMapParentModal({
  projectId,
  groupId,
  groupName,
  currentParentId,
  currentParentSubject,
  onSaved,
  onSavedAndSync,
  onClose,
}: Props) {
  const [parentId, setParentId] = useState(currentParentId || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ subject: string | null; url: string | null } | null>(null)

  async function handleSave(andSync = false) {
    if (!parentId.trim()) {
      setError("Please enter a parent work package ID")
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/groups/${groupId}/map-parent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentWorkPackageId: parentId.trim() }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to save parent mapping")
        return
      }
      setSuccess({ subject: data.parentSubject, url: data.parentUrl })
      onSaved(parentId.trim(), data.parentSubject, data.parentUrl)
      if (andSync && onSavedAndSync) {
        onClose()
        onSavedAndSync()
      }
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-accent/10">
          <div>
            <h2 className="font-semibold text-lg">Map OpenProject Parent</h2>
            <p className="text-sm text-muted-foreground mt-0.5 font-medium" dir="auto">{groupName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {currentParentId && !success && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300">
              <span className="font-semibold">Current parent:</span> #{currentParentId}
              {currentParentSubject && <span className="ml-1">— {currentParentSubject}</span>}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Parent mapped: #{parentId}</span>
                {success.subject && <span className="ml-1">— {success.subject}</span>}
                {success.url && (
                  <a href={success.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-emerald-700 hover:underline dark:text-emerald-400">
                    <ExternalLink className="h-3 w-3" /> View
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold">Parent Work Package ID</label>
            <Input
              placeholder="e.g. 12345"
              value={parentId}
              onChange={e => { setParentId(e.target.value); setError(null); setSuccess(null) }}
              onKeyDown={e => e.key === "Enter" && handleSave(false)}
              className="font-mono"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Enter the numeric ID of the OpenProject work package that will be the parent for all test cases in <span className="font-semibold" dir="auto">{groupName}</span>.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground rounded-lg bg-accent/30 p-3 space-y-1">
            <p className="font-semibold text-foreground/70">Validation checks:</p>
            <p>• Parent work package must exist in OpenProject</p>
            <p>• Must belong to the configured project</p>
            <p>• Must be accessible with your API token</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 pt-0">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={saving || !parentId.trim()}
              className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-950/20"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Parent Mapping
            </Button>
            {onSavedAndSync && (
              <Button
                onClick={() => handleSave(true)}
                disabled={saving || !parentId.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save & Sync Group
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
