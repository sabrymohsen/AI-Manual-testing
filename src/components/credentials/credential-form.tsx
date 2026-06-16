"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Credential {
  id: string
  roleName: string
  username: string
  loginUrl: string | null
  notes: string | null
}

interface CredentialFormProps {
  projectId: string
  credential: Credential | null
  onClose: () => void
  onSaved: () => void
}

export function CredentialForm({ projectId, credential, onClose, onSaved }: CredentialFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const form = new FormData(e.currentTarget)
    const body: Record<string, any> = {
      roleName: form.get("roleName"),
      username: form.get("username"),
      loginUrl: form.get("loginUrl") || null,
      notes: form.get("notes") || null,
    }

    const password = form.get("password") as string
    if (password) body.password = password

    const url = credential
      ? `/api/projects/${projectId}/credentials/${credential.id}`
      : `/api/projects/${projectId}/credentials`

    const res = await fetch(url, {
      method: credential ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      onSaved()
    } else {
      const data = await res.json()
      setError(data.error || "Failed to save credential")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">
          {credential ? "Edit Credential" : "Add Credential"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roleName">Role Name *</Label>
            <Input
              id="roleName"
              name="roleName"
              required
              defaultValue={credential?.roleName || ""}
              placeholder="e.g. Admin, Viewer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              name="username"
              required
              defaultValue={credential?.username || ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">
              Password {credential ? "(leave blank to keep current)" : "*"}
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required={!credential}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loginUrl">Login URL (optional)</Label>
            <Input
              id="loginUrl"
              name="loginUrl"
              defaultValue={credential?.loginUrl || ""}
              placeholder="https://example.com/login"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              name="notes"
              defaultValue={credential?.notes || ""}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
