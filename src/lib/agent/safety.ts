import { QAAgentSafetyLevel, QAAgentFindingType } from "@prisma/client"

export interface SafetyCheckResult {
  isAllowed: boolean
  reason?: string
  finding?: {
    title: string
    description: string
    type: QAAgentFindingType
  }
}

const DESTRUCTIVE_KEYWORDS = [
  "delete", "remove", "drop", "cancel", "terminate",
  "payment", "purchase", "transfer", "pay", "charge",
  "subscribe", "unsubscribe", "buy", "checkout",
  "irreversible", "wipe", "purge"
]

export function checkActionSafety(
  actionType: string,
  actionDescription: string,
  targetValue: string | null,
  inputValue: string | null,
  safetyLevel: QAAgentSafetyLevel
): SafetyCheckResult {
  const checkStr = `${actionType} ${actionDescription} ${targetValue || ""} ${inputValue || ""}`.toLowerCase()

  // 1. Check for blacklisted destructive keywords
  const matchedKeyword = DESTRUCTIVE_KEYWORDS.find(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, "i")
    return regex.test(checkStr)
  })

  if (matchedKeyword) {
    // If destructive, it is ONLY allowed if safetyLevel is AllowDestructiveWithConfirmation
    if (safetyLevel !== QAAgentSafetyLevel.AllowDestructiveWithConfirmation) {
      return {
        isAllowed: false,
        reason: `Destructive action blocked by safety policy (contains keyword: '${matchedKeyword}')`,
        finding: {
          title: "Safety Sandbox Policy Block",
          description: `Blocked destructive step: "${actionDescription}". The action contains the keyword '${matchedKeyword}', which is prohibited under the current '${safetyLevel}' safety profile.`,
          type: QAAgentFindingType.Risk
        }
      }
    }
  }

  // 2. Check general capabilities based on Safety Level
  switch (safetyLevel) {
    case QAAgentSafetyLevel.ReadOnly:
      // ReadOnly allows only assertions, screenshots, navigation, and wait actions.
      // Modifying actions (clicks, fills, selections, uploads) are blocked.
      const isReadOnlyAction = [
        "open_url", "wait_for_text", "wait_for_url",
        "assert_visible", "assert_hidden", "assert_text", "assert_url",
        "assert_api_status", "screenshot"
      ].includes(actionType)

      if (!isReadOnlyAction) {
        return {
          isAllowed: false,
          reason: `Action '${actionType}' blocked by Read-Only safety policy`,
          finding: {
            title: "Read-Only Sandbox Protection",
            description: `Blocked step: "${actionDescription}". Clicks, typing, and form submissions are disabled under Read-Only mode.`,
            type: QAAgentFindingType.Risk
          }
        }
      }
      break;

    case QAAgentSafetyLevel.AllowFormFill:
      // AllowFormFill allows typing and dropdown select, but blocks click/submit actions that submit forms.
      const isFormFillAllowedAction = [
        "open_url", "wait_for_text", "wait_for_url",
        "assert_visible", "assert_hidden", "assert_text", "assert_url",
        "assert_api_status", "screenshot", "fill", "select", "select_custom",
        "select_searchable", "multi_select", "date_select", "time_select"
      ].includes(actionType)

      if (!isFormFillAllowedAction) {
        return {
          isAllowed: false,
          reason: `Action '${actionType}' blocked by Form-Fill-Only safety policy`,
          finding: {
            title: "Form-Fill Sandbox Protection",
            description: `Blocked step: "${actionDescription}". Clicking buttons or form submissions is disabled under Form-Fill mode.`,
            type: QAAgentFindingType.Risk
          }
        }
      }
      break;

    case QAAgentSafetyLevel.AllowCreateUpdate:
      // AllowCreateUpdate allows all actions except destructive keywords (which are already checked above)
      break;

    case QAAgentSafetyLevel.AllowDestructiveWithConfirmation:
      // All actions are allowed
      break;
  }

  return { isAllowed: true }
}
