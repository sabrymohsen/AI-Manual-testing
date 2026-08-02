import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  // Create admin user
  const hashedPassword = await bcrypt.hash("admin123", 12)
  const user = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      passwordHash: hashedPassword,
      name: "Admin User",
      role: "Admin",
      plan: "Pro",
      isActive: true,
      trialEndsAt: null,
    },
    create: {
      email: "admin@example.com",
      passwordHash: hashedPassword,
      name: "Admin User",
      role: "Admin",
      plan: "Pro",
      isActive: true,
      trialEndsAt: null,
    },
  })
  console.log(`✅ Admin user ready: ${user.email} (password reset to admin123)`)

  // Create sample project
  const project = await prisma.project.upsert({
    where: { id: "seed-project-1" },
    update: {
      name: "Sample E-Commerce App",
      userId: user.id,
    },
    create: {
      id: "seed-project-1",
      name: "Sample E-Commerce App",
      webAppUrl: "https://example.com",
      figmaUrl: "https://www.figma.com/file/ABC123/Sample",
      description: "A sample project for testing the QA platform",
      environment: "Staging",
      browserType: "Chromium",
      viewport: "Desktop",
      testType: "Functional",
      status: "Active",
      userId: user.id,
    },
  })
  console.log(`✅ Created project: ${project.name}`)

  // Create epic + feature hierarchy
  let epic = await prisma.epic.findFirst({
    where: { projectId: project.id, epicKey: "EP-1" },
  })
  if (!epic) {
    epic = await prisma.epic.create({
      data: {
        projectId: project.id,
        epicKey: "EP-1",
        title: "Authentication",
        description: "Login, registration, and password reset flows",
      },
    })
  }
  console.log(`✅ Epic ready: ${epic.title}`)

  let feature = await prisma.feature.findFirst({
    where: { projectId: project.id, featureKey: "FT-1" },
  })
  if (!feature) {
    feature = await prisma.feature.create({
      data: {
        projectId: project.id,
        epicId: epic.id,
        featureKey: "FT-1",
        name: "Login Flow",
        description: "User login functionality",
      },
    })
  }
  console.log(`✅ Feature ready: ${feature.name}`)

  // Create test case
  let testCase = await prisma.testCase.findFirst({
    where: { projectId: project.id, title: "Successful user login with valid credentials" },
  })
  if (!testCase) {
    testCase = await prisma.testCase.create({
      data: {
        title: "Successful user login with valid credentials",
        priority: "High",
        preconditions: "User account exists and is active",
        source: "Manual",
        projectId: project.id,
        steps: {
          create: [
            {
              stepNumber: 1,
              actionDescription: "Navigate to login page",
              expectedResult: "Login page is displayed",
              actionType: "open_url",
              targetType: "url",
              targetValue: "https://example.com/login",
              timeoutMs: 10000,
            },
            {
              stepNumber: 2,
              actionDescription: "Enter valid email address",
              expectedResult: "Email is entered in the email field",
              actionType: "fill",
              targetType: "placeholder",
              targetValue: "Email",
              inputValue: "user@example.com",
              timeoutMs: 5000,
            },
            {
              stepNumber: 3,
              actionDescription: "Enter valid password",
              expectedResult: "Password is entered in the password field",
              actionType: "fill",
              targetType: "placeholder",
              targetValue: "Password",
              inputValue: "password123",
              timeoutMs: 5000,
            },
            {
              stepNumber: 4,
              actionDescription: "Click the Login button",
              expectedResult: "User is redirected to dashboard",
              actionType: "click",
              targetType: "role",
              targetValue: "button, name: 'Login'",
              timeoutMs: 10000,
            },
          ],
        },
      },
    })
  }
  console.log(`✅ Test case ready: ${testCase.title}`)

  // Create credential
  let credential = await prisma.projectCredential.findFirst({
    where: { projectId: project.id, roleName: "Standard User" },
  })
  if (!credential) {
    credential = await prisma.projectCredential.create({
      data: {
        roleName: "Standard User",
        username: "user@example.com",
        encryptedPassword: "encrypted-placeholder",
        encryptionIv: "iv-placeholder",
        encryptionAuthTag: "auth-tag-placeholder",
        keyVersion: "v1",
        loginUrl: "https://example.com/login",
        notes: "Test user for standard role",
        projectId: project.id,
      },
    })
  }
  console.log(`✅ Credential ready: ${credential.roleName}`)

  // Create requirement
  let requirement = await prisma.requirement.findFirst({
    where: { projectId: project.id, requirementKey: "REQ-001" },
  })
  if (!requirement) {
    requirement = await prisma.requirement.create({
      data: {
        projectId: project.id,
        requirementKey: "REQ-001",
        title: "User must be able to log in with email and password",
        description: "The system shall allow users to authenticate using a registered email address and password.",
        acceptanceCriteria: "1. Valid credentials redirect to dashboard. 2. Invalid credentials show error message.",
        priority: "High",
        status: "ReadyForTesting",
        source: "Manual",
        epicId: epic.id,
        featureId: feature.id,
      },
    })
  }
  console.log(`✅ Requirement ready: ${requirement.requirementKey}`)

  // Link test case to requirement
  const existingLink = await prisma.testCaseRequirement.findFirst({
    where: { requirementId: requirement.id, testCaseId: testCase.id },
  })
  if (!existingLink) {
    await prisma.testCaseRequirement.create({
      data: {
        requirementId: requirement.id,
        testCaseId: testCase.id,
      },
    })
  }
  console.log(`✅ Linked test case to requirement`)

  console.log("\n🎉 Database seeded successfully!")
  console.log("\nLogin credentials:")
  console.log("  Email: admin@example.com")
  console.log("  Password: admin123")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
