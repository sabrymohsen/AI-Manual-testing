import archiver from "archiver"
import fs from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/db"
import { generateMarkdownReport } from "./markdown-generator"

export async function generateZipArtifacts(testRunId: string): Promise<string> {
  const testRun = await prisma.testRun.findUnique({
    where: { id: testRunId },
    include: {
      stepResults: true,
    },
  })

  if (!testRun) throw new Error("Test run not found")

  const zipPath = path.join(
    process.env.STORAGE_ROOT || "./storage",
    "exports",
    `test-run-${testRunId}.zip`
  )

  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true })

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver("zip", { zlib: { level: 9 } })

    output.on("close", () => resolve(zipPath))
    archive.on("error", reject)

    archive.pipe(output)

    // Add markdown report
    generateMarkdownReport(testRunId)
      .then((markdown) => {
        archive.append(markdown, { name: "report.md" })
      })
      .catch(() => {})

    // Add screenshots
    for (const step of testRun.stepResults) {
      if (step.screenshotBefore) {
        try {
          archive.file(step.screenshotBefore, {
            name: `screenshots/step-${step.stepNumber}-before.png`,
          })
        } catch { /* ignore missing files */ }
      }
      if (step.screenshotAfter) {
        try {
          archive.file(step.screenshotAfter, {
            name: `screenshots/step-${step.stepNumber}-after.png`,
          })
        } catch { /* ignore missing files */ }
      }
    }

    archive.finalize()
  })
}
