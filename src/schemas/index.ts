import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
})

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  webAppUrl: z.string().url("Invalid URL").min(1, "Web app URL is required"),
  figmaUrl: z.string().url("Invalid Figma URL").optional().nullable(),
  description: z.string().optional().nullable(),
  environment: z.enum(["Dev", "Staging", "UAT", "Production"]).optional(),
  browserType: z.enum(["Chromium", "Firefox", "WebKit"]).optional(),
  viewport: z.enum(["Desktop", "Tablet", "Mobile", "Custom"]).optional(),
  testType: z.enum(["Functional", "VisualDesign", "E2E", "Regression", "Smoke", "Exploratory"]).optional(),
  customViewportWidth: z.number().int().positive().optional().nullable(),
  customViewportHeight: z.number().int().positive().optional().nullable(),
})

export const updateProjectSchema = createProjectSchema.partial()

export const createCredentialSchema = z.object({
  roleName: z.string().min(1, "Role name is required").max(200),
  username: z.string().min(1, "Username is required").max(200),
  password: z.string().min(1, "Password is required"),
  loginUrl: z.string().url("Invalid URL").optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const createTestCaseSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  module: z.string().optional().nullable(),
  moduleId: z.string().optional().nullable(),
  featureId: z.string().optional().nullable(),
  componentId: z.string().optional().nullable(),
  featureName: z.string().optional().nullable(),
  componentName: z.string().optional().nullable(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  preconditions: z.string().optional().nullable(),
  source: z.enum(["Manual", "AIGenerated", "Imported", "Exploratory", "Recorder", "QAAgentBrain", "RequirementFile"]).optional(),
  executionType: z.enum(["Manual", "Automated"]).optional(),
  testData: z.any().optional().nullable(),
  tags: z.array(z.string()).optional(),
  requirementIds: z.array(z.string()).optional(),
  steps: z.array(
    z.object({
      actionDescription: z.string().min(1, "Action description is required"),
      expectedResult: z.string().optional().nullable(),
      actionType: z.string().optional(),
      targetType: z.string().optional(),
      targetValue: z.string().optional().nullable(),
      inputValue: z.string().optional().nullable(),
      timeoutMs: z.number().int().positive().optional(),
      assertions: z.any().optional().nullable(),
    })
  ).optional(),
})

export const createTestRunSchema = z.object({
  testCaseId: z.string().min(1, "Test case ID is required"),
  credentialId: z.string().optional().nullable(),
  executionMode: z.enum(["Normal", "SelfHealing", "Debug"]).optional(),
})

export const createBugReportSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  title: z.string().min(1, "Title is required").max(500),
  severity: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  status: z.enum(["Open", "InProgress", "ReadyForRetest", "Reopened", "Resolved", "Closed", "Rejected", "Duplicate"]).optional(),
  resolution: z.enum(["Fixed", "WontFix", "CannotReproduce", "Duplicate", "ByDesign"]).optional().nullable(),
  resolutionNote: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  environment: z.enum(["Dev", "Staging", "UAT", "Production"]).optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  stepsToReproduce: z.string().optional().nullable(),
  expectedResult: z.string().optional().nullable(),
  actualResult: z.string().optional().nullable(),
  moduleId: z.string().optional().nullable(),
  featureId: z.string().optional().nullable(),
  componentId: z.string().optional().nullable(),
  testCaseId: z.string().optional().nullable(),
  requirementIds: z.array(z.string()).optional(),
})

export const aiGenerateSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(2000),
  projectId: z.string().min(1, "Project ID is required"),
})

export const updateTestCaseSchema = createTestCaseSchema.partial()

export const createRequirementSchema = z.object({
  requirementKey: z.string().min(1, "Requirement key is required").max(200),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().optional().nullable(),
  acceptanceCriteria: z.string().optional().nullable(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  status: z.enum(["Draft", "ReadyForTesting", "InTesting", "Covered", "PartiallyCovered", "Failed", "Blocked", "Deprecated"]).optional(),
  source: z.enum(["Manual", "ExcelImport", "Jira", "AzureDevOps", "GitHub", "Figma", "AIGenerated", "OpenProject"]).optional(),
  epicId: z.string().optional().nullable(),
  moduleId: z.string().optional().nullable(),
  featureId: z.string().optional().nullable(),
  componentId: z.string().optional().nullable(),
  figmaUrl: z.string().url().optional().nullable(),
  externalUrl: z.string().url().optional().nullable(),
  externalSystem: z.string().optional().nullable(),
})

export const updateRequirementSchema = createRequirementSchema.partial()

export const createEpicSchema = z.object({
  epicKey: z.string().max(100).optional(),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().optional().nullable(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  status: z.enum(["Draft", "Active", "Completed", "Archived"]).optional(),
  orderIndex: z.number().int().optional(),
})

export const updateEpicSchema = createEpicSchema.partial()

export const createLocatorSchema = z.object({
  friendlyName: z.string().min(1, "Friendly name is required").max(200),
  description: z.string().optional().nullable(),
  pageUrl: z.string().url("Invalid URL").min(1, "Page URL is required"),
  tagName: z.string().optional().nullable(),
  visibleText: z.string().optional().nullable(),
  locatorType: z.enum(["test_id", "role", "text", "label", "placeholder", "css", "xpath", "url", "none"]).optional(),
  locatorValue: z.string().min(1, "Locator value is required"),
  recommendedSelector: z.string().optional().nullable(),
  cssSelector: z.string().optional().nullable(),
  xpathSelector: z.string().optional().nullable(),
  idSelector: z.string().optional().nullable(),
  testIdSelector: z.string().optional().nullable(),
  roleSelector: z.string().optional().nullable(),
  textSelector: z.string().optional().nullable(),
  labelSelector: z.string().optional().nullable(),
  placeholderSelector: z.string().optional().nullable(),
  moduleId: z.string().optional().nullable(),
  featureId: z.string().optional().nullable(),
  componentId: z.string().optional().nullable(),
})

export const updateLocatorSchema = createLocatorSchema.partial()

export const updateBugReportSchema = createBugReportSchema.partial().omit({ projectId: true })

export const updateBugStatusSchema = z.object({
  status: z.enum(["Open", "InProgress", "ReadyForRetest", "Reopened", "Resolved", "Closed", "Rejected", "Duplicate"]),
})

export const createModuleSchema = z.object({
  name: z.string().min(1, "Module name is required").max(200),
  description: z.string().optional().nullable(),
})

export const createFeatureSchema = z.object({
  name: z.string().min(1, "Feature name is required").max(200),
  description: z.string().optional().nullable(),
  moduleId: z.string().min(1, "Module ID is required"),
})

export const createComponentSchema = z.object({
  name: z.string().min(1, "Component name is required").max(200),
  description: z.string().optional().nullable(),
  moduleId: z.string().min(1, "Module ID is required"),
  featureId: z.string().min(1, "Feature ID is required"),
})

export const createManualSessionSchema = z.object({
  name: z.string().min(1, "Session name is required").max(200),
  credentialId: z.string().optional().nullable(),
  environment: z.enum(["Dev", "Staging", "UAT", "Production"]).optional(),
  browserType: z.enum(["Chromium", "Firefox", "WebKit"]).optional(),
  viewport: z.enum(["Desktop", "Tablet", "Mobile", "Custom"]).optional(),
  keepBrowserSession: z.boolean().optional(),
  stopOnFailure: z.boolean().optional(),
})

export const createIntegrationConfigSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  enabled: z.boolean().optional(),
  host: z.string().optional().nullable(),
  projectKey: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  token: z.string().optional().nullable(),
  triggerOn: z.string().optional(),
})

export const figmaConfigSchema = z.object({
  fileKey: z.string().optional().nullable(),
  nodeId: z.string().optional().nullable(),
  visualTolerancePercent: z.number().min(0).max(100).optional().nullable(),
})
