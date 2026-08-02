import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const PROJECT_ID = "seed-project-1"

interface TestResult {
  name: string
  category: string
  status: "PASSED" | "FAILED"
  durationMs: number
  details?: string
  error?: string
}

const results: TestResult[] = []

async function runTest(category: string, name: string, fn: () => Promise<void>) {
  const start = Date.now()
  try {
    await fn()
    results.push({
      category,
      name,
      status: "PASSED",
      durationMs: Date.now() - start,
    })
    console.log(`  [PASS] ${category} > ${name} (${Date.now() - start}ms)`)
  } catch (err: any) {
    results.push({
      category,
      name,
      status: "FAILED",
      durationMs: Date.now() - start,
      error: err?.message || String(err),
    })
    console.error(`  [FAIL] ${category} > ${name}: ${err?.message || err}`)
  }
}

async function main() {
  console.log("==========================================================")
  console.log("      COMPREHENSIVE TEST SUITE: TEST CASES PAGE & API     ")
  console.log("==========================================================")
  console.log(`Target Project: ${PROJECT_ID}\n`)

  let createdTestCaseId: string | null = null
  let createdSuiteId: string | null = null
  let createdChildSuiteId: string | null = null

  // -------------------------------------------------------------------------
  // 1. PROJECT & ENVIRONMENT VERIFICATION
  // -------------------------------------------------------------------------
  await runTest("Setup", "Verify Target Project Exists in Database", async () => {
    const project = await prisma.project.findUnique({ where: { id: PROJECT_ID } })
    if (!project) throw new Error(`Project ${PROJECT_ID} not found`)
  })

  // -------------------------------------------------------------------------
  // 2. TEST CASE LIST & FACETED FILTERING
  // -------------------------------------------------------------------------
  await runTest("Listing & Facets", "Fetch All Test Cases for Project", async () => {
    const cases = await prisma.testCase.findMany({
      where: { projectId: PROJECT_ID },
      include: { steps: true, suite: true },
    })
    if (cases.length === 0) throw new Error("No test cases found for project")
  })

  await runTest("Listing & Facets", "Filter Test Cases by Search Query", async () => {
    const cases = await prisma.testCase.findMany({
      where: {
        projectId: PROJECT_ID,
        title: { contains: "login", mode: "insensitive" },
      },
    })
    if (!Array.isArray(cases)) throw new Error("Search query returned non-array")
  })

  await runTest("Listing & Facets", "Filter Test Cases by Priority (High & Critical)", async () => {
    const cases = await prisma.testCase.findMany({
      where: {
        projectId: PROJECT_ID,
        priority: { in: ["High", "Critical"] },
      },
    })
    if (cases.some((c) => !["High", "Critical"].includes(c.priority))) {
      throw new Error("Priority filter returned unexpected items")
    }
  })

  await runTest("Listing & Facets", "Filter Test Cases by Execution Type (Automated)", async () => {
    const cases = await prisma.testCase.findMany({
      where: {
        projectId: PROJECT_ID,
        executionType: "Automated",
      },
    })
    if (cases.some((c) => c.executionType !== "Automated")) {
      throw new Error("Execution type filter returned non-automated cases")
    }
  })

  await runTest("Listing & Facets", "Filter Unfiled Test Cases (suiteId = null)", async () => {
    const cases = await prisma.testCase.findMany({
      where: {
        projectId: PROJECT_ID,
        suiteId: null,
      },
    })
    if (cases.some((c) => c.suiteId !== null)) {
      throw new Error("Unfiled filter returned cases attached to a suite")
    }
  })

  // -------------------------------------------------------------------------
  // 3. SUITE TREE MANAGEMENT
  // -------------------------------------------------------------------------
  await runTest("Suite Management", "Create Root Test Suite", async () => {
    const suite = await prisma.testSuite.create({
      data: {
        name: "[Test] E2E Automation Suite",
        description: "Suite created by automated test verification runner",
        projectId: PROJECT_ID,
      },
    })
    createdSuiteId = suite.id
    if (!suite.id) throw new Error("Root suite creation failed")
  })

  await runTest("Suite Management", "Create Child Test Suite", async () => {
    if (!createdSuiteId) throw new Error("Parent suite not available")
    const childSuite = await prisma.testSuite.create({
      data: {
        name: "[Test] Sub-Suite API Endpoint Verification",
        description: "Nested suite under root automation suite",
        projectId: PROJECT_ID,
        parentId: createdSuiteId,
      },
    })
    createdChildSuiteId = childSuite.id
    if (!childSuite.id || childSuite.parentId !== createdSuiteId) {
      throw new Error("Child suite creation or parent hierarchy link failed")
    }
  })

  await runTest("Suite Management", "Fetch Complete Test Suite Hierarchy Tree", async () => {
    const suites = await prisma.testSuite.findMany({
      where: { projectId: PROJECT_ID },
      include: { children: true, _count: { select: { testCases: true } } },
    })
    const root = suites.find((s) => s.id === createdSuiteId)
    if (!root) throw new Error("Created root suite missing from hierarchy fetch")
    if (!root.children.some((c) => c.id === createdChildSuiteId)) {
      throw new Error("Child suite missing from parent children list")
    }
  })

  await runTest("Suite Management", "Update Test Suite Name & Description", async () => {
    if (!createdSuiteId) throw new Error("Suite not available for update")
    const updated = await prisma.testSuite.update({
      where: { id: createdSuiteId },
      data: {
        name: "[Test] E2E Automation Suite (Updated)",
        description: "Updated description for suite",
      },
    })
    if (updated.name !== "[Test] E2E Automation Suite (Updated)") {
      throw new Error("Suite update failed to reflect new name")
    }
  })

  // -------------------------------------------------------------------------
  // 4. SINGLE TEST CASE CRUD OPERATIONS
  // -------------------------------------------------------------------------
  await runTest("Test Case CRUD", "Create New Structured Test Case with Steps", async () => {
    const tc = await prisma.testCase.create({
      data: {
        title: "[Test] Validate User Login with Multifactor Code",
        priority: "Critical",
        executionType: "Automated",
        preconditions: "User exists, 2FA enabled, valid credentials available",
        source: "Manual",
        projectId: PROJECT_ID,
        suiteId: createdChildSuiteId,
        steps: {
          create: [
            {
              stepNumber: 1,
              actionDescription: "Navigate to security portal login",
              expectedResult: "Login portal displayed with username field",
              actionType: "open_url",
              targetType: "url",
              targetValue: "https://example.com/auth/login",
              timeoutMs: 10000,
            },
            {
              stepNumber: 2,
              actionDescription: "Enter registered email address",
              expectedResult: "Email field populated",
              actionType: "fill",
              targetType: "placeholder",
              targetValue: "Email",
              inputValue: "admin@example.com",
              timeoutMs: 5000,
            },
            {
              stepNumber: 3,
              actionDescription: "Submit credentials button",
              expectedResult: "Redirected to 2FA challenge screen",
              actionType: "click",
              targetType: "role",
              targetValue: "button, name: 'Submit'",
              timeoutMs: 5000,
            },
          ],
        },
      },
      include: { steps: true },
    })
    createdTestCaseId = tc.id
    if (!tc.id) throw new Error("Test case creation failed")
    if (tc.steps.length !== 3) throw new Error(`Expected 3 steps, got ${tc.steps.length}`)
  })

  await runTest("Test Case CRUD", "Read Created Test Case with Full Step Details", async () => {
    if (!createdTestCaseId) throw new Error("Test case ID not set")
    const tc = await prisma.testCase.findUnique({
      where: { id: createdTestCaseId },
      include: { steps: { orderBy: { stepNumber: "asc" } }, suite: true },
    })
    if (!tc) throw new Error("Test case not found")
    if (tc.steps[0].actionType !== "open_url") throw new Error("Step 1 actionType mismatch")
  })

  await runTest("Test Case CRUD", "Update Test Case Title, Priority, and Steps", async () => {
    if (!createdTestCaseId) throw new Error("Test case ID not set")

    // Update main fields
    await prisma.testCase.update({
      where: { id: createdTestCaseId },
      data: {
        title: "[Test] Validate User Login with MFA (Updated)",
        priority: "High",
        executionType: "Manual",
      },
    })

    // Add a 4th step
    await prisma.testStep.create({
      data: {
        testCaseId: createdTestCaseId,
        stepNumber: 4,
        actionDescription: "Enter 6-digit TOTP code",
        expectedResult: "Dashboard loaded successfully",
        actionType: "fill",
        targetType: "css",
        targetValue: "input[name='totp']",
        inputValue: "123456",
        timeoutMs: 5000,
      },
    })

    const updated = await prisma.testCase.findUnique({
      where: { id: createdTestCaseId },
      include: { steps: true },
    })
    if (updated?.title !== "[Test] Validate User Login with MFA (Updated)") {
      throw new Error("Title update failed")
    }
    if (updated?.priority !== "High") throw new Error("Priority update failed")
    if (updated?.steps.length !== 4) throw new Error("Adding step failed")
  })

  // -------------------------------------------------------------------------
  // 5. BULK OPERATIONS & REORDERING
  // -------------------------------------------------------------------------
  await runTest("Bulk Operations", "Bulk Priority Update across Multiple Test Cases", async () => {
    if (!createdTestCaseId) throw new Error("Test case ID not set")
    const updated = await prisma.testCase.updateMany({
      where: { id: { in: [createdTestCaseId] } },
      data: { priority: "Critical" },
    })
    if (updated.count !== 1) throw new Error("Bulk update count mismatch")
  })

  await runTest("Bulk Operations", "Bulk Move Test Cases to Target Suite", async () => {
    if (!createdTestCaseId || !createdSuiteId) throw new Error("IDs not set")
    const updated = await prisma.testCase.updateMany({
      where: { id: { in: [createdTestCaseId] } },
      data: { suiteId: createdSuiteId },
    })
    if (updated.count !== 1) throw new Error("Bulk move suite failed")

    const tc = await prisma.testCase.findUnique({ where: { id: createdTestCaseId } })
    if (tc?.suiteId !== createdSuiteId) throw new Error("Test case suite link mismatch after bulk move")
  })

  // -------------------------------------------------------------------------
  // 6. EXECUTION ROLLUP & VERDICTS INTEGRITY
  // -------------------------------------------------------------------------
  await runTest("Execution Rollup", "Verify Test Case Status and Execution Rollup Fields", async () => {
    if (!createdTestCaseId) throw new Error("Test case ID not set")

    // Simulate an execution run
    const testRun = await prisma.testRun.create({
      data: {
        status: "Passed",
        testCaseId: createdTestCaseId,
        projectId: PROJECT_ID,
        browserType: "Chromium",
        viewport: "Desktop" as any,
        startedAt: new Date(Date.now() - 5000),
        completedAt: new Date(),
        durationMs: 5000,
      },
    })

    // Update lastRunId and status
    await prisma.testCase.update({
      where: { id: createdTestCaseId },
      data: {
        lastRunId: testRun.id,
        openBugCount: 0,
      },
    })

    const tc = await prisma.testCase.findUnique({
      where: { id: createdTestCaseId },
      include: { testRuns: true },
    })
    if (!tc?.testRuns || tc.testRuns.length === 0 || tc.testRuns[0].status !== "Passed") {
      throw new Error("Execution run link or status mismatch")
    }
  })

  // -------------------------------------------------------------------------
  // 7. CLEANUP & DELETION VERIFICATION
  // -------------------------------------------------------------------------
  await runTest("Cleanup", "Delete Created Test Case and Dependent Steps & Runs", async () => {
    if (!createdTestCaseId) throw new Error("Test case ID not set")

    await prisma.testRun.deleteMany({ where: { testCaseId: createdTestCaseId } })
    await prisma.testStep.deleteMany({ where: { testCaseId: createdTestCaseId } })
    await prisma.testCase.delete({ where: { id: createdTestCaseId } })

    const check = await prisma.testCase.findUnique({ where: { id: createdTestCaseId } })
    if (check) throw new Error("Deleted test case still exists in DB")
  })

  await runTest("Cleanup", "Delete Created Test Suites (Parent & Child)", async () => {
    if (createdChildSuiteId) {
      await prisma.testSuite.delete({ where: { id: createdChildSuiteId } })
    }
    if (createdSuiteId) {
      await prisma.testSuite.delete({ where: { id: createdSuiteId } })
    }

    if (createdSuiteId) {
      const check = await prisma.testSuite.findUnique({ where: { id: createdSuiteId } })
      if (check) throw new Error("Deleted test suite still exists in DB")
    }
  })

  // -------------------------------------------------------------------------
  // SUMMARY REPORT GENERATION
  // -------------------------------------------------------------------------
  console.log("\n==========================================================")
  console.log("                  TEST SUITE EXECUTION SUMMARY            ")
  console.log("==========================================================")
  const passed = results.filter((r) => r.status === "PASSED").length
  const failed = results.filter((r) => r.status === "FAILED").length
  const total = results.length

  console.log(`Total Tests Run : ${total}`)
  console.log(`Passed         : ${passed}`)
  console.log(`Failed         : ${failed}`)
  console.log(`Pass Rate       : ${((passed / total) * 100).toFixed(1)}%\n`)

  const categories = Array.from(new Set(results.map((r) => r.category)))
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat)
    const catPassed = catResults.filter((r) => r.status === "PASSED").length
    console.log(`Category: ${cat} (${catPassed}/${catResults.length} passed)`)
  }

  if (failed > 0) {
    console.log("\nFAILED TESTS DETAILS:")
    for (const r of results.filter((r) => r.status === "FAILED")) {
      console.log(`- ${r.category} > ${r.name}: ${r.error}`)
    }
    process.exitCode = 1
  } else {
    console.log("\nALL TEST CASES PAGE TESTS PASSED CLEANLY! 🎉")
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
