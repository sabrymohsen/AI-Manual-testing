"use client"

import { useMemo, useState } from "react"
import { X, Copy, Download, Check, Code2, FileText } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import {
  stepsToNeutral,
  generatePlaywrightCode,
  type RecordedStepInput,
} from "@/lib/recording/code-generators"

interface Props {
  steps: RecordedStepInput[]
  title: string
  onClose: () => void
}

type MainTab = "playwright"
type ShaftSubTab = "class" | "pom" | "readme"

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // fallback: select all in a temporary textarea
      const el = document.createElement("textarea")
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="flex-1 overflow-auto rounded-xl bg-slate-950 text-slate-100 p-4 text-xs font-mono leading-relaxed whitespace-pre min-h-[280px]">
      {code}
    </pre>
  )
}

export function RecorderExportModal({ steps, title, onClose }: Props) {
  const [mainTab, setMainTab] = useState<MainTab>("playwright")

  const neutral = useMemo(() => stepsToNeutral(steps), [steps])

  const playwrightCode = useMemo(
    () => generatePlaywrightCode(neutral, title),
    [neutral, title]
  )

  const safeFilename = title.replace(/[^a-z0-9]/gi, "-").toLowerCase()

  const includedCount = neutral.length
  const totalCount = steps.length

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-xl w-full max-w-3xl flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.08)] animate-in fade-in zoom-in-95 duration-200 max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Code2 className="h-5 w-5 text-purple-500" />
              Export Test Code
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {includedCount} of {totalCount} steps included · {title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Zero-step warning */}
        {includedCount === 0 && (
          <div className="px-6 py-4 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-b">
            No steps are marked "Include in Test Case". Toggle at least one step to generate code.
          </div>
        )}

        {/* Main tabs */}
        <div className="flex border-b shrink-0 text-sm font-semibold bg-accent/10">
          <button
            onClick={() => setMainTab("playwright")}
            className={`flex items-center gap-2 px-6 py-3 border-r transition-colors ${
              mainTab === "playwright"
                ? "bg-background text-primary border-b-2 border-b-primary"
                : "text-muted-foreground hover:bg-accent/20"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Playwright (TypeScript)
          </button>
        </div>

        {/* Playwright tab */}
        {mainTab === "playwright" && (
          <div className="flex flex-col flex-1 p-4 gap-3 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <p className="text-xs text-muted-foreground">
                Playwright Test with{" "}
                <code className="font-mono text-foreground">@playwright/test</code>.
                Selectors use stable role/label/testid locators where available.
              </p>
              <div className="flex gap-2 shrink-0">
                <CopyButton text={playwrightCode} />
                <button
                  onClick={() =>
                    downloadText(playwrightCode, `${safeFilename}.spec.ts`)
                  }
                  className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  .spec.ts
                </button>
              </div>
            </div>
            <CodeBlock code={playwrightCode} />
          </div>
        )}


        {/* Footer */}
        <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Selectors are captured live — prefer{" "}
            <code className="font-mono text-foreground">data-testid</code> attributes
            for most reliable automation.
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
