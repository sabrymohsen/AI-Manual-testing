/**
 * Client-side report exporters: PDF (html2canvas → jspdf), Word (docx: report
 * image + structured data tables), Excel (exceljs: raw data sheets).
 *
 * All run in the browser (the Reports page is a client component). Charts are
 * preserved in PDF/Word by capturing the rendered report canvas; Excel carries
 * the underlying tabular data.
 */
import type { AnyReport } from "../types"

interface TableSpec {
  name: string
  columns: string[]
  rows: (string | number)[][]
}

/** Flatten a report into tabular sections shared by Word + Excel. */
export function reportToTables(report: AnyReport): TableSpec[] {
  if (report.scope === "org") {
    return [
      {
        name: "Projects",
        columns: ["Project", "Environment", "Test Cases", "Runs", "Pass %", "Open Defects", "Total Defects"],
        rows: report.projects.map((p) => [p.name, p.environment, p.testCases, p.runs, p.passRate, p.openDefects, p.totalDefects]),
      },
      { name: "Defects by Severity", columns: ["Severity", "Count"], rows: report.defectsBySeverity.map((b) => [b.label, b.value]) },
      { name: "Defects by Status", columns: ["Status", "Count"], rows: report.defectsByStatus.map((b) => [b.label, b.value]) },
      { name: "Top Risks", columns: ["Key", "Title", "Severity", "Status", "Project"], rows: report.topRisks.map((x) => [x.bugKey, x.title, x.severity, x.status, x.project]) },
      { name: "Pass Rate Trend", columns: ["Date", "Passed", "Failed", "Total", "Pass %"], rows: report.passRateTrend.map((t) => [t.date, t.passed, t.failed, t.total, t.passRate]) },
    ]
  }
  return [
    {
      name: "Summary",
      columns: ["Metric", "Value"],
      rows: [
        ["Test Cases", report.summary.testCases], ["Automated", report.summary.automated], ["Manual", report.summary.manual],
        ["Runs", report.summary.runs], ["Pass Rate %", report.summary.passRate], ["Requirements", report.summary.requirements],
        ["Open Defects", report.summary.openDefects], ["Total Defects", report.summary.totalDefects],
      ],
    },
    { name: "Run Outcomes", columns: ["Status", "Count"], rows: report.runStatus.map((b) => [b.label, b.value]) },
    { name: "Defects by Severity", columns: ["Severity", "Count"], rows: report.defectsBySeverity.map((b) => [b.label, b.value]) },
    { name: "Defects by Status", columns: ["Status", "Count"], rows: report.defectsByStatus.map((b) => [b.label, b.value]) },
    { name: "Failing Tests", columns: ["Test Case", "Last Outcome", "Runs"], rows: report.failedTests.map((t) => [t.title, t.lastStatus, t.runs]) },
    { name: "Traceability", columns: ["Key", "Requirement", "Status", "Linked Cases"], rows: report.requirementsTraceability.map((t) => [t.key, t.title, t.status, t.linkedCases]) },
    { name: "Execution Trend", columns: ["Date", "Passed", "Failed", "Total", "Pass %"], rows: report.executionTrend.map((t) => [t.date, t.passed, t.failed, t.total, t.passRate]) },
  ]
}

function reportTitle(report: AnyReport): string {
  return report.scope === "org" ? "All Projects — QA Report" : `${report.project.name} — QA Report`
}

/** Capture an element to a PNG data URL via html2canvas. */
async function captureElement(el: HTMLElement): Promise<{ dataUrl: string; width: number; height: number }> {
  const html2canvas = (await import("html2canvas")).default
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false })
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ─── PDF ────────────────────────────────────────────────────────────────────────

export async function exportPdf(el: HTMLElement, report: AnyReport): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const { dataUrl, width, height } = await captureElement(el)
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW
  const imgH = (height * imgW) / width

  let remaining = imgH
  let position = 0
  // Slice the tall capture across pages.
  while (remaining > 0) {
    pdf.addImage(dataUrl, "PNG", 0, position ? -(imgH - remaining) : 0, imgW, imgH, undefined, "FAST")
    remaining -= pageH
    if (remaining > 0) {
      pdf.addPage()
      position += pageH
    }
  }
  pdf.save(`${reportTitle(report).replace(/[^\w]+/g, "_")}.pdf`)
}

// ─── Word (.docx) ────────────────────────────────────────────────────────────────

export async function exportDocx(el: HTMLElement, report: AnyReport, roleLabel: string): Promise<void> {
  const docx = await import("docx")
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, ImageRun } = docx

  const { dataUrl, width, height } = await captureElement(el)
  const imgBytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0))
  const imgW = 600
  const imgH = Math.round((height * imgW) / width)

  const tables = reportToTables(report)
  const children: any[] = [
    new Paragraph({ text: reportTitle(report), heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `${roleLabel} report · generated ${new Date(report.generatedAt).toLocaleString()}`, italics: true, size: 18, color: "666666" })] }),
    new Paragraph({ children: [new ImageRun({ data: imgBytes, transformation: { width: imgW, height: imgH } } as any)] }),
  ]

  for (const t of tables) {
    children.push(new Paragraph({ text: t.name, heading: HeadingLevel.HEADING_2 }))
    if (t.rows.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: "No data", italics: true, color: "999999" })] }))
      continue
    }
    const header = new TableRow({
      children: t.columns.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 18 })] })] })),
    })
    const body = t.rows.map((r) => new TableRow({
      children: r.map((cell) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 18 })] })] })),
    }))
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] }))
  }

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `${reportTitle(report).replace(/[^\w]+/g, "_")}.docx`)
}

// ─── Excel (.xlsx) ───────────────────────────────────────────────────────────────

export async function exportXlsx(report: AnyReport): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  wb.creator = "QA Engine"
  wb.created = new Date()

  for (const t of reportToTables(report)) {
    const ws = wb.addWorksheet(t.name.slice(0, 31))
    ws.addRow(t.columns)
    ws.getRow(1).font = { bold: true }
    for (const r of t.rows) ws.addRow(r)
    ws.columns.forEach((col) => {
      let max = 10
      col.eachCell?.({ includeEmpty: true }, (cell) => { max = Math.max(max, String(cell.value ?? "").length + 2) })
      col.width = Math.min(max, 60)
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  triggerDownload(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${reportTitle(report).replace(/[^\w]+/g, "_")}.xlsx`)
}
