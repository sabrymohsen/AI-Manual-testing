"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import { Eye, EyeOff, Plus, Trash2, Edit, Save, ShieldAlert, Sparkles, RefreshCw, Key } from "@/components/ui/icons"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface TestDataVariable {
  id: string
  key: string
  value: string | null
  dataType: string
  environment: string | null
  isSensitive: boolean
  notes: string | null
}

const DATA_TYPES = [
  { value: "text", label: "Text String" },
  { value: "number", label: "Numeric Value" },
  { value: "boolean", label: "Boolean flag" },
  { value: "date", label: "Date String" },
  { value: "json", label: "JSON Object" },
  { value: "secret", label: "Secret / Password (Encrypted)" }
]

const ENVIRONMENTS = [
  { value: "ALL", label: "All Environments (Global)" },
  { value: "Dev", label: "Development" },
  { value: "Staging", label: "Staging" },
  { value: "UAT", label: "UAT (User Acceptance)" },
  { value: "Production", label: "Production" }
]

export default function TestDataPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [variables, setVariables] = useState<TestDataVariable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals & edits
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [variableToDelete, setVariableToDelete] = useState<string | null>(null)

  // Form inputs
  const [key, setKey] = useState("")
  const [value, setValue] = useState("")
  const [dataType, setDataType] = useState("text")
  const [environment, setEnvironment] = useState("ALL")
  const [isSensitive, setIsSensitive] = useState(false)
  const [notes, setNotes] = useState("")

  // Resolver playground states
  const [resolverInput, setResolverInput] = useState("Hello {{admin.email}}! Testing database resolved value at {{timestamp}}.")
  const [resolverOutput, setResolverOutput] = useState("")
  const [resolving, setResolving] = useState(false)
  const [resolverEnv, setResolverEnv] = useState("Staging")

  // Secrets visibility toggle states
  const [revealedIds, setRevealedIds] = useState<Record<string, string>>({})
  const [revealingId, setRevealingId] = useState<string | null>(null)

  useEffect(() => {
    fetchVariables()
  }, [projectId])

  const fetchVariables = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-data`)
      if (!res.ok) throw new Error("Failed to fetch variables")
      const data = await res.json()
      setVariables(data)
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setIsCreating(true)
    setEditingId(null)
    setKey("")
    setValue("")
    setDataType("text")
    setEnvironment("ALL")
    setIsSensitive(false)
    setNotes("")
  }

  const handleOpenEdit = (v: TestDataVariable) => {
    setEditingId(v.id)
    setIsCreating(false)
    setKey(v.key)
    setValue(v.value || "")
    setDataType(v.dataType)
    setEnvironment(v.environment || "ALL")
    setIsSensitive(v.isSensitive)
    setNotes(v.notes || "")
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key) return

    setError(null)
    const payload = {
      key,
      value,
      dataType,
      environment: environment === "ALL" ? null : environment,
      isSensitive: isSensitive || dataType === "secret",
      notes
    }

    try {
      let url = `/api/projects/${projectId}/test-data`
      let method = "POST"

      if (editingId) {
        url = `/api/test-data/${editingId}`
        method = "PUT"
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save variable")
      }

      setIsCreating(false)
      setEditingId(null)
      fetchVariables()
    } catch (err: any) {
      setError(err.message || "Failed to save variable")
    }
  }

  const handleDelete = (id: string) => {
    setVariableToDelete(id)
  }

  const confirmDeleteVariable = async () => {
    if (!variableToDelete) return
    setError(null)
    const res = await fetch(`/api/test-data/${variableToDelete}`, {
      method: "DELETE"
    })
    if (!res.ok) throw new Error("Failed to delete variable")
    setVariableToDelete(null)
    fetchVariables()
  }

  const handleResolveText = async () => {
    setResolving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-data/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: resolverInput,
          environment: resolverEnv
        })
      })
      if (!res.ok) throw new Error("Resolution failed")
      const data = await res.json()
      setResolverOutput(data.resolved)
    } catch (err: any) {
      setResolverOutput("Error: " + err.message)
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-blue-600 ">
              Test Data Manager
            </h1>
            <p className="text-muted-foreground">
              Define environments configuration variables and secrets to substitute dynamically in test runs.
            </p>
          </div>
        </div>

        {!(isCreating || editingId) && (
          <Button onClick={handleOpenCreate} className=" bg-blue-600 text-white font-medium flex items-center gap-2 shadow-md">
            <Plus size={18} /> Add Variable
          </Button>
        )}
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl">
          ⚠️ {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Create / Edit Form or Live Variable Resolver Playground */}
        <div className="lg:col-span-1 space-y-6">
          {isCreating || editingId ? (
            <form onSubmit={handleSave} className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2 pb-3 border-b">
                <Key className="text-blue-600" size={20} />
                {isCreating ? "Add New Variable" : "Edit Variable"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Variable Key</label>
                  <input
                    type="text"
                    required
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="e.g. admin.email"
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">Keys should be lowercase and dot-separated.</span>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Variable Value</label>
                  <input
                    type={isSensitive || dataType === "secret" ? "password" : "text"}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={isSensitive ? "••••••••" : "e.g. admin@example.com"}
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Data Type</label>
                    <select
                      value={dataType}
                      onChange={(e) => {
                        setDataType(e.target.value)
                        if (e.target.value === "secret") {
                          setIsSensitive(true)
                        }
                      }}
                      className="w-full px-3 py-2 border border-border bg-card rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
                    >
                      {DATA_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Environment</label>
                    <select
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                      className="w-full px-3 py-2 border border-border bg-card rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
                    >
                      {ENVIRONMENTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    id="isSensitive"
                    checked={isSensitive}
                    disabled={dataType === "secret"}
                    onChange={(e) => setIsSensitive(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-border rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isSensitive" className="text-sm font-medium text-foreground flex items-center gap-2">
                    Encrypt & Mask (Sensitive Secret)
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Notes / Description</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Describe what this test variable is used for..."
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground h-16 resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-4 mt-6">
                <Button type="button" variant="outline" onClick={() => { setIsCreating(false); setEditingId(null); }} className="rounded-xl border-border text-muted-foreground hover:bg-muted/50">
                  Cancel
                </Button>
                <Button type="submit" className=" bg-blue-600 text-white font-medium px-6 rounded-xl">
                  Save Variable
                </Button>
              </div>
            </form>
          ) : (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2 pb-2 border-b">
                <Sparkles className="text-blue-500" size={18} />
                Variables Resolver Playground
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Test how your test case steps will substitute keys containing brackets e.g. <code>{"{{admin.email}}"}</code>.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">Target Environment Context</label>
                  <select
                    value={resolverEnv}
                    onChange={(e) => setResolverEnv(e.target.value)}
                    className="w-full px-3 py-2 border border-border bg-card rounded-xl text-sm focus:outline-none text-foreground"
                  >
                    {ENVIRONMENTS.filter(o => o.value !== "ALL").map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">Input Text Template</label>
                  <textarea
                    value={resolverInput}
                    onChange={(e) => setResolverInput(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground h-24"
                  />
                </div>

                <Button onClick={handleResolveText} disabled={resolving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-2 rounded-xl py-2">
                  <RefreshCw size={16} className={resolving ? "animate-spin" : ""} /> Resolve Variables
                </Button>

                {resolverOutput && (
                  <div className="p-3 bg-muted/50 border border-border rounded-xl">
                    <span className="block text-xs font-semibold text-muted-foreground mb-1">RESOLVED OUTCOME:</span>
                    <p className="text-xs font-mono text-foreground break-words">{resolverOutput}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Variables List */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Project Variables</h2>
              <span className="text-xs text-muted-foreground bg-muted rounded px-3 py-0.5 font-semibold">
                {variables.length} defined
              </span>
            </div>

            {loading ? (
              <div className="p-16 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-muted-foreground text-sm">Loading variables list...</p>
              </div>
            ) : variables.length === 0 ? (
              <div className="p-16 text-center">
                <Key size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No custom variables defined</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                  Add custom keys for email addresses, static test inputs, or secret credentials to make tests modular.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground  border-b border-border">
                      <th className="px-6 py-3">Key / Key Variable</th>
                      <th className="px-6 py-3">Value</th>
                      <th className="px-6 py-3">Environment</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm text-foreground">
                    {variables.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-semibold text-foreground">
                          {`{{${v.key}}}`}
                        </td>
                        <td className="px-6 py-4 max-w-xs truncate">
                          {v.isSensitive ? (
                            <span className="flex items-center gap-2 text-xs text-muted-foreground font-mono ">
                              <ShieldAlert size={14} className="text-amber-500" />
                              Encrypted Secret
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">{v.value || "—"}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            !v.environment ? "bg-muted text-muted-foreground" :
                            v.environment === "Production" ? "bg-red-50 text-red-600 border border-red-100" :
                            v.environment === "Staging" ? "bg-amber-50 text-amber-600 border border-amber-100" :
                            "bg-blue-50 text-blue-600 border border-blue-100"
                          }`}>
                            {v.environment || "Global"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-muted-foreground capitalize">
                          {v.dataType}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(v)} className="text-muted-foreground hover:text-blue-600 hover:bg-blue-50/50 p-1">
                              <Edit size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(v.id)} className="text-muted-foreground hover:text-red-600 hover:bg-red-50 p-1">
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={variableToDelete !== null}
        title="Delete Variable"
        description="Are you sure you want to delete this variable? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteVariable}
        onCancel={() => setVariableToDelete(null)}
      />
    </div>
  )
}
