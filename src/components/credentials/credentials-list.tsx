"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CredentialForm } from "./credential-form"

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
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm("Delete this credential?")) return
    setDeleting(id)
    await fetch(`/api/projects/${projectId}/credentials/${id}`, {
      method: "DELETE",
    })
    setDeleting(null)
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
                  onClick={() => handleDelete(cred.id)}
                  disabled={deleting === cred.id}
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
    </div>
  )
}
