"use client"

import { PromptDialog } from "@/components/ui/prompt-dialog"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { TextStyle, FontSize } from "@tiptap/extension-text-style"
import { useEffect, useState } from "react"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link2,
  Link2Off,
  Type,
  Eraser,
} from "@/components/ui/icons"
import { cn } from "@/lib/utils"

/** Font-size presets exposed in the toolbar (value is the CSS font-size). */
const FONT_SIZES: { label: string; value: string }[] = [
  { label: "Small", value: "12px" },
  { label: "Normal", value: "14px" },
  { label: "Medium", value: "16px" },
  { label: "Large", value: "20px" },
  { label: "Huge", value: "28px" },
]

/**
 * Rich text editor for task descriptions & comments. Emits HTML via onChange.
 * Supports bold/italic/underline/strike, H1/H2, bullet & numbered lists,
 * blockquote, inline code, links, and per-selection font size.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Add a description…",
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, HTMLAttributes: { class: "rte-link" } },
      }),
      TextStyle,
      FontSize,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "rte-content min-h-[130px] focus:outline-none px-3 py-2",
        "aria-label": "Rich text editor",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-ring">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const currentSize = editor.getAttributes("textStyle").fontSize || ""

  const [linkOpen, setLinkOpen] = useState(false)
  const setLink = () => setLinkOpen(true)
  const applyLink = (url: string) => {
    setLinkOpen(false)
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run()
  }

  return (
    <>
    <PromptDialog
      open={linkOpen}
      title="Link"
      label="Link address (leave empty to remove the link)"
      placeholder="https://"
      initialValue={(editor.getAttributes("link").href as string | undefined) || "https://"}
      confirmLabel="Apply"
      allowEmpty
      onCancel={() => setLinkOpen(false)}
      onSubmit={applyLink}
    />
    <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/30 px-2 py-1">
      {/* Font size */}
      <div className="mr-1 flex items-center gap-1" title="Font size">
        <Type className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={currentSize}
          onChange={(e) => {
            const v = e.target.value
            if (v) editor.chain().focus().setFontSize(v).run()
            else editor.chain().focus().unsetFontSize().run()
          }}
          className="h-6 rounded border border-input bg-background px-1 text-xs focus:outline-none"
        >
          <option value="">Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <Divider />

      <Btn label="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-3.5 w-3.5" />
      </Btn>

      <Divider />

      <Btn label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-3.5 w-3.5" />
      </Btn>

      <Divider />

      <Btn label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code2 className="h-3.5 w-3.5" />
      </Btn>

      <Divider />

      <Btn label="Add / edit link" active={editor.isActive("link")} onClick={setLink}>
        <Link2 className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Remove link" active={false} disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().unsetLink().run()}>
        <Link2Off className="h-3.5 w-3.5" />
      </Btn>
      <Btn label="Clear formatting" active={false} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
        <Eraser className="h-3.5 w-3.5" />
      </Btn>
    </div>
    </>
  )
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-border" />
}

function Btn({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40",
        active && "bg-primary/10 text-primary"
      )}
    >
      {children}
    </button>
  )
}
