"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Bold, Italic, Underline, Strikethrough, Loader2,
  List, ListOrdered, ListChecks,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Indent, Outdent, Undo2, Redo2, Link2, Image as ImageIcon,
  Minus, Table as TableIcon, Search, Eraser, Baseline, Highlighter, ChevronDown,
  Subscript, Superscript, CaseSensitive, PaintBucket, Pilcrow, Sigma, SeparatorHorizontal,
  ChevronsRight, ChevronsLeft, ChevronUp, ChevronDown as ChevronDownIcon, Type,
} from "lucide-react"

const FONTS = ["Default", "Arial", "Calibri", "Cambria", "Dubai", "Georgia", "Times New Roman", "Courier New", "Verdana", "Tahoma", "Cairo", "Amiri", "Segoe UI"]
const SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "48"]
const TEXT_COLORS = ["#111827", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#64748b", "#ffffff"]
const HILITES = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#fbcfe8", "#fed7aa", "transparent"]
const SHADES = ["#f1f5f9", "#fee2e2", "#dcfce7", "#dbeafe", "#fef9c3", "#f3e8ff", "transparent"]
const LINE_SPACING = [
  { label: "Single", value: "1.4" },
  { label: "1.15", value: "1.55" },
  { label: "1.5", value: "1.9" },
  { label: "Double", value: "2.4" },
]
const SYMBOLS = ["©", "®", "™", "§", "¶", "†", "‡", "•", "…", "—", "–", "→", "←", "↔", "⇒", "✓", "✗", "★", "☐", "☑", "±", "×", "÷", "≈", "≤", "≥", "≠", "°", "µ", "€", "£", "¥", "¢", "½", "¼", "¾"]

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
  const [marks, setMarks] = useState(false)
  const [uploading, setUploading] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)
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

  const selection = () => window.getSelection()

  const wrapStyle = (style: Partial<CSSStyleDeclaration>) => {
    focusEditor()
    const sel = selection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return toast.message("Select some text first")
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

  // Walk up to the block element containing the selection.
  const currentBlock = (): HTMLElement | null => {
    const sel = selection()
    if (!sel || sel.rangeCount === 0) return null
    let node: Node | null = sel.getRangeAt(0).startContainer
    while (node && node !== ref.current) {
      if (node.nodeType === 1 && /^(P|DIV|H1|H2|H3|H4|LI|BLOCKQUOTE|TD|TH|PRE)$/.test((node as HTMLElement).tagName)) {
        return node as HTMLElement
      }
      node = node.parentNode
    }
    return null
  }

  const setBlockStyle = (prop: string, val: string) => {
    focusEditor()
    const b = currentBlock()
    if (b) (b.style as any)[prop] = val
  }

  const setDir = (dir: "ltr" | "rtl") => {
    focusEditor()
    const b = currentBlock()
    if (b) { b.dir = dir; b.style.textAlign = dir === "rtl" ? "right" : "left" }
  }

  const adjustFontSize = (delta: number) => {
    focusEditor()
    const sel = selection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return toast.message("Select some text first")
    const cont = sel.getRangeAt(0).commonAncestorContainer
    const el = (cont.nodeType === 1 ? cont : cont.parentElement) as HTMLElement
    const cur = parseFloat(window.getComputedStyle(el).fontSize) || 16
    wrapStyle({ fontSize: `${Math.max(8, Math.round(cur + delta))}px` })
  }

  const changeCase = (mode: string) => {
    focusEditor()
    const sel = selection()
    if (!sel || sel.isCollapsed) return toast.message("Select some text first")
    const text = sel.toString()
    let out = text
    if (mode === "upper") out = text.toUpperCase()
    else if (mode === "lower") out = text.toLowerCase()
    else if (mode === "title") out = text.replace(/\b\w/g, (c) => c.toUpperCase())
    else if (mode === "sentence") out = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    document.execCommand("insertText", false, out)
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

  const insertLink = () => { const url = prompt("Link URL:", "https://"); if (url) cmd("createLink", url) }
  const insertChecklist = () => cmd("insertHTML", `<ul class="brd-checklist"><li>☐ &nbsp;To do item</li></ul><p></p>`)
  const insertPageBreak = () => cmd("insertHTML", `<div class="brd-pagebreak" data-pagebreak="1"></div><p></p>`)
  const insertSymbol = (s: string) => cmd("insertText", s)

  const insertDropCap = () => {
    focusEditor()
    const b = currentBlock()
    if (!b || !b.textContent) return
    const first = b.textContent.trim().charAt(0)
    if (!first) return
    const rest = b.innerHTML.replace(first, "")
    b.innerHTML = `<span class="brd-dropcap">${first}</span>${rest}`
  }

  const insertTextBox = () => cmd("insertHTML", `<div class="brd-textbox">Text box — type here.</div><p></p>`)

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image")
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be 5MB or smaller")
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = () => { cmd("insertImage", reader.result as string); setUploading(false) }
      reader.readAsDataURL(file)
    } catch { setUploading(false) }
  }

  const toggleMarks = () => {
    setMarks((v) => { ref.current?.classList.toggle("show-marks", !v); return !v })
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
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}
      className={`rounded p-1.5 text-slate-600 hover:bg-slate-200 ${active ? "bg-slate-200" : ""}`}>
      {children}
    </button>
  )
  const Sel = ({ onChange, title, placeholder, options }: any) => (
    <select onChange={(e) => { onChange(e.target.value); e.target.selectedIndex = 0 }} className="h-7 rounded border bg-white px-1 text-xs" title={title} defaultValue="">
      <option value="" disabled>{placeholder}</option>
      {options.map((o: any) => <option key={o.v ?? o} value={o.v ?? o}>{o.l ?? o}</option>)}
    </select>
  )
  const Sep = () => <div className="mx-1 h-5 w-px bg-slate-300" />

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 bg-slate-50 px-2 py-1.5">
        <Btn onClick={() => cmd("undo")} title="Undo"><Undo2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("redo")} title="Redo"><Redo2 className="h-4 w-4" /></Btn>
        <Sep />
        <Sel title="Paragraph style" placeholder="Style" onChange={(v: string) => cmd("formatBlock", v)}
          options={[{ v: "P", l: "Normal" }, { v: "H1", l: "Heading 1" }, { v: "H2", l: "Heading 2" }, { v: "H3", l: "Heading 3" }, { v: "H4", l: "Heading 4" }, { v: "BLOCKQUOTE", l: "Quote" }, { v: "PRE", l: "Code" }]} />
        <Sel title="Font" placeholder="Font" onChange={(v: string) => v === "Default" ? cmd("removeFormat") : cmd("fontName", v)} options={FONTS} />
        <Sel title="Font size" placeholder="Size" onChange={(v: string) => wrapStyle({ fontSize: `${v}px` })} options={SIZES} />
        <Btn onClick={() => adjustFontSize(2)} title="Grow font"><ChevronUp className="h-4 w-4" /></Btn>
        <Btn onClick={() => adjustFontSize(-2)} title="Shrink font"><ChevronDownIcon className="h-4 w-4" /></Btn>
        <Sel title="Change case" placeholder="Aa" onChange={changeCase}
          options={[{ v: "sentence", l: "Sentence case" }, { v: "lower", l: "lowercase" }, { v: "upper", l: "UPPERCASE" }, { v: "title", l: "Capitalize Each Word" }]} />
        <Sep />
        <Btn onClick={() => cmd("bold")} title="Bold"><Bold className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("italic")} title="Italic"><Italic className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("underline")} title="Underline"><Underline className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("strikeThrough")} title="Strikethrough"><Strikethrough className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("subscript")} title="Subscript"><Subscript className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("superscript")} title="Superscript"><Superscript className="h-4 w-4" /></Btn>
        <Swatches icon={<Baseline className="h-4 w-4" />} title="Text color" colors={TEXT_COLORS} onPick={(c) => cmd("foreColor", c)} />
        <Swatches icon={<Highlighter className="h-4 w-4" />} title="Highlight" colors={HILITES} onPick={(c) => cmd("hiliteColor", c)} />
        <Swatches icon={<PaintBucket className="h-4 w-4" />} title="Shading (fill)" colors={SHADES} onPick={(c) => setBlockStyle("backgroundColor", c)} />
        <Sep />
        <Btn onClick={() => cmd("justifyLeft")} title="Align left"><AlignLeft className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("justifyCenter")} title="Align center"><AlignCenter className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("justifyRight")} title="Align right"><AlignRight className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("justifyFull")} title="Justify"><AlignJustify className="h-4 w-4" /></Btn>
        <Sel title="Line spacing" placeholder="↕" onChange={(v: string) => setBlockStyle("lineHeight", v)} options={LINE_SPACING.map((l) => ({ v: l.value, l: l.label }))} />
        <Btn onClick={() => setDir("ltr")} title="Left-to-right"><ChevronsRight className="h-4 w-4" /></Btn>
        <Btn onClick={() => setDir("rtl")} title="Right-to-left (Arabic)"><ChevronsLeft className="h-4 w-4" /></Btn>
        <Sep />
        <Btn onClick={() => cmd("insertUnorderedList")} title="Bullet list"><List className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("insertOrderedList")} title="Numbered list"><ListOrdered className="h-4 w-4" /></Btn>
        <Btn onClick={insertChecklist} title="Checklist"><ListChecks className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("outdent")} title="Decrease indent"><Outdent className="h-4 w-4" /></Btn>
        <Btn onClick={() => cmd("indent")} title="Increase indent"><Indent className="h-4 w-4" /></Btn>
        <Sep />
        <Btn onClick={insertLink} title="Insert link"><Link2 className="h-4 w-4" /></Btn>
        <Btn onClick={insertTable} title="Insert table"><TableIcon className="h-4 w-4" /></Btn>
        <Btn onClick={() => imgInputRef.current?.click()} title="Insert picture">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
        </Btn>
        <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
        <SymbolPicker onPick={insertSymbol} />
        <Btn onClick={insertDropCap} title="Drop cap"><Type className="h-4 w-4" /></Btn>
        <Btn onClick={insertTextBox} title="Text box"><span className="text-[11px] font-bold">▭</span></Btn>
        <Btn onClick={() => cmd("insertHorizontalRule")} title="Horizontal rule"><Minus className="h-4 w-4" /></Btn>
        <Btn onClick={insertPageBreak} title="Page break"><SeparatorHorizontal className="h-4 w-4" /></Btn>
        <Sep />
        <Btn onClick={() => cmd("removeFormat")} title="Clear formatting"><Eraser className="h-4 w-4" /></Btn>
        <Btn onClick={toggleMarks} title="Formatting marks" active={marks}><Pilcrow className="h-4 w-4" /></Btn>
        <Btn onClick={() => setShowFind((v) => !v)} title="Find & replace" active={showFind}><Search className="h-4 w-4" /></Btn>
        <div className="ml-auto flex items-center gap-2">
          {autoSavedAt && <span className="text-[10px] text-muted-foreground">Draft saved {autoSavedAt}</span>}
          <button onClick={() => setShowSaveModal(true)} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Save version</button>
        </div>
      </div>

      {showFind && <FindReplace getRoot={() => ref.current} />}

      {!loaded && <div className="flex items-center justify-center border py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}
      <div ref={ref} contentEditable={loaded} suppressContentEditableWarning
        className="brd-doc min-h-[62vh] max-w-none rounded-b-lg border bg-white p-8 outline-none focus:ring-2 focus:ring-indigo-200"
        style={{ display: loaded ? "block" : "none" }} />

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSaveModal(false)}>
          <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">Describe your changes</h3>
            <p className="mt-1 text-xs text-muted-foreground">Stored in the version history (required).</p>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} autoFocus
              placeholder="e.g. Added the authentication scope section"
              className="mt-3 w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
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

function Swatches({ icon, title, colors, onPick }: { icon: React.ReactNode; title: string; colors: string[]; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} title={title} className="flex items-center rounded p-1.5 text-slate-600 hover:bg-slate-200">
        {icon}<ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 grid grid-cols-5 gap-1 rounded-lg border bg-white p-2 shadow-lg">
            {colors.map((c) => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setOpen(false) }}
                className="h-5 w-5 rounded border border-slate-300"
                style={{ backgroundColor: c === "transparent" ? "#fff" : c, backgroundImage: c === "transparent" ? "linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)" : undefined }} title={c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SymbolPicker({ onPick }: { onPick: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} title="Insert symbol" className="flex items-center rounded p-1.5 text-slate-600 hover:bg-slate-200">
        <Sigma className="h-4 w-4" /><ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 grid w-48 grid-cols-8 gap-0.5 rounded-lg border bg-white p-2 shadow-lg">
            {SYMBOLS.map((s) => (
              <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(s); setOpen(false) }} className="h-6 w-6 rounded text-sm hover:bg-slate-100">{s}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

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
  const highlightCurrent = (pos: number) => {
    const root = getRoot(); if (!root) return
    const hits = [...root.querySelectorAll("[data-find-hit]")]
    hits.forEach((h) => h.removeAttribute("data-find-current"))
    const el = hits[pos - 1]
    if (el) { el.setAttribute("data-find-current", ""); el.scrollIntoView({ block: "center", behavior: "smooth" }) }
  }
  const runFind = useCallback((term: string) => {
    const root = getRoot(); if (!root) return
    clearHits(root)
    if (!term) { setCount(0); setCurrent(0); return }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []; let n: Node | null
    while ((n = walker.nextNode())) nodes.push(n as Text)
    let hits = 0; const lower = term.toLowerCase()
    nodes.forEach((tn) => {
      const text = tn.nodeValue || ""; if (!text.toLowerCase().includes(lower)) return
      const frag = document.createDocumentFragment(); let i = 0, idx: number; const tl = text.toLowerCase()
      while ((idx = tl.indexOf(lower, i)) !== -1) {
        if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)))
        const mark = document.createElement("span"); mark.setAttribute("data-find-hit", ""); mark.textContent = text.slice(idx, idx + term.length)
        frag.appendChild(mark); hits++; i = idx + term.length
      }
      if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)))
      tn.parentNode?.replaceChild(frag, tn)
    })
    setCount(hits); setCurrent(hits ? 1 : 0); highlightCurrent(1)
  }, [getRoot])
  const step = (dir: number) => {
    if (count === 0) return
    let next = current + dir; if (next < 1) next = count; if (next > count) next = 1
    setCurrent(next); highlightCurrent(next)
  }
  const doReplace = (all: boolean) => {
    const root = getRoot(); if (!root || !find) return
    const hits = [...root.querySelectorAll("[data-find-hit]")]
    const targets = all ? hits : hits[current - 1] ? [hits[current - 1]] : []
    targets.forEach((el) => { const p = el.parentNode!; p.replaceChild(document.createTextNode(replace), el); p.normalize() })
    runFind(find)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-x bg-amber-50 px-3 py-2 text-sm">
      <input value={find} onChange={(e) => { setFind(e.target.value); runFind(e.target.value) }} placeholder="Find" className="h-8 w-40 rounded border bg-white px-2 text-sm outline-none" />
      <span className="text-xs text-muted-foreground">{count ? `${current}/${count}` : "0 results"}</span>
      <button onClick={() => step(-1)} className="rounded border bg-white px-2 py-1 text-xs">Prev</button>
      <button onClick={() => step(1)} className="rounded border bg-white px-2 py-1 text-xs">Next</button>
      <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with" className="h-8 w-40 rounded border bg-white px-2 text-sm outline-none" />
      <button onClick={() => doReplace(false)} className="rounded border bg-white px-2 py-1 text-xs font-semibold">Replace</button>
      <button onClick={() => doReplace(true)} className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">Replace all</button>
    </div>
  )
}
