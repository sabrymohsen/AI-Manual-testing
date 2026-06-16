import { PrismaClient } from "@prisma/client"
import { encryptSecret } from "../lib/crypto"
import { addTestRunJob } from "../lib/queue"

const prisma = new PrismaClient()

async function main() {
  // 1. Locate the recorded test case
  let testCase = await prisma.testCase.findUnique({
    where: { id: "ba75ed98-2e1f-4966-9a6f-6947d290e58a" },
    include: {
      steps: {
        orderBy: {
          stepNumber: "asc",
        },
      },
      project: true,
    },
  })

  if (!testCase) {
    // Fallback to searching by title
    testCase = await prisma.testCase.findFirst({
      where: {
        title: {
          contains: "Albawaba",
        },
      },
      include: {
        steps: {
          orderBy: {
            stepNumber: "asc",
          },
        },
        project: true,
      },
    })
  }

  if (!testCase) {
    // Fallback to the last test case
    testCase = await prisma.testCase.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        steps: {
          orderBy: {
            stepNumber: "asc",
          },
        },
        project: true,
      },
    })
  }

  if (!testCase) {
    throw new Error("No test cases found in database. Please record a test case first.")
  }

  console.log(`Using Test Case: "${testCase.title}" (ID: ${testCase.id})`)
  console.log(`Steps count: ${testCase.steps.length}`)

  // 2. Locate or create ProjectCredential for Mary.Mellow
  let credential = await prisma.projectCredential.findFirst({
    where: {
      projectId: testCase.projectId,
      username: "Mary.Mellow",
    },
  })

  if (!credential) {
    console.log("No credential found for Mary.Mellow. Creating one...")
    const encrypted = encryptSecret("P@ssw0rd@123")
    credential = await prisma.projectCredential.create({
      data: {
        roleName: "Standard User",
        username: "Mary.Mellow",
        encryptedPassword: encrypted.encrypted,
        encryptionIv: encrypted.iv,
        encryptionAuthTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        loginUrl: "https://albawaba.apptomator.com/home",
        notes: "Auto-created by test runner verification script",
        projectId: testCase.projectId,
      },
    })
    console.log(`Created credential: ${credential.id}`)
  } else {
    console.log(`Using existing credential: ${credential.id} (${credential.username})`)
  }

  // 3. Create a TestRun entry in the database
  const project = testCase.project
  let viewportWidth = 1280
  let viewportHeight = 800

  if (project.viewport === "Tablet") {
    viewportWidth = 768
    viewportHeight = 1024
  } else if (project.viewport === "Mobile") {
    viewportWidth = 375
    viewportHeight = 667
  } else if (project.viewport === "Custom") {
    viewportWidth = project.customViewportWidth || 1280
    viewportHeight = project.customViewportHeight || 800
  }

  const testRun = await prisma.testRun.create({
    data: {
      projectId: testCase.projectId,
      testCaseId: testCase.id,
      credentialId: credential.id,
      status: "Queued",
      roleUsed: credential.roleName,
      browserType: project.browserType,
      viewport: project.viewport,
      viewportWidth,
      viewportHeight,
      triggeredBy: "Manual",
    },
  })

  console.log(`Created TestRun ID: ${testRun.id}`)

  // 4. Create initial pending StepResults
  for (const step of testCase.steps) {
    await prisma.testStepResult.create({
      data: {
        testRunId: testRun.id,
        testStepId: step.id,
        stepNumber: step.stepNumber,
        actionDescription: step.actionDescription,
        expectedResult: step.expectedResult || "Success",
        status: "Pending",
      },
    })
  }

  console.log("Initial step results created. Enqueuing test run...")

  // 5. Add Job to Redis Queue
  const jobId = await addTestRunJob(testRun.id)
  console.log(`Job successfully queued with BullMQ Job ID: ${jobId}`)

  // 6. Poll and display execution status in real-time
  console.log("\nPolling execution status...")
  let isFinished = false
  const startTime = Date.now()

  while (!isFinished) {
    const run = await prisma.testRun.findUnique({
      where: { id: testRun.id },
      include: {
        stepResults: {
          orderBy: { stepNumber: "asc" },
        },
      },
    })

    if (!run) {
      console.log("Test run not found in DB!")
      break
    }

    console.log(`\n[${new Date().toLocaleTimeString()}] Status: ${run.status} | Time Elapsed: ${Math.round((Date.now() - startTime) / 1000)}s`)
    for (const step of run.stepResults) {
      console.log(`  Step ${step.stepNumber}: ${step.actionDescription} | Status: ${step.status} | Error: ${step.errorDetails || "None"}`)
    }

    if (["Passed", "Failed", "Cancelled", "Blocked"].includes(run.status)) {
      isFinished = true
      console.log("\n=================== EXECUTION FINISHED ===================")
      console.log(`Final Status: ${run.status}`)
      console.log(`Total Duration: ${run.durationMs}ms`)
      console.log("==========================================================")
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
