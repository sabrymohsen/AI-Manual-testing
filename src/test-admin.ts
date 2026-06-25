import { prisma } from "./lib/db"

async function test() {
  const user = await prisma.user.findUnique({
    where: { email: "admin@example.com" }
  })
  if (!user) {
    console.log("admin@example.com not found!")
    return
  }
  console.log("User:", user)

  const projects = await prisma.project.findMany({
    where: {
      userId: user.id,
      status: "Active"
    },
    include: {
      credentials: { select: { id: true } },
      modules: { select: { id: true } },
      requirements: {
        select: {
          id: true,
          testCases: { select: { id: true } }
        }
      },
      testCases: {
        select: {
          id: true,
          testRuns: { select: { id: true } }
        }
      },
      testRuns: {
        select: {
          id: true,
          status: true,
          createdAt: true
        }
      },
      bugReports: {
        select: {
          id: true,
          status: true,
          severity: true,
          createdAt: true
        }
      }
    }
  })

  console.log(`Found ${projects.length} projects for admin:`)

  const processedProjects = await Promise.all(projects.map(async (project) => {
    const totalCases = project.testCases.length
    const totalRuns = project.testRuns.length
    
    const passedRuns = project.testRuns.filter(r => r.status === "Passed").length
    const failedRuns = project.testRuns.filter(r => r.status === "Failed").length
    const blockedRuns = project.testRuns.filter(r => r.status === "Blocked").length
    
    const openBugs = project.bugReports.filter(b => 
      ["Open", "InProgress", "ReadyForRetest", "Reopened"].includes(b.status)
    )
    const openBugsCount = openBugs.length
    const criticalBugsCount = openBugs.filter(b => b.severity === "Critical").length

    const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0

    // Requirements coverage
    const totalReqs = project.requirements.length
    const uncoveredReqs = project.requirements.filter(r => r.testCases.length === 0).length
    const requirementsCoverage = totalReqs > 0 
      ? Math.round(((totalReqs - uncoveredReqs) / totalReqs) * 100)
      : 100

    // Test cases never executed
    const neverRunCasesCount = project.testCases.filter(c => c.testRuns.length === 0).length

    // Compute Health Score
    let score = 100
    let derivedHealthStatus = "Not Started"

    if (totalCases === 0 || totalRuns === 0) {
      derivedHealthStatus = "Not Started"
      score = 100
    } else {
      const failedPenalty = Math.min(25, failedRuns * 1.5)
      const criticalBugPenalty = Math.min(25, criticalBugsCount * 5)
      const uncoveredReqPenalty = Math.min(20, uncoveredReqs * 3)
      const neverRunPenalty = Math.min(15, neverRunCasesCount * 2)
      
      score = Math.max(0, Math.round(100 - failedPenalty - criticalBugPenalty - uncoveredReqPenalty - neverRunPenalty))

      if (score >= 90 && openBugsCount === 0) {
        derivedHealthStatus = "Excellent"
      } else if (score >= 75) {
        derivedHealthStatus = "Good"
      } else if (score >= 50 || failedRuns > 0) {
        derivedHealthStatus = "Needs Attention"
      } else {
        derivedHealthStatus = "High Risk"
      }
    }

    // Setup completeness: 6 steps
    let setupCompleted = 0
    if (project.webAppUrl && project.webAppUrl.length > 5) setupCompleted++
    if (project.credentials.length > 0) setupCompleted++
    if (project.modules.length > 0) setupCompleted++
    if (totalCases > 0) setupCompleted++
    if (totalReqs > 0) setupCompleted++
    if (totalRuns > 0) setupCompleted++

    const setupTotal = 6

    // Last activity dates
    const runDates = project.testRuns.map(r => new Date(r.createdAt).getTime())
    const bugDates = project.bugReports.map(b => new Date(b.createdAt).getTime())
    
    const lastTestRunAt = runDates.length > 0 ? new Date(Math.max(...runDates)) : null
    const lastBugAt = bugDates.length > 0 ? new Date(Math.max(...bugDates)) : null
    const lastUpdatedAt = project.updatedAt

    return {
      id: project.id,
      name: project.name,
      webAppUrl: project.webAppUrl,
      environment: project.environment,
      testType: project.testType,
      browserType: project.browserType,
      status: project.status,
      metrics: {
        testCases: totalCases,
        testRuns: totalRuns,
        passRate,
        failedTests: failedRuns,
        openBugs: openBugsCount,
        requirementsCoverage,
        healthScore: score,
        healthStatus: derivedHealthStatus,
        setupCompleted,
        setupTotal
      },
      lastActivity: {
        lastTestRunAt,
        lastBugAt,
        lastUpdatedAt
      },
      uncoveredRequirementsCount: uncoveredReqs
    }
  }))

  console.log("Processed projects:", JSON.stringify(processedProjects, null, 2))
}

test()
  .catch(err => console.error("Test failed:", err))
  .finally(() => prisma.$disconnect())
