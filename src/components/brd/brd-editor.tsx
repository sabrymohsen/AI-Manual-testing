"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Bold, Italic, Underline, Strikethrough, Loader2,
  List, ListOrdered, ListChecks,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Indent, Outdent, Undo2, Redo2, Link2, Image as ImageIcon,
  Minus, Table as TableIcon, Search, Eraser, Baseline, Highlighter, ChevronDown,
} from "lucide-react"

const FONTS = ["Default", "Arial", "Calibri", "Georgia", "Times New Roman", "Courier New", "Verdana", "Tahoma"]
const SIZES = ["10", "11", "12", "14", "16", "18", "24", "32"]
const TEXT_COLORS = ["#111827", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#64748b", "#ffffff"]
const HILITES = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#fbcfe8", "#fed7aa", "transparent"]
const LINE_SPACING = [
  { label: "Single", value: "1.4" },
  { label: "1.15", value: "1.55" },
  { label: "1.5", value: "1.9" },
  { label: "Double", value: "2.4" },
]

/** Full Word-style rich-text editor for Word BRDs. Produces HTML that is saved
 * as a new version and converted to .docx server-side. */
export function BrdEditor({ brdId, onSaved }: { brdId: string; onSaved: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [summary, setSummary] = useState("")
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null)
  const [showFind, setShowFind] = useState(false)
  const draftKey = `brd-draft-${brdId}`

  useEffect(() => {
    document.execCommand("styleWithCSS", false, "true")
    fetch(`/api/brds/${brdId}/preview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const draft = localStorage.getItem(draftKey)
        const html = draft && confirm("Restore your unsaved draft for this document?") ? draft : d?.html || "<p></p>"
        if (ref.current) ref.current.innerHTML = html
        setLoaded(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brdId])

  // Auto-save draft to localStorage every 30s.
  useEffect(() => {
    const t = setInterval(() => {
      if (ref.current) {
        localStorage.setItem(draftKey, ref.current.innerHTML)
        setAutoSavedAt(new Date().toLocaleTimeString())
      }
    }, 30000)
    return () => clearInterval(t)
  }, [draftKey])

  const focusEditor = () => ref.current?.focus()
  const cmd = useCallback((command: string, value?: string) => {
    focusEditor()
    document.execCommand(command, false, value)
  }, [])

  // Wrap the current selection in a span with an inline style (for font family/size).
  const wrapStyle = (style: Partial<CSSStyleDeclaration>) => {
    focusEditor()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      toast.message("Select some text first")
      return
    }
    const range = sel.getRangeAt(0)
    const span = document.createElement("span")
    Object.assign(span.style, style)
    try {
      span.appendChild(range.extractContents())
      range.insertNode(span)
      sel.removeAllRanges()
    } catch {
      document.execCommand("insertHTML", false, `<span>${sel.toString()}</span>`)
    }
  }

  // Apply line-height to the block(s) touched by the selection.
  const setLineHeight = (lh: string) => {
    focusEditor()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    let node: Node | null = sel.getRangeAt(0).startContainer
    while (node && node !== ref.current) {
      if (node.nodeType === 1) {
        const el = node as HTMLElement
        if (/^(P|DIV|H1|H2|H3|H4|LI|BLOCKQUOTE)$/.test(el.tagName)) {
          el.style.lineHeight = lh
          return
        }
      }
      node = node.parentNode
    }
  }

  const insertTable = () => {
    const rows = parseInt(prompt("Rows?", "2") || "0")
    const cols = parseInt(prompt("Columns?", "2") || "0")
    if (!rows || !cols) return
    let html = "<table><tbody>"
    for (let r = 0; r < rows; r++) {
      html += "<tr>"
      for (let c = 0; c < cols; c++) html += r === 0 ? "<th>Header</th>" : "<td>&nbsp;</td>"
      html += "</tr>"
    }
    html += "</tbody></table><p></p>"
    cmd("insertHTML", html)
  }

  const insertImage = () => {
    const url = prompt("Image URL:")
    if (url) cmd("insertImage", url)
  }

  const insertLink = () => {
    const url = prompt("Link URL:", "https://")
    if (url) cmd("createLink", url)
  }

  const insertChecklist = () => {
    cmd("insertHTML", `<ul class="brd-checklist"><li>☐ &nbsp;To do item</li></ul><p></p>`)
  }

  async function doSave() {
    if (!summary.trim()) return toast.error("Please describe your changes")
    setSaving(true)
    try {
      const res = await fetch(`/api/brds/${brdId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentHtml: ref.current?.innerHTML || "", changeSummary: summary.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.removeItem(draftKey)
        toast.success(`v${data.version.versionNumber} saved`)
        setShowSaveModal(false)
        setSummary("")
        onSaved()
      } else toast.error(data.error || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const Btn = ({ onClick, title, active, children }: any) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`rounded p-1.5 text-slate-600 hover:bg-slate-200 ${active ? "bg-slate-200" : ""}`}
    >
      {children}
    </button>
  )
  const Sep = () => <div className="mx-1 h-5 w-px bg-slate-300" />

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 bg-slate-50 px-2 py-1.5">
        <Btn onClick={() => cmd("undo")} title="Undo"><Undo2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("redo")} title="Redo"><Redo2 className="h-4 w-4" /></Btn>
        <Sep />

        {/* Block style */}
        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { cmd("formatBlock", e.target.value); e.target.selectedIndex = 0 }}
          className="h-7 rounded border bg-white px-1 text-xs"
          title="Paragraph style"
          defaultValue=""
        >
          <option value="" disabled>Style</option>
          <option value="P">Normal</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3</option>
          <option value="H4">Heading 4</option>
          <option value="BLOCKQUOTE">Quote</option>
          <option value="PRE">Code</option>
        </select>

        {/* Font family */}
        <select
          onChange={(e) => { if (e.target.value === "Default") cmd("removeFormat"); else cmd("fontName", e.target.value); e.target.selectedIndex = 0 }}
          className="h-7 rounded border bg-white px-1 text-xs"
          title="Font"
          defaultValue=""
        >
          <option value="" disabled>Font</option>
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>

        {/* Font size */}
        <select
          onChange={(e) => { wrapStyle({ fontSize: `${e.target.value}px` }); e.target.selectedIndex = 0 }}
          className="h-7 rounded border bg-white px-1 text-xs"
          title="Font size"
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Sep />

        <Btn onClick={() => cmd("bold")} title="Bold"><Bold className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("italic")} title="Italic"><Italic className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("underline")} title="Underline"><Underline className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("strikeThrough")} title="Strikethrough"><Strikethrough className="h-4 w-4" /></Btn>

        {/* Text color */}
        <Swatches icon={<Baseline className="h-4 w-4" />} title="Text color" colors={TEXT_COLORS} onPick={(c) => cmd("foreColor", c)} />
        {/* Highlight */}
        <Swatches icon={<Highlighter className="h-4 w-4" />} title="Highlight" colors={HILITES} onPick={(c) => cmd("hiliteColor", c)} />
        <Sep />

        <Btn onClick={() => cmd("justifyLeft")} title="Align left"><AlignLeft className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("justifyCenter")} title="Align center"><AlignCenter className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("justifyRight")} title="Align right"><AlignRight className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("justifyFull")} title="Justify"><AlignJustify className="h-4 w-4" /></Btn>

        {/* Line spacing */}
        <select
          onChange={(e) => { setLineHeight(e.target.value); e.target.selectedIndex = 0 }}
          className="h-7 rounded border bg-white px-1 text-xs"
          title="Line spacing"
          defaultValue=""
        >
          <option value="" disabled>↕</option>
          {LINE_SPACING.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <Sep />

        <Btn onClick={() => cmd("insertUnorderedList")} title="Bullet list"><List className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("insertOrderedList")} title="Numbered list"><ListOrdered className="h-4 w-4" /></Btn>
        <Btn onClick={insertChecklist} title="Checklist"><ListChecks className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("outdent")} title="Decrease indent"><Outdent className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("indent")} title="Increase indent"><Indent className="h-4 w-4" /></Btn>
        <Sep />

        <Btn onClick={insertLink} title="Insert link"><Link2 className="h-4 w-4" /></Btn>
        <Btn onClick={insertTable} title="Insert table"><TableIcon className="h-4 w-4" /></Btn>
        <Btn onClick={insertImage} title="Insert image"><ImageIcon className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("insertHorizontalRule")} title="Horizontal rule"><Minus className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("removeFormat")} title="Clear formatting"><Eraser className="h-4 w-4" /></Btn>
        <Btn onClick={() => setShowFind((v) => !v)} title="Find & replace" active={showFind}><Search className="h-4 w-4" /></Btn>

        <div className="ml-auto flex items-center gap-2">
          {autoSavedAt && <span className="text-[10px] text-muted-foreground">Draft saved {autoSavedAt}</span>}
          <button onClick={() => setShowSaveModal(true)} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
            Save version
          </button>
        </div>
      </div>

      {showFind && <FindReplace getRoot={() => ref.current} />}

      {!loaded && <div className="flex items-center justify-center border py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}
      <div
        ref={ref}
        contentEditable={loaded}
        suppressContentEditableWarning
        className="brd-doc min-h-[62vh] max-w-none rounded-b-lg border bg-white p-8 outline-none focus:ring-2 focus:ring-indigo-200"
        style={{ display: loaded ? "block" : "none" }}
      />

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSaveModal(false)}>
          <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">Describe your changes</h3>
            <p className="mt-1 text-xs text-muted-foreground">Stored in the version history (required).</p>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Added the authentication scope section"
              className="mt-3 w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowSaveModal(false)} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">Cancel</button>
              <button onClick={doSave} disabled={saving || !summary.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save new version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* Color swatch dropdown */
function Swatches({ icon, title, colors, onPick }: { icon: React.ReactNode; title: string; colors: string[]; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} title={title} className="flex items-center rounded p-1.5 text-slate-600 hover:bg-slate-200">
        {icon}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 grid grid-cols-5 gap-1 rounded-lg border bg-white p-2 shadow-lg">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(c); setOpen(false) }}
                className="h-5 w-5 rounded border border-slate-300"
                style={{ backgroundColor: c === "transparent" ? "#fff" : c, backgroundImage: c === "transparent" ? "linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)" : undefined }}
                title={c}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* Find & replace bar operating on the editor's text nodes */
function FindReplace({ getRoot }: { getRoot: () => HTMLElement | null }) {
  const [find, setFind] = useState("")
  const [replace, setReplace] = useState("")
  const [count, setCount] = useState(0)
  const [current, setCurrent] = useState(0)

  const clearHits = (root: HTMLElement) => {
    root.querySelectorAll("[data-find-hit]").forEach((el) => {
      const parent = el.parentNode!
      parent.replaceChild(document.createTextNode(el.textContent || ""), el)
      parent.normalize()
    })
  }

  const runFind = useCallback((term: string) => {
    const root = getRoot()
    if (!root) return
    clearHits(root)
    if (!term) { setCount(0); setCurrent(0); return }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    let n: Node | null
    while ((n = walker.nextNode())) textNodes.push(n as Text)
    let hits = 0
    const lower = term.toLowerCase()
    textNodes.forEach((tn) => {
      const text = tn.nodeValue || ""
      if (!text.toLowerCase().includes(lower)) return
      const frag = document.createDocumentFragment()
      let i = 0
      let idx: number
      const tl = text.toLowerCase()
      while ((idx = tl.indexOf(lower, i)) !== -1) {
        if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)))
        const mark = document.createElement("span")
        mark.setAttribute("data-find-hit", "")
        mark.textContent = text.slice(idx, idx + term.length)
        frag.appendChild(mark)
        hits++
        i = idx + term.length
      }
      if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)))
      tn.parentNode?.replaceChild(frag, tn)
    })
    setCount(hits)
    setCurrent(hits ? 1 : 0)
    highlightCurrent(1)
  }, [getRoot])

  const highlightCurrent = (pos: number) => {
    const root = getRoot()
    if (!root) return
    const hits = [...root.querySelectorAll("[data-find-hit]")]
    hits.forEach((h) => h.removeAttribute("data-find-current"))
    const el = hits[pos - 1]
    if (el) {
      el.setAttribute("data-find-current", "")
      el.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }

  const step = (dir: number) => {
    if (count === 0) return
    let next = current + dir
    if (next < 1) next = count
    if (next > count) next = 1
    setCurrent(next)
    highlightCurrent(next)
  }

  const doReplace = (all: boolean) => {
    const root = getRoot()
    if (!root || !find) return
    const hits = [...root.querySelectorAll("[data-find-hit]")]
    const targets = all ? hits : hits[current - 1] ? [hits[current - 1]] : []
    targets.forEach((el) => {
      const parent = el.parentNode!
      parent.replaceChild(document.createTextNode(replace), el)
      parent.normalize()
    })
    runFind(find)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-x bg-amber-50 px-3 py-2 text-sm">
      <input
        value={find}
        onChange={(e) => { setFind(e.target.value); runFind(e.target.value) }}
        placeholder="Find"
        className="h-8 w-40 rounded border bg-white px-2 text-sm outline-none"
      />
      <span className="text-xs text-muted-foreground">{count ? `${current}/${count}` : "0 results"}</span>
      <button onClick={() => step(-1)} className="rounded border bg-white px-2 py-1 text-xs">Prev</button>
      <button onClick={() => step(1)} className="rounded border bg-white px-2 py-1 text-xs">Next</button>
      <input
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        placeholder="Replace with"
        className="h-8 w-40 rounded border bg-white px-2 text-sm outline-none"
      />
      <button onClick={() => doReplace(false)} className="rounded border bg-white px-2 py-1 text-xs font-semibold">Replace</button>
      <button onClick={() => doReplace(true)} className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">Replace all</button>
    </div>
  )
}
