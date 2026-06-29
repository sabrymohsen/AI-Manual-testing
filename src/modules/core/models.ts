export interface TestCase {
  id: string
  title: string
  executionType: string
  priority: string
  preconditions: string | null
  moduleId: string | null
  featureId: string | null
  componentId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface RecordedStep {
  id: string
  stepNumber: number
  pageUrl: string
  actionType: string
  actionDescription: string
  targetType: string
  targetValue: string | null
  inputValue: string | null
  expectedResult: string | null
  visibleText: string | null
  recommendedSelector: string | null
  cssSelector: string | null
  xpathSelector: string | null
  reliabilityScore: number
}

export interface BugReport {
  id: string
  bugKey: string | null
  title: string
  severity: string
  priority: string
  status: string
  environment: string | null
  stepsToReproduce: string | null
  expectedResult: string | null
  actualResult: string | null
  screenshotPath: string | null
  createdAt: Date
}

export interface Session {
  id: string
  status: string
  projectId: string
  createdAt: Date
}
