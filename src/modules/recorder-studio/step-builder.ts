import { RecordedStep } from "../core/models"

/**
 * StepBuilder compiles raw user browser interactions into structured RecordedStep model states.
 */
export class StepBuilder {
  /**
   * Compiles event properties into a clean RecordedStep format.
   */
  static buildStep(params: {
    stepNumber: number
    actionType: string
    tagName: string
    visibleText?: string
    targetValue?: string
    inputValue?: string
    recommendedSelector?: string
    pageUrl: string
  }): Partial<RecordedStep> {
    const actionDesc = this.generateDescription(params.actionType, params.tagName, params.visibleText || params.targetValue)
    
    return {
      stepNumber: params.stepNumber,
      actionType: params.actionType,
      actionDescription: actionDesc,
      targetType: params.tagName,
      targetValue: params.targetValue || null,
      inputValue: params.inputValue || null,
      visibleText: params.visibleText || null,
      recommendedSelector: params.recommendedSelector || null,
      pageUrl: params.pageUrl,
      reliabilityScore: 85
    }
  }

  /**
   * Generates a human-friendly action text description.
   */
  private static generateDescription(action: string, tag: string, value?: string): string {
    const valText = value ? ` "${value}"` : ""
    switch (action.toLowerCase()) {
      case "click":
        return `Click on ${tag}${valText}`
      case "fill":
      case "input":
        return `Input text${valText} inside the target ${tag}`
      case "select":
        return `Choose option${valText} from the dropdown selection list`
      case "navigate":
        return `Navigate browser target page to URL: ${value || ""}`
      default:
        return `Perform action '${action}' on element <${tag}>`
    }
  }
}
