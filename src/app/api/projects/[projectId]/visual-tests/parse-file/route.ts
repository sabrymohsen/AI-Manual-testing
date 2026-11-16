import { NextResponse } from "next/server"
import { errorResponse, guardProject } from "@/lib/visual-tests/access"
import { parseUrlList } from "@/lib/visual-tests/url-tools"

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Read web addresses out of an uploaded file: .txt, .csv, .xml (sitemap) or
^ * .xlsx (every cell of every sheet that looks like a URL).
 */
export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const g = await guardProject(params.projectId)
  if (!g.ok) return g.response
  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get("file")
    const base = (form?.get("startUrl") as string | null) || undefined
    if (!file || typeof file === "string") return NextResponse.json({ error: "Choose a file" }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is larger than 5 MB" }, { status: 400 })
    const name = file.name.toLowerCase()
    const buffer = Buffer.from(await file.arrayBuffer())

    let text: string
    if (name.endsWith(".xlsx")) {
      const ExcelJS = (await import("exceljs")).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer as any)
      const cells: string[] = []
      wb.eachSheet(sheet =>
        sheet.eachRow(row =>
          row.eachCell(cell => {
            const v: any = cell.value
            const s = typeof v === "string" ? v : v?.hyperlink || v?.text || (v != null ? String(v) : "")
            if (s) cells.push(s)
          })
        )
      )
      text = cells.join("\n")
    } else if (/\.(txt|csv|tsv|xml)$/.test(name) || file.type.startsWith("text/") || file.type.includes("xml")) {
      text = buffer.toString("utf8")
    } else {
      return NextResponse.json({ error: "Upload a .txt, .csv, .xml or .xlsx file" }, { status: 400 })
    }

    const pages = parseUrlList(text, base)
    return NextResponse.json({ pages: pages.map(p => ({ ...p, source: "file" })) })
  } catch (err) {
    return errorResponse(err, "Could not read that file")
  }
}
