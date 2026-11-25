import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { nextBugKey } from "@/lib/bug-reports/keys"
import { resolveBugSuiteId } from "@/lib/bug-reports/module"
import { importDir, SAFE_SHOT } from "@/lib/bug-reports/pdf-import-storage"
import { storageRoot } from "@/lib/storage/resolve-file"

export const runtime = "nodejs"

const PRIORITY = z.enum(["Low", "Medium", "High", "Critical"])

const bugSchema = z.object({
  ref: z.string().max(40),
  title: z.string().min(1, "Every bug needs a title").max(500),
  severity: PRIORITY,
  priority: PRIORITY,
  suiteId: z.string().nullable().optional(),
  stepsToReproduce: z.string().max(20000),
  expectedResult: z.string().max(20000),
  actualResult: z.string().max(20000),
  pageUrl: z.string().max(2000).nullable().optional(),
  testName: z.string().max(300).optional(),
  screenshots: z.array(z.string().regex(SAFE_SHOT)).max(20),
})

const bodySchema = z.object({
  importId: z.string().uuid(),
  fileName: z.string().max(500).optional(),
  environment: z.enum(["Dev", "Staging", "UAT", "Production"]).optional(),
  bugs: z.array(bugSchema).min(1, "Select at least one bug").max(200),
})

/**
 * POST /api/projects/:projectId/bug-reports/import-pdf/commit
 *
 * Step 2 of "Import bugs from PDF": create the bugs the tester kept in the
 * preview, with the screenshots the preview cut out of the PDF attached.
 * Each bug is created in its own transaction so one bad row doesn't lose the
 * rest; the response lists what was created and what failed.
 */
export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  const { importId, fileName, environment, bugs } = parsed.data

  const dir = importDir(params.projectId, importId)
  if (!fs.existsSync(dir)) {
    return badRequestResponse("This import has expired. Upload the PDF again.")
  }

  const shotDir = path.join(storageRoot(), "bug-screenshots")
  fs.mkdirSync(shotDir, { recursive: true })

  const created: { ref: string; id: string; bugKey: string }[] = []
  const failed: { ref: string; error: string }[] = []

  for (const input of bugs) {
    try {
      // Copy the screenshots first; a missing file is skipped, not fatal.
      const files = input.screenshots
        .map((name) => ({ name, src: path.join(dir, name) }))
        .filter((f) => fs.existsSync(f.src))
        .map((f) => {
          const storedName = `${randomUUID()}-${f.name}`
          fs.copyFileSync(f.src, path.join(shotDir, storedName))
          return {
            fileName: f.name,
            filePath: `/api/files/bug-screenshots/${storedName}`,
            fileSize: fs.statSync(f.src).size,
          }
        })

      const suiteId = await resolveBugSuiteId(params.projectId, { suiteId: input.suiteId ?? null })
      const bugKey = await nextBugKey(params.projectId)
      const bug = await prisma.$transaction(async (tx) => {
        const row = await tx.bugReport.create({
          data: {
            bugKey,
            title: input.title.trim(),
            projectId: params.projectId,
            suiteId,
            severity: input.severity,
            priority: input.priority,
            status: "Open",
            environment: environment || "Staging",
            stepsToReproduce: input.stepsToReproduce,
            expectedResult: input.expectedResult,
            actualResult: input.actualResult,
            pageUrl: input.pageUrl || null,
            screenshotPath: files[0]?.filePath || null,
            reporterId: auth.session!.user.id,
            source: "Automation",
            tags: ["automation", "pdf-import"],
            roleUsed: "None",
            browser: "Chromium",
            viewport: "Desktop",
            bugAttachments: files.length
              ? { create: files.map((f) => ({ ...f, fileType: "image/png" })) }
              : undefined,
          },
        })
        await tx.bugActivity.create({
          data: {
            bugId: row.id,
            action: "Bug Created",
            details:
              `Imported from the automation bug report${fileName ? ` "${fileName}"` : ""} (${input.ref}` +
              `${input.testName ? `, test ${input.testName}` : ""}) with ${files.length} screenshot(s).`,
          },
        })
        return row
      })
      created.push({ ref: input.ref, id: bug.id, bugKey: bug.bugKey || bugKey })
    } catch (e: any) {
      console.error(`import-pdf commit failed for ${input.ref}:`, e)
      failed.push({ ref: input.ref, error: e?.message || String(e) })
    }
  }

  // Keep the import folder if something failed so the tester can retry those.
  if (!failed.length) fs.rmSync(dir, { recursive: true, force: true })

  return NextResponse.json({ created, failed }, { status: created.length ? 201 : 400 })
}
