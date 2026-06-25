"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CredentialForm } from "./credential-form"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface Credential {
  id: string
  roleName: string
  username: string
  loginUrl: string | null
  notes: string | null
}

interface CredentialsListProps {
  projectId: string
  credentials: Credential[]
  onUpdate: () => void
}

export function CredentialsList({ projectId, credentials, onUpdate }: CredentialsListProps) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Credential | null>(null)
  const [credentialToDelete, setCredentialToDelete] = useState<string | null>(null)

  async function handleDeleteConfirm() {
    if (!credentialToDelete) return
    const res = await fetch(`/api/projects/${projectId}/credentials/${credentialToDelete}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || "Failed to delete credential")
    }
    setCredentialToDelete(null)
    onUpdate()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Credentials</h2>
        <Button onClick={() => { setEditing(null); setShowForm(true) }}>
          Add Credential
        </Button>
      </div>

      {credentials.length === 0 ? (
        <p className="text-muted-foreground">No credentials configured</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {credentials.map((cred) => (
            <div key={cred.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{cred.roleName}</p>
                <p className="text-sm text-muted-foreground">{cred.username}</p>
                {cred.loginUrl && (
                  <p className="text-xs text-muted-foreground">{cred.loginUrl}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditing(cred); setShowForm(true) }}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setCredentialToDelete(cred.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CredentialForm
          projectId={projectId}
          credential={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); onUpdate() }}
        />
      )}

      <ConfirmDialog
        open={credentialToDelete !== null}
        title="Delete Credential"
        description="Are you sure you want to delete this credential? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setCredentialToDelete(null)}
      />
    </div>
  )
}
