"use client"

import React from "react"
import Link from "next/link"

/**
 * Chat message formatting.
 *
 * The composer is a plain textarea, so formatting is stored as lightweight
 * markdown in the message text and rendered here into React nodes. Everything
 * is built as elements — never injected as HTML — so a message can't smuggle
 * markup into the page.
 *
 * Supported: **bold**, *italic*, ~~strike~~, `code`, "- " bullets, "1. " numbered
 * lists, @person mentions and #ITEM references.
 */

export interface EntityRef {
  type: string
  id: string
  key: string
  label: string
  url?: string
}

export interface MentionablePerson {
  id: string
  name: string | null
  email: string
}

/** Colour per referenced entity type; keep in sync with the pickers. */
export const ENTITY_CHIP: Record<string, string> = {
  TASK: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  SUBTASK: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100",
  BUG_REPORT: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
  TEST_CASE: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
  BRD_DOCUMENT: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
  REQUIREMENT: "bg-primary/10 text-primary border-primary/25 hover:bg-primary/15",
  TEST_RUN: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
}
const ENTITY_CHIP_FALLBACK = "bg-muted text-muted-foreground border-border hover:bg-muted"

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Inline pass: emphasis, code, @mentions and #references.
 *
 * People are matched from the roster rather than by a word pattern, because
 * display names contain spaces ("@Layla Hassan") and a naive \w+ match would
 * only colour the first word.
 */
function renderInline(
  text: string,
  people: MentionablePerson[],
  entities: EntityRef[],
  keyPrefix: string
): React.ReactNode[] {
  const names = people
    .map((p) => p.name || p.email)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length) // longest first: "Ann Lee" before "Ann"

  const alternatives = [
    "\\*\\*[^*]+\\*\\*",
    "~~[^~]+~~",
    "`[^`]+`",
    "\\*[^*\\n]+\\*",
    // (?<![^\s]) = only at the start of the text or after whitespace, so an
    // email address like a@b.com is never mistaken for a mention.
    ...(names.length ? [`(?<![^\\s])@(?:${names.map(escapeRe).join("|")})`] : []),
    "(?<![^\\s])@[\\w.-]+",
    "(?<![^\\s])#[A-Za-z][\\w-]*",
  ]
  const re = new RegExp(`(${alternatives.join("|")})`, "g")

  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const k = `${keyPrefix}-${i++}`

    if (tok.startsWith("**") && tok.endsWith("**")) {
      out.push(<strong key={k} className="font-semibold">{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith("~~") && tok.endsWith("~~")) {
      out.push(<s key={k} className="opacity-70">{tok.slice(2, -2)}</s>)
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      out.push(
        <code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
          {tok.slice(1, -1)}
        </code>
      )
    } else if (tok.startsWith("**") === false && tok.startsWith("*") && tok.endsWith("*")) {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>)
    } else if (tok.startsWith("@")) {
      // People mentions read as links, so they must not look like body text.
      out.push(
        <span
          key={k}
          className="rounded bg-blue-50 px-1 py-0.5 font-semibold text-blue-700"
        >
          {tok}
        </span>
      )
    } else if (tok.startsWith("#")) {
      const key = tok.slice(1)
      const ref = entities.find((e) => e.key === key)
      const cls = ref ? ENTITY_CHIP[ref.type] ?? ENTITY_CHIP_FALLBACK : ENTITY_CHIP_FALLBACK
      const content = (
        <span className={`rounded border px-1 py-0.5 text-[0.85em] font-semibold transition-colors ${cls}`}>
          {tok}
        </span>
      )
      out.push(
        ref?.url ? (
          <Link key={k} href={ref.url} title={ref.label}>
            {content}
          </Link>
        ) : (
          <React.Fragment key={k}>{content}</React.Fragment>
        )
      )
    } else {
      out.push(tok)
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Render a chat message body: block structure first, then inline formatting. */
export function FormattedMessage({
  content,
  people = [],
  entities = [],
}: {
  content: string
  people?: MentionablePerson[]
  entities?: EntityRef[]
}) {
  const lines = (content ?? "").split("\n")
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? "ol" : "ul"
    blocks.push(
      <Tag
        key={`l-${blocks.length}`}
        className={`my-1 space-y-0.5 pl-6 ${list.ordered ? "list-decimal" : "list-disc"}`}
      >
        {list.items.map((it, i) => (
          <li key={i}>{renderInline(it, people, entities, `li-${blocks.length}-${i}`)}</li>
        ))}
      </Tag>
    )
    list = null
  }

  lines.forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (bullet) {
      if (list && list.ordered) flush()
      list = list ?? { ordered: false, items: [] }
      list.items.push(bullet[1])
      return
    }
    if (numbered) {
      if (list && !list.ordered) flush()
      list = list ?? { ordered: true, items: [] }
      list.items.push(numbered[1])
      return
    }
    flush()
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${idx}`} className="h-2" />)
      return
    }
    blocks.push(
      <p key={`p-${idx}`} className="whitespace-pre-wrap break-words">
        {renderInline(line, people, entities, `p-${idx}`)}
      </p>
    )
  })
  flush()

  return <>{blocks}</>
}

/**
 * Serialise a TipTap document to the lightweight markdown the renderer above
 * understands.
 *
 * The composer is WYSIWYG, but messages are stored as plain text: it keeps the
 * stored value readable, keeps notifications/previews sane, and avoids putting
 * user-authored HTML anywhere near the DOM.
 */
export function docToMarkdown(doc: any): string {
  if (!doc) return ""

  const inline = (node: any): string => {
    if (node.type === "hardBreak") return "\n"
    if (node.type !== "text") return (node.content ?? []).map(inline).join("")
    let t: string = node.text ?? ""
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") t = `**${t}**`
      else if (mark.type === "italic") t = `*${t}*`
      else if (mark.type === "strike") t = `~~${t}~~`
      else if (mark.type === "code") t = `\`${t}\``
    }
    return t
  }

  const block = (node: any): string[] => {
    switch (node.type) {
      case "paragraph":
        return [(node.content ?? []).map(inline).join("")]
      case "bulletList":
        return (node.content ?? []).map(
          (li: any) => `- ${(li.content ?? []).map((p: any) => (p.content ?? []).map(inline).join("")).join(" ")}`
        )
      case "orderedList":
        return (node.content ?? []).map(
          (li: any, i: number) =>
            `${i + 1}. ${(li.content ?? []).map((p: any) => (p.content ?? []).map(inline).join("")).join(" ")}`
        )
      case "codeBlock":
        return [(node.content ?? []).map(inline).join("")]
      default:
        return node.content ? (node.content as any[]).flatMap(block) : []
    }
  }

  return (doc.content ?? []).flatMap(block).join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
