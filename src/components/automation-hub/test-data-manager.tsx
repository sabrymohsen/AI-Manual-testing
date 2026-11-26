"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import Editor from "@monaco-editor/react"
import {
  Database,
  Search,
  Plus,
  Save,
  Trash2,
  Loader2,
  FileJson,
  Table2,
  Link2,
  X,
  Wand2,
  AlertTriangle,
  CheckCircle2
} from "@/components/ui/icons"

interface DataFile {
  id: string
  name: string
  fileName: string
  content: string
  linkedScriptIds: string[]
  fields: string[]
  updatedAt: string
}

interface ScriptRef {
  id: string
  name: string
  type: string
}

export default function TestDataManager({ scripts }: { scripts: ScriptRef[] }) {
  const [files, setFiles] = useState<DataFile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState("")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [jsonError, setJsonError] = useState("")
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null)

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardName, setWizardName] = useState("")
  const [wizardFields, setWizardFields] = useState<string[]>(["email", "password"])

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 2500)
  }

  const selected = files.find((f) => f.id === selectedId) || null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/hub/test-data")
      if (res.ok) {
        const d = await res.json()
        setFiles(d.files || [])
        return d.files as DataFile[]
      }
    } finally {
      setLoading(false)
    }
    return []
  }, [])

  useEffect(() => {
    load().then((list) => {
      if (list.length > 0) selectFile(list[0])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectFile = (f: DataFile) => {
    setSelectedId(f.id)
    setEditorContent(f.content)
    setDirty(false)
    setJsonError("")
  }

  const validate = (content: string) => {
    try {
      JSON.parse(content)
      setJsonError("")
      return true
    } catch (e: any) {
      setJsonError(e.message)
      return false
    }
  }

  const handleChange = (val: string | undefined) => {
    const c = val || ""
    setEditorContent(c)
    setDirty(true)
    validate(c)
  }

  const handleSave = async () => {
    if (!selected || !validate(editorContent)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/hub/test-data/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editorContent })
      })
      if (res.ok) {
        showToast("Data file saved")
        setDirty(false)
        await load()
      } else {
        const d = await res.json()
        showToast(d.error || "Save failed", "error")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    await fetch(`/api/hub/test-data/${selected.id}`, { method: "DELETE" })
    const list = await load()
    if (list.length > 0) selectFile(list[0])
    else {
      setSelectedId(null)
      setEditorContent("")
    }
    showToast("Data file deleted")
  }

  const toggleLink = async (scriptId: string) => {
    if (!selected) return
    const linked = selected.linkedScriptIds.includes(scriptId)
      ? selected.linkedScriptIds.filter((id) => id !== scriptId)
      : [...selected.linkedScriptIds, scriptId]
    // optimistic
    setFiles((cur) => cur.map((f) => (f.id === selected.id ? { ...f, linkedScriptIds: linked } : f)))
    await fetch(`/api/hub/test-data/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedScriptIds: linked })
    })
  }

  const createDataSet = async () => {
    const name = wizardName.trim()
    if (!name) return
    const fields = wizardFields.map((f) => f.trim()).filter(Boolean)
    // Generate a JSON template: an array with one sample record per field
    const template = [
      Object.fromEntries(fields.map((f) => [f, ""])),
      Object.fromEntries(fields.map((f) => [f, ""]))
    ]
    const content = JSON.stringify(template, null, 2)
    const res = await fetch("/api/hub/test-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content })
    })
    const d = await res.json()
    if (!res.ok) {
      showToast(d.error || "Failed to create", "error")
      return
    }
    setWizardOpen(false)
    setWizardName("")
    setWizardFields(["email", "password"])
    const list = await load()
    const created = list.find((f) => f.id === d.file.id)
    if (created) selectFile(created)
    showToast("Data set created")
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return files
    return files.filter((f) => f.name.toLowerCase().includes(q) || f.content.toLowerCase().includes(q))
  }, [files, search])

  // Parse the selected file into rows for the preview table
  const previewRows = useMemo<{ fields: string[]; rows: any[] }>(() => {
    if (!selected) return { fields: [], rows: [] }
    try {
      const parsed = JSON.parse(editorContent)
      const rows: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [parsed]
      const fields: string[] = Array.from(
        new Set(rows.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : [])))
      )
      return { fields, rows: rows.slice(0, 25) }
    } catch {
      return { fields: [], rows: [] }
    }
  }, [selected, editorContent])

  const linkedScripts = scripts.filter((s) => selected?.linkedScriptIds.includes(s.id))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* LEFT: file browser */}
      <div className="lg:col-span-3 bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="p-3 border-b space-y-3">
          <span className="text-xs font-medium text-muted-foreground block">Test Data Files</span>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files or values..."
              className="w-full h-8 rounded-xl border pl-8 pr-2 text-xs bg-muted/50 font-semibold"
            />
          </div>
          <Button
            onClick={() => setWizardOpen(true)}
            className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl h-8 text-xs font-semibold flex items-center gap-2 justify-center"
          >
            <Plus size={12} /> New Data Set
          </Button>
        </div>
        <div className="p-2 space-y-1 max-h-[520px] overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center"><Loader2 size={18} className="animate-spin text-primary mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-slate-300 text-xs px-2 py-4 text-center">No data files. Create one to get started.</p>
          ) : (
            filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => selectFile(f)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedId === f.id ? "bg-primary/10 border-primary/25" : "bg-card border-transparent hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileJson size={13} className="text-primary shrink-0" />
                  <span className="font-semibold text-xs text-foreground truncate">{f.fileName}</span>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {f.fields.slice(0, 4).map((field) => (
                    <span key={field} className="text-xs uppercase font-semibold bg-muted text-muted-foreground border rounded-full px-2 py-px">{field}</span>
                  ))}
                  {f.linkedScriptIds.length > 0 && (
                    <span className="text-xs uppercase font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-px flex items-center gap-0.5">
                      <Link2 size={8} /> {f.linkedScriptIds.length}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* CENTER: JSON editor */}
      <div className="lg:col-span-5 bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileJson size={13} className="text-primary shrink-0" />
            <span className="font-semibold text-xs text-foreground truncate">{selected ? selected.fileName : "No file selected"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!selected || saving || !dirty || Boolean(jsonError)}
              variant="outline"
              className="rounded-xl h-8 px-3 text-xs font-semibold border-border text-muted-foreground bg-card flex items-center gap-2"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save{dirty ? " *" : ""}
            </Button>
            <button
              onClick={handleDelete}
              disabled={!selected}
              className="p-2 rounded-lg border border-rose-100 text-rose-500 bg-card hover:bg-rose-50 disabled:opacity-40"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {jsonError && (
          <div className="px-3 py-2 bg-rose-50 border-b border-rose-100 text-rose-600 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle size={10} /> {jsonError}
          </div>
        )}
        <div className="bg-slate-900 min-h-[480px]">
          <Editor
            height="480px"
            defaultLanguage="json"
            theme="vs-dark"
            value={editorContent}
            onChange={handleChange}
            options={{
              minimap: { enabled: false },
              fontSize: 11.5,
              lineHeight: 19,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
              readOnly: !selected
            }}
          />
        </div>
      </div>

      {/* RIGHT: preview + linking */}
      <div className="lg:col-span-4 space-y-4">
        {/* Preview table */}
        <div className="bg-card border rounded-xl p-3 shadow-2xs space-y-3">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-2 border-b pb-2">
            <Table2 size={12} /> Data Preview
          </span>
          {previewRows.fields.length === 0 ? (
            <p className="text-muted-foreground text-xs py-3 text-center">Valid JSON with objects renders as a table here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {previewRows.fields.map((f) => (
                      <th key={f} className="text-left font-semibold uppercase text-muted-foreground border-b px-2 py-1 whitespace-nowrap">{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/50">
                      {previewRows.fields.map((f) => (
                        <td key={f} className="border-b px-2 py-1 font-mono text-foreground truncate max-w-[120px]">
                          {typeof row?.[f] === "object" ? JSON.stringify(row?.[f]) : String(row?.[f] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <span className="text-xs font-semibold text-muted-foreground block pt-2">{previewRows.rows.length} record(s)</span>
            </div>
          )}
        </div>

        {/* dataProvider mapping preview */}
        {previewRows.fields.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
            <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider flex items-center gap-2">
              <Wand2 size={11} /> @Test(dataProvider) mapping
            </span>
            <pre className="font-mono text-xs leading-relaxed text-slate-200 overflow-x-auto">
{`@Test(dataProvider = "${selected?.name || "data"}")
public void test(JsonObject data) {
`}{previewRows.fields.map((f) => `  // data.get("${f}")`).join("\n")}
{`
}`}
            </pre>
          </div>
        )}

        {/* Link to scripts */}
        <div className="bg-card border rounded-xl p-3 shadow-2xs space-y-3">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-2 border-b pb-2">
            <Link2 size={12} /> Linked Test Scripts
          </span>
          {!selected ? (
            <p className="text-muted-foreground text-xs py-2 text-center">Select a data file to link scripts.</p>
          ) : (
            <>
              {linkedScripts.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {linkedScripts.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full pl-2 pr-1 py-0.5">
                      {s.name}
                      <button onClick={() => toggleLink(s.id)} className="text-emerald-400 hover:text-rose-500"><X size={9} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {scripts.map((s) => {
                  const linked = selected.linkedScriptIds.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleLink(s.id)}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-bold text-left ${
                        linked ? "bg-emerald-50/50 text-emerald-800" : "hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {linked ? <CheckCircle2 size={11} className="text-emerald-500" /> : <span className="w-[11px] h-[11px] rounded-full border border-border" />}
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto text-xs uppercase text-muted-foreground font-semibold">{s.type}</span>
                    </button>
                  )
                })}
                {scripts.length === 0 && <p className="text-slate-300 text-xs px-2 py-2">No scripts available.</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* WIZARD MODAL */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 text-left">
          <div className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Wand2 size={15} className="text-primary" /> Create Data Set
              </h3>
              <button onClick={() => setWizardOpen(false)} className="text-muted-foreground hover:text-muted-foreground p-1"><X size={16} /></button>
            </div>
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-muted-foreground">Data Set Name</span>
              <input
                value={wizardName}
                onChange={(e) => setWizardName(e.target.value)}
                placeholder="e.g. loginUsers"
                className="w-full h-9 rounded-xl border px-3 text-xs bg-muted/50 font-semibold"
              />
              <span className="text-xs text-muted-foreground font-medium">Saved as <span className="font-mono">{(wizardName.trim() || "name").replace(/[^A-Za-z0-9_-]/g, "_")}.json</span> in testDataFiles/</span>
            </label>
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Fields</span>
              {wizardFields.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={f}
                    onChange={(e) => setWizardFields((cur) => cur.map((x, idx) => (idx === i ? e.target.value : x)))}
                    placeholder="field name"
                    className="flex-1 h-8 rounded-lg border px-3 text-xs bg-muted/50 font-mono font-semibold"
                  />
                  <button
                    onClick={() => setWizardFields((cur) => cur.filter((_, idx) => idx !== i))}
                    className="p-2 rounded-lg border text-rose-400 hover:bg-rose-50"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              <Button
                onClick={() => setWizardFields((cur) => [...cur, ""])}
                variant="outline"
                className="w-full rounded-lg h-7 text-xs font-semibold border-dashed border-border text-muted-foreground bg-card flex items-center gap-1 justify-center"
              >
                <Plus size={10} /> Add Field
              </Button>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={() => setWizardOpen(false)} variant="outline" className="flex-1 rounded-xl h-9 text-xs font-semibold border-border text-muted-foreground bg-card">
                Cancel
              </Button>
              <Button
                onClick={createDataSet}
                disabled={!wizardName.trim() || wizardFields.filter((f) => f.trim()).length === 0}
                className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-xl h-9 text-xs font-semibold"
              >
                Generate Template
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-lg text-xs font-semibold uppercase ${
          toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
        }`}>
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}
