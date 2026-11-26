"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useState } from "react"
import { exportPdf, exportDocx, exportXlsx } from "@/lib/reports/export"
import type { ProjectReport } from "@/lib/reports/types"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Download, FileText, FileSpreadsheet, FileType, Loader2, ChevronDown } from "@/components/ui/icons"

/**
 * Export the dashboard using the existing exporters. PDF/Word capture the live
 * dashboard element; Excel builds a workbook from the project report dataset.
 */
export function ExportMenu({
  report,
  captureRef,
  roleLabel,
}: {
  report?: ProjectReport
  captureRef: React.RefObject<HTMLElement>
  roleLabel: string
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (kind: "pdf" | "docx" | "xlsx") => {
    if (!report) return
    setBusy(kind)
    try {
      if (kind === "xlsx") await exportXlsx(report)
      else if (captureRef.current) {
        if (kind === "pdf") await exportPdf(captureRef.current, report)
        else await exportDocx(captureRef.current, report, roleLabel)
      }
    } catch (e) {
      console.error("Export failed", e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={!report || !!busy}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <BusyDot /> : <Download className="h-4 w-4" />} Export
          <ChevronDown className="h-3 w-3 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => run("pdf")}>
          <FileText className="mr-2 h-4 w-4 text-rose-600" /> PDF (dashboard)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("xlsx")}>
          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Excel (data)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("docx")}>
          <FileType className="mr-2 h-4 w-4 text-blue-600" /> Word (report)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
