export type TargetType =
  | "test_id"
  | "role"
  | "text"
  | "label"
  | "placeholder"
  | "css"
  | "xpath"
  | "none"

export type GeneratedLocators = {
  tagName?: string
  visibleText?: string
  idSelector?: string
  testIdSelector?: string
  roleSelector?: string
  textSelector?: string
  labelSelector?: string
  placeholderSelector?: string
  cssSelector?: string
  xpathSelector?: string
  recommendedSelector: string
  locatorType: TargetType
  locatorValue: string
  reliabilityScore: number
  attributes: Record<string, string>
}

// Check if a class or attribute value looks like a dynamic compile hash (e.g., Angular, MUI, styled-components)
export function isDynamicValue(val: string): boolean {
  if (!val) return false
  // Scoped class regexes
  const dynamicRegexes = [
    /ng-tns-c\d+-\d+/,      // Angular ng-tns-c12345-6
    /ng-star-inserted/,     // Angular star inserted
    /css-[a-z0-9]+/i,       // Emotion / Styled Components css-1abcxyz
    /sc-[a-z0-9]+/i,        // Styled Components sc-dkzDqf
    /Mui[A-Z][a-zA-Z]+-root-\d+/, // Material UI root class suffixes
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
    /^\d+$/,                // Pure digits
  ]
  return dynamicRegexes.some((rx) => rx.test(val))
}

// Clean classes to filter out dynamic hashes
export function getStableClasses(element: Element): string[] {
  const classList = element.className
  if (typeof classList !== "string") return []
  return classList
    .split(/\s+/)
    .filter((c) => c && !isDynamicValue(c) && !c.startsWith("ng-") && !c.startsWith("css-") && !c.startsWith("sc-"))
}

export function generateCssSelector(element: Element): string {
  // 1. data-testid
  const testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-qa")
  if (testId && !isDynamicValue(testId)) {
    return `[data-testid="${testId}"]`
  }

  // 2. ID
  const id = element.id
  if (id && !isDynamicValue(id)) {
    return `#${id}`
  }

  // 3. Name
  const name = element.getAttribute("name")
  if (name && !isDynamicValue(name)) {
    return `${element.tagName.toLowerCase()}[name="${name}"]`
  }

  // 4. Construct relative path
  const path: string[] = []
  let curr: Element | null = element

  while (curr && curr.nodeType === Node.ELEMENT_NODE) {
    const tagName = curr.tagName.toLowerCase()
    
    // Stop at body/html
    if (tagName === "body" || tagName === "html") {
      path.unshift(tagName)
      break
    }

    const testId = curr.getAttribute("data-testid") || curr.getAttribute("data-test")
    if (testId && !isDynamicValue(testId)) {
      path.unshift(`[data-testid="${testId}"]`)
      break
    }

    const currId = curr.id
    if (currId && !isDynamicValue(currId)) {
      path.unshift(`#${currId}`)
      break
    }

    const stableClasses = getStableClasses(curr)
    if (stableClasses.length > 0) {
      path.unshift(`${tagName}.${stableClasses.join(".")}`)
    } else {
      // Find sibling index
      let siblingIndex = 1
      let sibling = curr.previousElementSibling
      while (sibling) {
        if (sibling.tagName.toLowerCase() === tagName) {
          siblingIndex++
        }
        sibling = sibling.previousElementSibling
      }
      path.unshift(`${tagName}:nth-of-type(${siblingIndex})`)
    }

    curr = curr.parentElement
  }

  return path.join(" > ")
}

export function generateXPath(element: Element): string {
  const testId = element.getAttribute("data-testid") || element.getAttribute("data-test")
  if (testId && !isDynamicValue(testId)) {
    return `//*[@data-testid='${testId}']`
  }

  const id = element.id
  if (id && !isDynamicValue(id)) {
    return `//*[@id='${id}']`
  }

  const paths: string[] = []
  let curr: Element | null = element

  while (curr && curr.nodeType === Node.ELEMENT_NODE) {
    let index = 1
    let sibling = curr.previousElementSibling
    
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === curr.tagName) {
        index++
      }
      sibling = sibling.previousElementSibling
    }

    const tagName = curr.tagName.toLowerCase()
    const indexPart = index > 1 || (curr.nextElementSibling && curr.nextElementSibling.tagName === curr.tagName) 
      ? `[${index}]` 
      : ""

    paths.unshift(`${tagName}${indexPart}`)
    curr = curr.parentElement
  }

  return `/${paths.join("/")}`
}

export function calculateReliabilityScore(locators: Omit<GeneratedLocators, "recommendedSelector" | "locatorType" | "locatorValue" | "reliabilityScore">): number {
  let score = 0

  if (locators.testIdSelector) {
    score += 100
  } else if (locators.idSelector) {
    score += 90
  } else if (locators.labelSelector) {
    score += 80
  } else if (locators.placeholderSelector) {
    score += 75
  } else if (locators.roleSelector) {
    score += 70
  } else if (locators.textSelector && locators.textSelector.length < 40) {
    score += 60
  } else if (locators.cssSelector) {
    score += 40
  } else {
    score += 10 // XPath fallback
  }

  // Deduct points for unstable traits
  if (locators.cssSelector && locators.cssSelector.includes("nth-of-type")) {
    score -= 15
  }
  if (locators.xpathSelector && locators.xpathSelector.includes("/")) {
    const depth = locators.xpathSelector.split("/").length
    if (depth > 5) {
      score -= Math.min(25, depth * 2) // Deduct more for deep absolute XPaths
    }
  }

  // Limit score range between 0 and 100
  return Math.max(0, Math.min(100, score))
}

export function chooseBestLocator(locators: Omit<GeneratedLocators, "recommendedSelector" | "locatorType" | "locatorValue" | "reliabilityScore">): {
  locatorType: TargetType
  locatorValue: string
  recommendedSelector: string
} {
  if (locators.testIdSelector) {
    return {
      locatorType: "test_id",
      locatorValue: locators.attributes["data-testid"] || locators.attributes["data-test"] || locators.attributes["data-qa"] || "",
      recommendedSelector: locators.testIdSelector,
    }
  }

  if (locators.idSelector) {
    const rawId = locators.idSelector.startsWith("#") ? locators.idSelector.substring(1) : locators.idSelector
    return {
      locatorType: "css", // Can represent as css ID
      locatorValue: `#${rawId}`,
      recommendedSelector: locators.idSelector,
    }
  }

  if (locators.labelSelector) {
    return {
      locatorType: "label",
      locatorValue: locators.labelSelector,
      recommendedSelector: `Label: ${locators.labelSelector}`,
    }
  }

  if (locators.placeholderSelector) {
    return {
      locatorType: "placeholder",
      locatorValue: locators.placeholderSelector,
      recommendedSelector: `Placeholder: ${locators.placeholderSelector}`,
    }
  }

  if (locators.roleSelector) {
    // roleSelector is stored as roleName:accessibleName
    const parts = locators.roleSelector.split(":")
    const role = parts[0]
    const name = parts.slice(1).join(":")
    return {
      locatorType: "role",
      locatorValue: `${role}, name: "${name}"`,
      recommendedSelector: `Role: ${role} (${name})`,
    }
  }

  if (locators.textSelector && locators.textSelector.length < 50) {
    return {
      locatorType: "text",
      locatorValue: locators.textSelector,
      recommendedSelector: `Text: "${locators.textSelector}"`,
    }
  }

  if (locators.cssSelector) {
    return {
      locatorType: "css",
      locatorValue: locators.cssSelector,
      recommendedSelector: locators.cssSelector,
    }
  }

  return {
    locatorType: "xpath",
    locatorValue: locators.xpathSelector || "",
    recommendedSelector: locators.xpathSelector || "",
  }
}

export function generateLocatorsForElement(element: Element): GeneratedLocators {
  const tagName = element.tagName.toLowerCase()
  const visibleText = element.textContent?.trim().substring(0, 100) || ""

  // Extract all attributes
  const attributes: Record<string, string> = {}
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i]
    attributes[attr.name] = attr.value
  }

  // Extract selectors
  const testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-qa")
  const testIdSelector = testId && !isDynamicValue(testId) ? `[data-testid="${testId}"]` : undefined

  const id = element.id
  const idSelector = id && !isDynamicValue(id) ? `#${id}` : undefined

  const placeholder = element.getAttribute("placeholder")
  const placeholderSelector = placeholder ? placeholder : undefined

  // Find Label
  let labelSelector: string | undefined
  if (id) {
    const labelEl = document.querySelector(`label[for="${id}"]`)
    if (labelEl) {
      labelSelector = labelEl.textContent?.trim() || undefined
    }
  }
  if (!labelSelector) {
    const labelParent = element.closest("label")
    if (labelParent) {
      // Get text content excluding children inputs
      const clone = labelParent.cloneNode(true) as HTMLElement
      const input = clone.querySelector("input, select, textarea")
      if (input) input.remove()
      labelSelector = clone.textContent?.trim() || undefined
    }
  }

  // Find Role
  let roleSelector: string | undefined
  const roleAttr = element.getAttribute("role")
  let derivedRole = roleAttr
  if (!derivedRole) {
    if (tagName === "button" || (tagName === "input" && (attributes["type"] === "button" || attributes["type"] === "submit"))) {
      derivedRole = "button"
    } else if (tagName === "a") {
      derivedRole = "link"
    } else if (tagName === "input" && attributes["type"] === "checkbox") {
      derivedRole = "checkbox"
    } else if (tagName === "input" && attributes["type"] === "radio") {
      derivedRole = "radio"
    } else if (tagName === "input" || tagName === "textarea") {
      derivedRole = "textbox"
    } else if (tagName === "select") {
      derivedRole = "combobox"
    } else if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "h5" || tagName === "h6") {
      derivedRole = "heading"
    }
  }

  if (derivedRole) {
    // Accessible Name
    const accessibleName = element.getAttribute("aria-label") || labelSelector || visibleText || placeholder || attributes["title"] || ""
    roleSelector = `${derivedRole}:${accessibleName}`
  }

  const textSelector = visibleText ? visibleText : undefined
  const cssSelector = generateCssSelector(element)
  const xpathSelector = generateXPath(element)

  const partialLocators = {
    tagName,
    visibleText,
    idSelector,
    testIdSelector,
    roleSelector,
    textSelector,
    labelSelector,
    placeholderSelector,
    cssSelector,
    xpathSelector,
    attributes,
  }

  const score = calculateReliabilityScore(partialLocators)
  const best = chooseBestLocator(partialLocators)

  return {
    ...partialLocators,
    reliabilityScore: score,
    locatorType: best.locatorType,
    locatorValue: best.locatorValue,
    recommendedSelector: best.recommendedSelector,
  }
}
