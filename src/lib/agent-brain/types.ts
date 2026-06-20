export interface AppUnderstanding {
  appType: string
  modules: string[]
  riskAreas: string[]
  suggestedTestFocus: string[]
  pagesDetected: string[]
}

export interface ExecutionStepPlan {
  actionDescription: string
  expectedResult: string
  actionType: string // e.g. open_url, click, fill, assert_visible, select
  targetType: string // e.g. test_id, role, text, label, placeholder, css
  targetValue: string
  inputValue?: string
}

export interface ExecutionPlanItem {
  testName: string
  priority: "Critical" | "High" | "Medium" | "Low"
  steps: ExecutionStepPlan[]
  role: string
  strategy: "smoke" | "functional" | "negative" | "ui"
}

export interface ExecutionPlan {
  executionPlan: ExecutionPlanItem[]
}

export interface AgentMemoryState {
  successfulLocators: Record<string, { selector: string; successCount: number }>
  failedLocatorPatterns: string[]
  stableComponents: string[]
  flakyComponents: string[]
  userCorrections: Record<string, string> // targetValue -> correctedSelector
}

export interface BrainMetrics {
  planningDurationMs: number
  averageStepDurationMs: number
  locatorResolutionMs: number
  memoryLookupMs: number
  totalDurationMs?: number
}
