import { prisma } from "../src/lib/db"
import { addTestRunJob } from "../src/lib/queue"

async function runVerification() {
  console.log("Starting E2E Verification Script...")

  // 1. Find the first project in the database
  const project = await prisma.project.findFirst()
  if (!project) {
    console.error("No project found in the database. Please create a project first.")
    process.exit(1)
  }
  console.log(`Found project: "${project.name}" (ID: ${project.id})`)

  // 2. Create a test case with multiple steps
  const testCase = await prisma.testCase.create({
    data: {
      projectId: project.id,
      title: "Herokuapp Login E2E Demo Test",
      module: "Auth",
      priority: "Critical",
      source: "Manual",
      steps: {
        create: [
          {
            stepNumber: 1,
            actionDescription: "Open herokuapp login page",
            expectedResult: "Page loaded successfully",
            actionType: "open_url",
            targetType: "none",
            targetValue: null,
            inputValue: "https://the-internet.herokuapp.com/login",
            timeoutMs: 15000,
          },
          {
            stepNumber: 2,
            actionDescription: "Enter username",
            expectedResult: "Username filled",
            actionType: "fill",
            targetType: "css",
            targetValue: "#username",
            inputValue: "tomsmith",
            timeoutMs: 10000,
          },
          {
            stepNumber: 3,
            actionDescription: "Enter password",
            expectedResult: "Password filled",
            actionType: "fill",
            targetType: "css",
            targetValue: "#password",
            inputValue: "SuperSecretPassword!",
            timeoutMs: 10000,
          },
          {
            stepNumber: 4,
            actionDescription: "Click login button",
            expectedResult: "Secure area dashboard shown",
            actionType: "click",
            targetType: "css",
            targetValue: "button[type='submit']",
            inputValue: null,
            timeoutMs: 10000,
          },
          {
            stepNumber: 5,
            actionDescription: "Verify success message is visible",
            expectedResult: "Flash message containing 'You logged into a secure area!' is visible",
            actionType: "assert_visible",
            targetType: "css",
            targetValue: "#flash",
            inputValue: null,
            timeoutMs: 10000,
          },
        ],
      },
    },
    include: {
      steps: true,
    },
  })
  console.log(`Created test case: "${testCase.title}" with ${testCase.steps.length} steps.`)

  // 3. Create test run
  const testRun = await prisma.testRun.create({
    data: {
      projectId: project.id,
      testCaseId: testCase.id,
      status: "Queued",
      roleUsed: "None",
      browserType: "Chromium",
      viewport: "Desktop",
      viewportWidth: 1280,
      viewportHeight: 800,
      triggeredBy: "Manual",
    },
  })
  console.log(`Created test run: ID ${testRun.id}`)

  // 4. Create initial step results in database
  for (const step of testCase.steps) {
    await prisma.testStepResult.create({
      data: {
        testRunId: testRun.id,
        testStepId: step.id,
        stepNumber: step.stepNumber,
        actionDescription: step.actionDescription,
        expectedResult: step.expectedResult,
        status: "Pending",
      },
    })
  }
  console.log("Created initial step results in DB.")

  // 5. Add to queue
  await addTestRunJob(testRun.id)
  console.log("Added test run job to queue. Waiting for execution to complete...")

  // 6. Poll status until complete
  const maxPolls = 30
  let pollCount = 0
  let completed = false

  while (pollCount < maxPolls && !completed) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    pollCount++

    const currentRun = await prisma.testRun.findUnique({
      where: { id: testRun.id },
      include: {
        stepResults: { orderBy: { stepNumber: "asc" } },
      },
    })

    if (!currentRun) {
      console.error("Test run disappeared from DB.")
      break
    }

    console.log(`[Poll ${pollCount}] Status: ${currentRun.status} | Steps completed: ${currentRun.stepResults.filter(r => r.status === 'Passed' || r.status === 'Failed').length}/${testCase.steps.length}`)

    if (currentRun.status !== "Queued" && currentRun.status !== "Running") {
      completed = true
      console.log("\n==========================================")
      console.log(`TEST RUN COMPLETED WITH STATUS: ${currentRun.status}`)
      console.log(`Total Duration: ${currentRun.durationMs}ms`)
      console.log("==========================================")

      for (const res of currentRun.stepResults) {
        console.log(`Step ${res.stepNumber}: ${res.actionDescription}`)
        console.log(`  Expected: ${res.expectedResult}`)
        console.log(`  Status:   ${res.status}`)
        console.log(`  Actual:   ${res.actualResult}`)
        if (res.errorDetails) {
          console.log(`  Error:    ${res.errorDetails}`)
        }
      }
      console.log("==========================================\n")
    }
  }

  if (!completed) {
    console.error("Verification timeout exceeded. Test run is still queued or running.")
  }
}

runVerification()
  .catch((err) => {
    console.error("Error running verification script:", err)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
