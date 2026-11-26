"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, Globe, Loader2, RefreshCw, Wand2, X } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import { jsLocatorToPython, listedElements, parseSnapshot, roleLocator, type SnapElement } from "@/lib/browser-agent/snapshot"
import { LiveView, type AgentSettings } from "./browser-agent"
import { ElementList, useAgentPage } from "./record"

function CopyLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground" dir="ltr">
          {text}
        </code>
        <button onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))} className="rounded p-1 hover:bg-muted" title="Copy">
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

export function LocatorsPanel({ projectId, settings }: { projectId: string; settings: AgentSettings }) {
  const ap = useAgentPage(projectId, settings)
  const [sel, setSel] = useState<SnapElement | null>(null)
  const [exact, setExact] = useState<Record<string, string>>({})
  const elements = useMemo(() => listedElements(parseSnapshot(ap.snapshot)), [ap.snapshot])

  const pick = (e: SnapElement) => {
    setSel(e)
    if (exact[e.ref] === undefined) generate(e)
  }

  // playwright-cli's own locator for the element: unique on the page.
  const generate = (e: SnapElement) =>
    ap.run(async (b) => {
      const r = await b.exec("generate-locator", [e.ref])
      const loc = r.ok ? String(r.result?.result || "").trim() : ""
      setExact((x) => ({ ...x, [e.ref]: loc }))
    })

  const reread = () =>
    ap.run(async (b) => {
      await ap.refresh(b)
      setExact({})
      setSel(null)
    })

  const js = sel ? exact[sel.ref] : ""
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_1fr_minmax(0,380px)]">
      <div className="space-y-3 rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => ap.open(settings.startUrl).then((ok) => ok && (setExact({}), setSel(null)))} disabled={ap.busy}>
            {ap.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} {ap.isOpen ? "Reopen start page" : "Open start page"}
          </Button>
          {ap.isOpen && (
            <>
              <Button size="sm" variant="ghost" title="Read the page again (after you change it)" onClick={reread} disabled={ap.busy}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" title="Close the browser" onClick={ap.close} disabled={ap.busy}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        {ap.isOpen ? (
          <ElementList elements={elements} selected={sel?.ref} onSelect={pick} />
        ) : (
          <p className="text-xs font-normal text-muted-foreground">Open a page to list its buttons, links, fields and headings with locators you can paste into tests.</p>
        )}
        {ap.isOpen && settings.runsOn === "computer" && settings.headed && (
          <p className="text-xs font-normal text-muted-foreground">Go to another page in the visible browser, then press ↻ to list its elements.</p>
        )}
      </div>

      <LiveView shot={ap.shot} page={ap.page} busy={ap.busy} />

      <div className="space-y-3 rounded-xl border bg-card p-3">
        {sel ? (
          <>
            <p className="text-xs font-semibold text-foreground" dir="auto">
              {sel.role} “{sel.name || sel.value || "no name"}”
            </p>
            {js === undefined ? (
              <p className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding a unique locator…
              </p>
            ) : js ? (
              <>
                <CopyLine label="Playwright JavaScript (unique on this page)" text={`page.${js}`} />
                <CopyLine label="Playwright Python (pytest-playwright)" text={jsLocatorToPython(js)} />
              </>
            ) : (
              <p className="text-xs font-normal text-amber-700">
                Couldn&apos;t make a locator — the page changed. Press ↻ and pick it again.
                <button onClick={() => generate(sel)} className="ml-1 inline-flex items-center gap-1 text-primary hover:underline">
                  <Wand2 className="h-3 w-3" /> Retry
                </button>
              </p>
            )}
            {roleLocator(sel, "js") && roleLocator(sel, "js") !== `page.${js}` && (
              <>
                <CopyLine label="By role and name (JavaScript)" text={roleLocator(sel, "js")!} />
                <CopyLine label="By role and name (Python)" text={roleLocator(sel, "python")!} />
              </>
            )}
            <p className="text-xs font-normal text-muted-foreground">Role and name locators survive layout changes best; prefer them when they are unique.</p>
          </>
        ) : (
          <p className="text-xs font-normal text-muted-foreground">Pick an element to see its locators.</p>
        )}
      </div>
    </div>
  )
}
