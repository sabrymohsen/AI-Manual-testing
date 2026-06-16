import { prisma } from "../src/lib/db"
import { saveCurrentRecordedTestCase } from "../src/lib/recording/session-manager"

async function run() {
  console.log("Locating or creating a test project...")
  let project = await prisma.project.findFirst()
  if (!project) {
    console.log("No project found. Creating one...")
    const user = await prisma.user.findFirst()
    if (!user) {
      console.error("Please seed or register a user first.")
      return
    }
    project = await prisma.project.create({
      data: {
        name: "Test Project",
        webAppUrl: "http://example.com",
        userId: user.id,
      }
    })
  }

  console.log("Creating a mock active recording session...")
  const session = await prisma.recordingSession.create({
    data: {
      projectId: project.id,
      browserType: "Chromium",
      viewport: "Desktop",
      startUrl: "http://example.com",
      status: "Active",
    }
  })

  console.log("Creating a draft recorded test case...")
  const draftCase = await prisma.recordedTestCase.create({
    data: {
      sessionId: session.id,
      title: "Test Recorded Case",
      module: "Auth",
      priority: "High",
      status: "Draft",
    }
  })

  console.log("Adding recorded steps...")
  await prisma.recordedStep.create({
    data: {
      recordedTestCaseId: draftCase.id,
      stepNumber: 1,
      pageUrl: "http://example.com",
      actionType: "open_url",
      actionDescription: "Open example.com",
      targetType: "none",
      expectedResult: "Page should load",
    }
  })

  await prisma.recordedStep.create({
    data: {
      recordedTestCaseId: draftCase.id,
      stepNumber: 2,
      pageUrl: "http://example.com",
      actionType: "click",
      actionDescription: "Click login button",
      targetType: "css",
      targetValue: "#login",
      expectedResult: "Login modal should open",
    }
  })

  console.log("Invoking saveCurrentRecordedTestCase...")
  try {
    const saved = await saveCurrentRecordedTestCase(session.id, draftCase.id)
    console.log("SUCCESS! Real TestCase created with ID:", saved.id)
    
    // Fetch steps
    const steps = await prisma.testStep.findMany({
      where: { testCaseId: saved.id },
      orderBy: { stepNumber: "asc" }
    })
    console.log("Fetched steps count:", steps.length)
    console.log("Steps details:", JSON.stringify(steps, null, 2))
  } catch (err: any) {
    console.error("FAILED to save recorded test case:", err)
  }

  // Cleanup
  console.log("Cleaning up mock records...")
  await prisma.recordedStep.deleteMany({ where: { recordedTestCaseId: draftCase.id } })
  await prisma.recordedTestCase.delete({ where: { id: draftCase.id } })
  await prisma.recordingSession.delete({ where: { id: session.id } })
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
  })
