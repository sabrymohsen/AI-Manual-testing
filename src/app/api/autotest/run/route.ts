import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { exec } from "child_process"
import * as fs from "fs"
import * as path from "path"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { scriptId, browser } = body

    if (!scriptId) {
      return NextResponse.json({ error: "Missing scriptId parameter" }, { status: 400 })
    }

    // Fetch the script code from the database
    const script = await prisma.testScript.findUnique({
      where: { id: scriptId }
    })

    if (!script) {
      return NextResponse.json({ error: "Test script not found" }, { status: 404 })
    }

    // 1. Write the code into the Java file inside our maven project
    const mavenProjPath = "/Users/sabrymohsen/Desktop/AI-Manual-testing/shaft-engine-core"
    const javaFilePath = path.join(
      mavenProjPath,
      "src/test/java/com/ourcompany/tests",
      `${script.name}.java`
    )

    // Ensure the folder exists
    fs.mkdirSync(path.dirname(javaFilePath), { recursive: true })
    
    // Write code to the file
    fs.writeFileSync(javaFilePath, script.code, "utf8")

    // 2. Prepare custom overrides properties for target browser if browser option specified
    if (browser) {
      const customPropsPath = path.join(mavenProjPath, "src/main/resources/properties/custom.properties")
      let propsContent = ""
      if (fs.existsSync(customPropsPath)) {
        propsContent = fs.readFileSync(customPropsPath, "utf8")
      }
      
      // Update browser property in custom.properties
      const browserValue = browser.toLowerCase() === "headless" ? "chrome" : browser.toLowerCase()
      const headlessValue = browser.toLowerCase() === "headless" ? "true" : "false"
      
      let lines = propsContent.split("\n")
      let hasBrowser = false
      let hasHeadless = false
      
      lines = lines.map(line => {
        if (line.trim().startsWith("targetBrowserName")) {
          hasBrowser = true
          return `targetBrowserName=${browserValue}`
        }
        if (line.trim().startsWith("headlessExecution")) {
          hasHeadless = true
          return `headlessExecution=${headlessValue}`
        }
        return line
      })
      
      if (!hasBrowser) lines.push(`targetBrowserName=${browserValue}`)
      if (!hasHeadless) lines.push(`headlessExecution=${headlessValue}`)
      
      fs.writeFileSync(customPropsPath, lines.join("\n"), "utf8")
    }

    // 3. Spawns Maven test runner
    const cmd = `JAVA_HOME=/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home mvn test -Dtest=${script.name}`
    
    // Perform execution in Promise
    const runTestPromise = (): Promise<{ status: string; logOutput: string }> => {
      return new Promise((resolve) => {
        exec(cmd, { cwd: mavenProjPath }, (error, stdout, stderr) => {
          const logOutput = stdout + "\n" + stderr
          let status = "Passed"
          
          if (error || logOutput.includes("BUILD FAILURE") || logOutput.includes("COMPILATION ERROR") || logOutput.includes("Failure")) {
            status = "Failed"
          }
          
          resolve({ status, logOutput })
        })
      })
    }

    // Await execution
    const outcome = await runTestPromise()

    // 4. Save test execution log to the database
    const execution = await prisma.testExecution.create({
      data: {
        scriptId: script.id,
        status: outcome.status,
        logOutput: outcome.logOutput,
        browser: browser || "Chrome",
        allureLink: "/allure-report/index.html" // Simulated Allure link
      }
    })

    return NextResponse.json({ execution })
  } catch (err: any) {
    console.error("POST run script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
