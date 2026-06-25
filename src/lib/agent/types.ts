import { QAAgentMode, QAAgentRunStatus, QAAgentSafetyLevel, QAAgentFindingType, Priority } from "@prisma/client"

export interface ScannedElement {
  tagName: string
  type?: string
  id?: string
  name?: string
  text?: string
  placeholder?: string
  label?: string
  testid?: string
  role?: string
  href?: string
}

export interface ScannerResult {
  targetUrl: string
  title: string
  pagesDetected: Array<{
    url: string
    title: string
    summary: {
      headings: number
      buttons: number
      inputs: number
      forms: number
      tables: number
      links: number
    }
  }>
  inputs: ScannedElement[]
  buttons: ScannedElement[]
  links: ScannedElement[]
  tables: Array<{ id?: string; headers: string[]; rowCount: number }>
  forms: Array<{ id?: string; action?: string; inputsCount: number }>
  modals: Array<{ title?: string; id?: string }>
  dropdowns: ScannedElement[]
  consoleErrors: string[]
  networkErrors: string[]
  screenshotPath?: string
}

export interface QAAgentStep {
  action: string
  target: string
  targetType?: string
  targetValue?: string
  value?: string
  expected: string
}

export interface QAAgentTest {
  name: string
  priority: "Critical" | "High" | "Medium" | "Low"
  module: string
  feature: string
  source: string
  steps: QAAgentStep[]
}

export interface QAAgentPlan {
  title: string
  mode: string
  summary?: string
  tests: QAAgentTest[]
}

export interface SafetyCheckResult {
  isAllowed: boolean
  reason?: string
  finding?: {
    title: string
    description: string
    type: QAAgentFindingType
  }
}
