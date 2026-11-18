import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import { sanitizeBrdHtml } from "@/lib/brd/sanitize"
import { sniffBrdType, diffText, normalize, htmlToText } from "@/lib/brd/content"

describe("sanitizeBrdHtml", () => {
  it("strips scripts, event handlers and javascript: links", () => {
    const out = sanitizeBrdHtml(
      `<p onclick="steal()">Hi<script>alert(1)</script></p>` +
        `<img src=x onerror="alert(1)">` +
        `<a href="javascript:alert(1)">bad</a>` +
        `<iframe src="https://evil.test"></iframe>` +
        `<svg onload="alert(1)"></svg>`
    )
    expect(out).not.toMatch(/script|onclick|onerror|onload|javascript:|iframe|svg/i)
    expect(out).toContain("Hi")
  })

  it("keeps document formatting", () => {
    const html =
      `<h2>Login</h2><p style="text-align: center"><strong>Bold</strong> <em>it</em></p>` +
      `<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>` +
      `<ul><li>one</li></ul><img src="/api/files/brds/p/b/img.png" alt="x">`
    const out = sanitizeBrdHtml(html)
    for (const frag of ["<h2>Login</h2>", "<strong>Bold</strong>", 'colspan="2"', "<li>one</li>", 'src="/api/files/brds/p/b/img.png"', "text-align: center"]) {
      expect(out).toContain(frag)
    }
  })

  it("makes links safe to open", () => {
    const out = sanitizeBrdHtml(`<a href="https://example.com">x</a>`)
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
})

describe("sniffBrdType", () => {
  it("recognises PDF and docx by their bytes, not their name", () => {
    expect(sniffBrdType(Buffer.from("%PDF-1.7\n..."))).toBe("pdf")
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....word/document.xml....")])
    expect(sniffBrdType(docx)).toBe("docx")
  })

  it("rejects other zips and arbitrary files", () => {
    expect(sniffBrdType(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("xl/workbook.xml")]))).toBeNull()
    expect(sniffBrdType(Buffer.from("<html><script>"))).toBeNull()
    expect(sniffBrdType(Buffer.alloc(0))).toBeNull()
  })
})

describe("diffText", () => {
  it("reports added and removed paragraphs, ignoring whitespace changes", () => {
    const a = "Intro\n\nUser logs in with email.\n\nPassword min 8 chars."
    const b = "Intro\n\nUser  logs in with email.\n\nPassword min 12 chars.\n\nLock after 5 tries."
    const ops = diffText(a, b)
    expect(ops.filter((o) => o.op === "removed").map((o) => o.text)).toEqual(["Password min 8 chars."])
    expect(ops.filter((o) => o.op === "added").map((o) => o.text)).toEqual(["Password min 12 chars.", "Lock after 5 tries."])
    expect(ops.filter((o) => o.op === "same")).toHaveLength(2)
  })
})

describe("text helpers", () => {
  it("normalize ignores case, punctuation and spacing (incl. Arabic)", () => {
    expect(normalize("  The User, MUST log-in! ")).toBe("the user must log in")
    expect(normalize("يجب على المستخدم   تسجيل الدخول.")).toBe("يجب على المستخدم تسجيل الدخول")
  })

  it("htmlToText keeps paragraph breaks", () => {
    expect(htmlToText("<p>One &amp; two</p><p>Three</p>")).toBe("One & two\nThree")
  })
})

describe("sanitizeBrdHtml — schemes", () => {
  it("blocks script-ish schemes but keeps relative links and inline images", () => {
    const out = sanitizeBrdHtml(
      `<a href="vbscript:x">a</a><a href=" JaVaScRiPt:alert(1)">b</a><a href="data:text/html,<script>">c</a>` +
        `<a href="#sec-2">d</a><a href="/projects/x">e</a><img src="data:image/png;base64,iVBORw0KGgo=">`
    )
    expect(out).not.toMatch(/vbscript|javascript|data:text/i)
    expect(out).toContain('href="#sec-2"')
    expect(out).toContain('href="/projects/x"')
    expect(out).toContain('src="data:image/png;base64,')
  })
})
