"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface Credential {
  id: string
  roleName: string
  username: string
}

interface RoleSelectModalProps {
  credentials: Credential[]
  onSelect: (credentialId: string | null) => void
  onCancel: () => void
}

export function RoleSelectModal({ credentials, onSelect, onCancel }: RoleSelectModalProps) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-2">Select Role</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose which role/user to use for this test execution
        </p>

        <div className="space-y-2">
          {credentials.map((cred) => (
            <button
              key={cred.id}
              onClick={() => setSelected(cred.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selected === cred.id
                  ? "border-primary bg-primary/5"
                  : "hover:bg-accent"
              }`}
            >
              <p className="font-medium">{cred.roleName}</p>
              <p className="text-sm text-muted-foreground">{cred.username}</p>
            </button>
          ))}
          <button
            onClick={() => setSelected(null)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selected === null
                ? "border-primary bg-primary/5"
                : "hover:bg-accent"
            }`}
          >
            <p className="font-medium">No Authentication</p>
            <p className="text-sm text-muted-foreground">Run without logging in</p>
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => selected !== undefined && onSelect(selected)}>
            Run Test
          </Button>
        </div>
      </div>
    </div>
  )
}
