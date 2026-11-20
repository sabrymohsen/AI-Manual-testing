import archiver from "archiver"
import { PassThrough } from "stream"
import { needsStepsRuntime, STEPS_RUNTIME_FILE } from "@/lib/plain-english/to-playwright"
import { QA_STEPS_RUNTIME } from "@/lib/plain-english/runtime/qa-steps-runtime.generated"
import { specBaseName } from "@/lib/hub-workspace"

/**
 * The Automation Hub's tests as an ordinary Playwright project, so a team can
 * run them anywhere (their laptop, CI) or keep developing them in an IDE:
 *
 *   package.json  playwright.config.js  .env.example  README.md
 *   tests/<folder>/<test>.spec.js   (+ qa-steps.cjs where no-code tests need it)
 */

export const PLAYWRIGHT_VERSION = "1.60.0"

export interface ExportScript {
  name: string
  folder: string
  code: string
  mode?: string | null
  tags?: string[]
}

const folderPath = (folder: string) =>
  folder
    .split("/")
    .map((p) => p.trim().replace(/[^\p{L}\p{N} _-]+/gu, "").replace(/\s+/g, "-"))
    .filter(Boolean)
    .join("/")

export function exportFiles(projectName: string, scripts: ExportScript[]): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  const used = new Set<string>()
  const runtimeDirs = new Set<string>()

  for (const s of scripts) {
    const dir = ["tests", folderPath(s.folder)].filter(Boolean).join("/")
    let base = specBaseName(s.name)
    for (let i = 2; used.has(`${dir}/${base}`); i++) base = `${specBaseName(s.name)}_${i}`
    used.add(`${dir}/${base}`)
    files.push({ path: `${dir}/${base}.spec.js`, content: s.code })
    if (needsStepsRuntime(s.code)) runtimeDirs.add(dir)
  }
  for (const dir of runtimeDirs) files.push({ path: `${dir}/${STEPS_RUNTIME_FILE}`, content: QA_STEPS_RUNTIME })

  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "qa-engine-tests"
  files.push({
    path: "package.json",
    content:
      JSON.stringify(
        {
          name: `${slug}-tests`,
          private: true,
          description: `Automated tests for ${projectName}, exported from QA Engine's Automation Hub.`,
          scripts: {
            test: "playwright test",
            "test:headed": "playwright test --headed",
            report: "playwright show-report",
          },
          devDependencies: { "@playwright/test": PLAYWRIGHT_VERSION },
        },
        null,
        2
      ) + "\n",
  })
  files.push({
    path: "playwright.config.js",
    content: `// Exported from QA Engine. Same settings the Automation Hub runs with.
const { defineConfig, devices } = require("@playwright/test")

module.exports = defineConfig({
  testDir: "tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
})
`,
  })
  files.push({
    path: ".env.example",
    content: `# Optional. No-code tests read these (QA Engine sets them from Test Data Manager when it runs them).
# Run on another site (e.g. staging): every page the tests open moves to this address.
QA_BASE_URL=
# Test data the steps use as {name}, as JSON:
QA_VARS={"username":"","password":""}
`,
  })
  files.push({
    path: "README.md",
    content: `# ${projectName} — automated tests

Exported from QA Engine's Automation Hub: ${scripts.length} test file${scripts.length === 1 ? "" : "s"}.
This is a standard [Playwright](https://playwright.dev) project.

## Run

\`\`\`bash
npm install
npx playwright install        # downloads the browsers once
npx playwright test           # all tests, all browsers
npx playwright test --project=chromium --headed   # watch one browser
npx playwright show-report    # open the HTML report
\`\`\`

## Environments and test data

No-code tests (written as plain-English steps in QA Engine) read two optional variables:

- \`QA_BASE_URL\` — run against another site: \`QA_BASE_URL=https://staging.example.com npx playwright test\`
- \`QA_VARS\` — test data used as \`{name}\` in steps, as JSON: \`QA_VARS='{"username":"demo"}' npx playwright test\`

## Files

- \`tests/**/*.spec.js\` — the tests. Files that start with
  "Generated from plain-English steps" were written as steps in QA Engine; each step is a
  \`test.step\` named in plain English.
- \`tests/**/qa-steps.cjs\` — QA Engine's plain-English step runner, used by those tests
  to find elements the same way QA Engine does. Keep it next to them.
`,
  })
  return files
}

/** Zips the files into a Buffer. */
export async function zipFiles(rootName: string, files: { path: string; content: string }[]): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } })
  const out = new PassThrough()
  const chunks: Buffer[] = []
  out.on("data", (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((resolve, reject) => {
    out.on("end", () => resolve())
    archive.on("error", reject)
  })
  archive.pipe(out)
  for (const f of files) archive.append(f.content, { name: `${rootName}/${f.path}` })
  await archive.finalize()
  await done
  return Buffer.concat(chunks)
}
