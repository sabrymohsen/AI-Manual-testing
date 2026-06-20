import { Page, Locator } from "playwright"
import { prisma } from "@/lib/db"

interface Step {
  id?: string
  executionMode?: string
  actionType: string
  targetType: string
  targetValue?: string | null
  inputValue?: string | null
  timeoutMs: number
  componentType?: string | null
  groupId?: string | null
  rawEvents?: any
  actionMetadata?: any
  locatorCandidates?: any
  selectedOptionText?: string | null
  selectedOptionValue?: string | null
  validationStatus?: string | null
  validationMessage?: string | null
}

function getLocatorInScope(scope: Page | Locator, targetType: string, targetValue?: string | null): Locator {
  if (!targetValue) return scope.locator("html")

  switch (targetType) {
    case "test_id":
      return scope.getByTestId(targetValue)
    case "role": {
      const match = targetValue.match(/^([^,]+),\s*name:\s*["'](.+)["']$/)
      if (match) {
        const role = match[1].trim() as any
        const name = match[2]
        let loc = scope.getByRole(role, { name, exact: false })
        if (role === "link") {
          loc = loc.or(scope.locator("a").filter({ hasText: name }))
        } else if (role === "button") {
          loc = loc.or(scope.locator("button, [role='button']").filter({ hasText: name }))
        }
        return loc
      }
      return scope.getByRole(targetValue as any)
    }
    case "text":
      return scope.getByText(targetValue, { exact: false })
    case "label":
      return scope.getByLabel(targetValue)
    case "placeholder":
      return scope.getByPlaceholder(targetValue)
    case "css":
      return scope.locator(targetValue)
    case "xpath":
      return scope.locator(targetValue)
    default:
      return scope.locator(targetValue)
  }
}

function getLocator(page: Page, targetType: string, targetValue?: string | null): Locator {
  console.log(`[step-executor] getLocator called with targetType=${targetType}, targetValue=${JSON.stringify(targetValue)}`)
  return getLocatorInScope(page, targetType, targetValue)
}

export function resolveLocatorString(page: Page, selectorStr: string): Locator {
  return resolveLocatorStringInScope(page, selectorStr)
}

export function resolveLocatorStringInScope(scope: Page | Locator, selectorStr: string): Locator {
  const index = selectorStr.indexOf("=")
  if (index === -1) {
    return scope.locator(selectorStr)
  }
  const type = selectorStr.substring(0, index)
  const val = selectorStr.substring(index + 1)
  
  let targetType = type
  if (type === "testid") {
    targetType = "test_id"
  }
  return getLocatorInScope(scope, targetType, val)
}

function findContainerLocator(page: Page, contextStr: string): Locator | null {
  if (!contextStr || contextStr === "general") return null

  if (contextStr.startsWith("in row \"")) {
    const text = contextStr.slice(8, -1)
    return page.locator("tr").filter({ hasText: text })
  }
  if (contextStr === "in table row") {
    return page.locator("tr")
  }

  const dialogMatch = contextStr.match(/^in "(.+)" dialog$/)
  if (dialogMatch) {
    const text = dialogMatch[1]
    return page.locator("[role='dialog'], .modal, dialog").filter({ hasText: text })
  }
  if (contextStr === "in modal dialog") {
    return page.locator("[role='dialog'], .modal, dialog")
  }

  const formMatch = contextStr.match(/^in "(.+)" form$/)
  if (formMatch) {
    const text = formMatch[1]
    return page.locator("form").filter({ hasText: text })
      .or(page.locator(`form#${text}`))
      .or(page.locator(`form[name="${text}"]`))
  }
  if (contextStr === "in form") {
    return page.locator("form")
  }

  const tabMatch = contextStr.match(/^in "(.+)" tab$/)
  if (tabMatch) {
    const text = tabMatch[1]
    return page.locator("[role='tabpanel'], .tabpanel, .tab-content").filter({ hasText: text })
  }
  if (contextStr === "in tab container") {
    return page.locator("[role='tabpanel'], .tabpanel, .tab-content")
  }

  return null
}

function extractOriginalFeatures(step: Step) {
  const features = {
    tag: null as string | null,
    role: null as string | null,
    text: null as string | null,
    id: null as string | null,
    testid: null as string | null,
    classes: [] as string[],
    placeholder: null as string | null,
  }

  const processSelector = (sel: string) => {
    const eqIdx = sel.indexOf("=")
    const type = eqIdx === -1 ? "css" : sel.substring(0, eqIdx)
    const val = eqIdx === -1 ? sel : sel.substring(eqIdx + 1)

    if (type === "testid" || type === "test_id") {
      features.testid = val
    } else if (type === "role") {
      const match = val.match(/^([^,]+),\s*name:\s*["'](.+)["']$/)
      if (match) {
        features.role = match[1].trim()
        features.text = match[2]
      } else {
        features.role = val.trim()
      }
    } else if (type === "text") {
      features.text = val
    } else if (type === "label") {
      features.text = val
    } else if (type === "placeholder") {
      features.placeholder = val
    } else if (type === "css") {
      const idMatch = val.match(/#([a-zA-Z0-9_-]+)/)
      if (idMatch) features.id = idMatch[1]

      const classMatches = [...val.matchAll(/\.([a-zA-Z0-9_-]+)/g)]
      for (const m of classMatches) {
        features.classes.push(m[1])
      }

      const tagMatch = val.match(/^([a-zA-Z0-9-]+)/)
      if (tagMatch) {
        features.tag = tagMatch[1].toLowerCase()
      }
    }
  }

  if (step.targetValue) {
    const primarySel = step.targetType === "test_id" ? `testid=${step.targetValue}` : `${step.targetType}=${step.targetValue}`
    processSelector(primarySel)
  }

  let candidatesObj = step.locatorCandidates
  if (typeof candidatesObj === "string") {
    try {
      candidatesObj = JSON.parse(candidatesObj)
    } catch {}
  }
  if (candidatesObj && Array.isArray(candidatesObj.fallbackLocators)) {
    for (const fallback of candidatesObj.fallbackLocators) {
      processSelector(fallback)
    }
  }

  features.classes = [...new Set(features.classes)]
  return features
}

async function runActionOnLocator(
  locator: Locator,
  actionType: string,
  inputValue: string | null | undefined,
  step: Step,
  page: Page,
  timeout: number
): Promise<void> {
  switch (actionType) {
    case "open_url":
      await page.goto(inputValue || step.targetValue || "", {
        waitUntil: "domcontentloaded",
        timeout: timeout,
      })
      try {
        const loaderSelector = "app-splash-screen, .splash-screen, #loader, .loading-dots"
        console.log(`[step-executor] Checking for SPA loader...`)
        await page.locator(loaderSelector).first().waitFor({ state: "visible", timeout: 3000 })
        console.log(`[step-executor] SPA loader detected. Waiting for all loaders to be hidden...`)
        await page.waitForFunction((sel) => {
          return Array.from(document.querySelectorAll(sel)).every((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width === 0 || rect.height === 0
          })
        }, loaderSelector, { timeout: timeout })
        console.log(`[step-executor] SPA loaders are hidden. Proceeding with steps.`)
      } catch (e) {
        console.log(`[step-executor] No SPA loader appeared within timeout or check finished. Proceeding.`)
      }
      break

    case "click":
    case "radio_select":
    case "tab_select":
    case "menu_select":
    case "modal_open":
    case "modal_close":
    case "table_row_select":
    case "pagination_next":
    case "pagination_previous":
    case "accordion_expand":
    case "accordion_collapse":
      await locator.waitFor({ state: "visible", timeout })
      await locator.click()
      break

    case "fill":
      await locator.waitFor({ state: "visible", timeout })
      await locator.fill(inputValue || "")
      break

    case "select":
      await locator.waitFor({ state: "visible", timeout })
      await locator.selectOption(inputValue || "")
      break

    case "select_custom": {
      await locator.waitFor({ state: "visible", timeout })
      await locator.click()

      let optionLoc = null
      const meta = step.actionMetadata as any
      if (meta && typeof meta === "object" && meta.optionSelector) {
        optionLoc = page.locator(meta.optionSelector)
      } else if (step.selectedOptionText) {
        optionLoc = page.getByRole("option", { name: step.selectedOptionText, exact: false })
          .or(page.getByText(step.selectedOptionText, { exact: false }))
          .or(page.locator(`[role="option"]:has-text("${step.selectedOptionText}")`))
          .first()
      } else if (inputValue) {
        optionLoc = page.getByRole("option", { name: inputValue, exact: false })
          .or(page.getByText(inputValue, { exact: false }))
          .first()
      }

      if (optionLoc) {
        await optionLoc.waitFor({ state: "visible", timeout: 8000 })
        await optionLoc.click()
      }
      break
    }

    case "select_searchable":
    case "autocomplete_select": {
      await locator.waitFor({ state: "visible", timeout })
      await locator.click()

      const phrase = (step.actionMetadata as any)?.searchPhrase || inputValue || ""
      if (phrase) {
        let inputLoc = locator
        if (await locator.evaluate((el) => el.tagName.toLowerCase() !== "input")) {
          inputLoc = locator.locator("input").first()
          if (await inputLoc.count() === 0) {
            inputLoc = page.locator("input[type='text'], input:not([type])").first()
          }
        }
        await inputLoc.fill(phrase)
      }

      let optionLoc = null
      const meta = step.actionMetadata as any
      if (meta && typeof meta === "object" && meta.optionSelector) {
        optionLoc = page.locator(meta.optionSelector)
      } else if (step.selectedOptionText) {
        optionLoc = page.getByRole("option", { name: step.selectedOptionText, exact: false })
          .or(page.getByText(step.selectedOptionText, { exact: false }))
          .first()
      } else if (inputValue) {
        optionLoc = page.getByRole("option", { name: inputValue, exact: false })
          .or(page.getByText(inputValue, { exact: false }))
          .first()
      }

      if (optionLoc) {
        await optionLoc.waitFor({ state: "visible", timeout: 8000 })
        await optionLoc.click()
      }
      break
    }

    case "multi_select": {
      await locator.waitFor({ state: "visible", timeout })
      await locator.click()

      const options = (step.actionMetadata as any)?.options || []
      for (const opt of options) {
        const text = typeof opt === "string" ? opt : opt.text
        const optLoc = page.getByRole("option", { name: text, exact: false })
          .or(page.getByText(text, { exact: false }))
          .first()
        await optLoc.click()
      }
      await page.keyboard.press("Escape")
      break
    }

    case "remove_multi_select_value": {
      await locator.waitFor({ state: "visible", timeout })
      await locator.click()
      break
    }

    case "date_select":
    case "time_select": {
      await locator.waitFor({ state: "visible", timeout })
      if (await locator.evaluate((el) => el.tagName.toLowerCase() === "input")) {
        await locator.fill(inputValue || "")
      } else {
        await locator.click()
      }
      break
    }

    case "check":
      await locator.waitFor({ state: "visible", timeout })
      await locator.check()
      break

    case "uncheck":
      await locator.waitFor({ state: "visible", timeout })
      await locator.uncheck()
      break

    case "toggle_on": {
      await locator.waitFor({ state: "visible", timeout })
      const isChecked = await locator.getAttribute("aria-checked") === "true" || await locator.isChecked()
      if (!isChecked) {
        await locator.click()
      }
      break
    }

    case "toggle_off": {
      await locator.waitFor({ state: "visible", timeout })
      const isChecked = await locator.getAttribute("aria-checked") === "true" || await locator.isChecked()
      if (isChecked) {
        await locator.click()
      }
      break
    }

    case "slider_set": {
      await locator.waitFor({ state: "visible", timeout })
      if (inputValue) {
        await locator.fill(inputValue)
      } else {
        await locator.click()
      }
      break
    }

    case "upload_file":
      await locator.waitFor({ state: "visible", timeout })
      await locator.setInputFiles(inputValue || "")
      break

    case "wait_for_text":
      await page.getByText(step.targetValue || "", { exact: false }).waitFor({
        state: "visible",
        timeout,
      })
      break

    case "wait_for_url":
      await page.waitForURL(step.targetValue || "", { timeout })
      break

    case "assert_visible":
      await locator.waitFor({ state: "visible", timeout })
      break

    case "assert_hidden":
      await locator.waitFor({ state: "hidden", timeout })
      break

    case "assert_text":
      await locator.waitFor({ state: "visible", timeout })
      break

    case "assert_url":
      await page.waitForURL(step.targetValue || "", { timeout })
      break

    case "screenshot":
    case "assert_api_status":
    case "custom_instruction":
      await page.waitForTimeout(500)
      break

    default:
      throw new Error(`Unknown action type: ${actionType}`)
  }
}

async function attemptAutoHealing(
  page: Page,
  step: Step,
  actionType: string,
  inputValue: string | null | undefined,
  timeout: number,
  primaryError: Error
): Promise<boolean> {
  const mode = step.executionMode || "SelfHealing"
  if (mode === "Normal") {
    console.log(`[Smart Locator Engine] Primary locator failed, executionMode is Normal. Healing skipped.`)
    return false
  }

  console.warn(`[Smart Locator Engine] Primary locator failed: ${primaryError.message}. Starting auto-healing...`)
  
  if (!step.actionMetadata) {
    step.actionMetadata = {}
  }
  
  const hLogs: string[] = []
  hLogs.push(`[Smart Locator Engine] Primary locator failed: ${primaryError.message}. Starting auto-healing...`)

  const getFallbackConfidence = (selector: string): number => {
    const eqIdx = selector.indexOf("=")
    const type = eqIdx === -1 ? "css" : selector.substring(0, eqIdx)
    switch (type) {
      case "testid":
      case "test_id":
        return 98
      case "role":
        return 95
      case "label":
      case "aria-label":
        return 90
      case "id":
        return 85
      case "placeholder":
        return 75
      case "text":
        return 70
      case "css":
        return 60
      case "xpath":
        return 45
      default:
        return 60
    }
  }

  // --- LAYER 1: Fallback Locators ---
  let candidatesObj = step.locatorCandidates
  if (typeof candidatesObj === "string") {
    try {
      candidatesObj = JSON.parse(candidatesObj)
    } catch {
      candidatesObj = null
    }
  }

  if (candidatesObj && Array.isArray(candidatesObj.fallbackLocators) && candidatesObj.fallbackLocators.length > 0) {
    hLogs.push(`[Smart Locator Engine] Layer 1: Evaluating ${candidatesObj.fallbackLocators.length} fallback candidates.`)
    for (const fallback of candidatesObj.fallbackLocators) {
      try {
        const confidence = getFallbackConfidence(fallback)
        if (confidence < 50) {
          hLogs.push(`[Smart Locator Engine] Fallback "${fallback}" has confidence ${confidence}% (< 50%). Skipping fallback.`)
          continue
        }

        hLogs.push(`[Smart Locator Engine] Trying fallback: "${fallback}"`)
        const locator = resolveLocatorString(page, fallback)
        await locator.waitFor({ state: "visible", timeout: 2000 })
        
        // Success! Perform action
        await runActionOnLocator(locator, actionType, inputValue, step, page, timeout)
        
        hLogs.push(`[Smart Locator Engine] Layer 1 SUCCESS: Found element using fallback "${fallback}" with confidence ${confidence}%`)
        
        const oldLocator = `${step.targetType}=${step.targetValue}`
        step.actionMetadata.wasHealed = true
        step.actionMetadata.oldLocator = oldLocator
        step.actionMetadata.newLocator = fallback
        step.actionMetadata.healingMethod = "fallback_locator"
        step.actionMetadata.confidence = confidence
        step.actionMetadata.healed = true
        step.actionMetadata.healedLocator = fallback
        step.actionMetadata.healingLogs = hLogs

        // Layer 5 check: if confidence >= 90%, update database
        if (confidence >= 90 && step.id) {
          try {
            const eqIdx = fallback.indexOf("=")
            const newType = eqIdx === -1 ? "css" : fallback.substring(0, eqIdx)
            const newVal = eqIdx === -1 ? fallback : fallback.substring(eqIdx + 1)
            const mappedType = newType === "testid" ? "test_id" : newType

            hLogs.push(`[Smart Locator Engine] Layer 5: Confidence >= 90%. Auto-updating test step in DB...`)
            await prisma.testStep.update({
              where: { id: step.id },
              data: {
                targetType: mappedType as any,
                targetValue: newVal,
              }
            })
            hLogs.push(`[Smart Locator Engine] Layer 5: Test step updated successfully.`)
          } catch (dbErr: any) {
            hLogs.push(`[Smart Locator Engine] Layer 5: Failed to update test step in DB: ${dbErr.message}`)
          }
        }
        return true
      } catch (err: any) {
        hLogs.push(`[Smart Locator Engine] Fallback locator "${fallback}" failed: ${err.message}`)
      }
    }
  } else {
    hLogs.push(`[Smart Locator Engine] Layer 1: No fallback candidates found in step metadata.`)
  }

  // --- LAYER 2: DOM Context Recovery ---
  if (candidatesObj && candidatesObj.context && candidatesObj.context !== "general") {
    const contextStr = candidatesObj.context
    hLogs.push(`[Smart Locator Engine] Layer 2: Primary locator failed. Attempting DOM Context Recovery using context: "${contextStr}"`)
    try {
      const containerLocator = findContainerLocator(page, contextStr)
      if (containerLocator && (await containerLocator.count()) > 0) {
        hLogs.push(`[Smart Locator Engine] Layer 2: Found context container matching: "${contextStr}"`)
        
        const fallbacksToTry = [
          ...(candidatesObj.fallbackLocators || []),
          `${step.targetType}=${step.targetValue}`
        ]
        
        for (const fallback of fallbacksToTry) {
          try {
            hLogs.push(`[Smart Locator Engine] Layer 2: Searching for "${fallback}" inside container...`)
            const scopedLocator = resolveLocatorStringInScope(containerLocator.first(), fallback)
            await scopedLocator.waitFor({ state: "visible", timeout: 2000 })
            
            // Success! Perform action
            await runActionOnLocator(scopedLocator, actionType, inputValue, step, page, timeout)
            
            const confidence = 75
            hLogs.push(`[Smart Locator Engine] Layer 2 SUCCESS: Found target element inside container using "${fallback}" with confidence ${confidence}%`)
            
            const oldLocator = `${step.targetType}=${step.targetValue}`
            step.actionMetadata.wasHealed = true
            step.actionMetadata.oldLocator = oldLocator
            step.actionMetadata.newLocator = `${contextStr} -> ${fallback}`
            step.actionMetadata.healingMethod = "dom_context_recovery"
            step.actionMetadata.confidence = confidence
            step.actionMetadata.healed = true
            step.actionMetadata.healedLocator = fallback
            step.actionMetadata.healingLogs = hLogs
            return true
          } catch (innerErr: any) {
            // Keep trying
          }
        }
      } else {
        hLogs.push(`[Smart Locator Engine] Layer 2: Context container "${contextStr}" not found.`)
      }
    } catch (contextErr: any) {
      hLogs.push(`[Smart Locator Engine] Layer 2 DOM Context Recovery failed: ${contextErr.message}`)
    }
  }

  // --- LAYER 3 & 4: Semantic Matching & Structural Re-mapping (Browser Scoring) ---
  hLogs.push(`[Smart Locator Engine] Layer 3 & 4: Scanning page DOM for semantic matching and structural re-mapping...`)
  try {
    const originalFeatures = extractOriginalFeatures(step)
    
    const bestCandidate = await page.evaluate((features) => {
      function getSimilarity(s1: string, s2: string): number {
        if (!s1 || !s2) return 0;
        const len1 = s1.length;
        const len2 = s2.length;
        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;

        const matrix: number[][] = [];
        for (let i = 0; i <= len1; i++) {
          matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
          matrix[0][j] = j;
        }

        for (let i = 1; i <= len1; i++) {
          for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1].toLowerCase() === s2[j - 1].toLowerCase() ? 0 : 1;
            matrix[i][j] = Math.min(
              matrix[i - 1][j] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j - 1] + cost
            );
          }
        }

        const distance = matrix[len1][len2];
        return 1 - distance / Math.max(len1, len2);
      }

      const SYNONYMS: Record<string, string[]> = {
        save: ["submit", "ok", "confirm", "update", "apply"],
        submit: ["save", "ok", "confirm", "update", "apply"],
        login: ["signin", "sign in", "log in", "enter"],
        signin: ["login", "sign in", "log in", "enter"],
        "sign in": ["login", "signin", "log in", "enter"],
        "log in": ["login", "signin", "sign in", "enter"],
        cancel: ["close", "dismiss", "exit", "back"],
        close: ["cancel", "dismiss", "exit", "back"],
        register: ["signup", "sign up", "join"],
        signup: ["register", "sign up", "join"],
        "sign up": ["register", "signup", "join"],
        delete: ["remove", "discard", "trash", "clear"],
        remove: ["delete", "discard", "trash", "clear"],
        add: ["create", "new", "insert"],
        create: ["add", "new", "insert"],
        search: ["find", "query", "filter"],
        edit: ["modify", "change", "write"]
      };

      function areSynonyms(w1: string, w2: string): boolean {
        const norm1 = w1.trim().toLowerCase();
        const norm2 = w2.trim().toLowerCase();
        if (norm1 === norm2) return true;
        if (SYNONYMS[norm1] && SYNONYMS[norm1].includes(norm2)) return true;
        if (SYNONYMS[norm2] && SYNONYMS[norm2].includes(norm1)) return true;
        if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
        return false;
      }

      function getCssSelector(el: HTMLElement): string {
        if (el.id) {
          return "#" + el.id;
        }
        const testid = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa");
        if (testid) {
          return `[data-testid="${testid}"]`;
        }
        
        let path: string[] = [];
        let curr: HTMLElement | null = el;
        while (curr && curr.nodeType === Node.ELEMENT_NODE) {
          let selector = curr.nodeName.toLowerCase();
          if (curr.className) {
            const classes = Array.from(curr.classList).filter(c => !c.includes(":")).join(".");
            if (classes) selector += "." + classes;
          }
          
          let sibling = curr.previousElementSibling;
          let index = 1;
          while (sibling) {
            if (sibling.nodeName.toLowerCase() === curr.nodeName.toLowerCase()) {
              index++;
            }
            sibling = sibling.previousElementSibling;
          }
          selector += `:nth-of-type(${index})`;
          
          path.unshift(selector);
          curr = curr.parentNode as HTMLElement | null;
          if (curr && (curr.nodeName.toLowerCase() === "body" || curr.nodeName.toLowerCase() === "html")) {
            break;
          }
        }
        return path.join(" > ");
      }

      const elements = Array.from(document.querySelectorAll("button, a, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='tab'], [role='menuitem']")) as HTMLElement[];
      
      const scoredCandidates = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(el).display === "none") {
          continue;
        }

        let score = 0;

        const elRole = el.getAttribute("role") || "";
        const elTagName = el.tagName.toLowerCase();
        
        let roleOrTagMatch = false;
        if (features.role) {
          if (elRole.toLowerCase() === features.role.toLowerCase() || 
              (features.role.toLowerCase() === "button" && elTagName === "button") ||
              (features.role.toLowerCase() === "link" && elTagName === "a")) {
            roleOrTagMatch = true;
          }
        }
        if (features.tag && elTagName === features.tag.toLowerCase()) {
          roleOrTagMatch = true;
        }
        
        if (roleOrTagMatch) {
          score += 20;
        }

        const elText = (el.textContent || (el as HTMLInputElement).value || (el as HTMLInputElement).placeholder || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
        const origText = (features.text || "").trim();

        let hasTextScore = false;
        if (origText && elText) {
          if (elText.toLowerCase() === origText.toLowerCase()) {
            score += 40;
            hasTextScore = true;
          } else if (areSynonyms(origText, elText)) {
            score += 35;
            hasTextScore = true;
          } else {
            const sim = getSimilarity(origText, elText);
            if (sim > 0.6) {
              score += Math.round(sim * 30);
              hasTextScore = true;
            }
          }
        }

        const elTestId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-qa") || "";
        if (features.testid && elTestId) {
          if (elTestId.toLowerCase() === features.testid.toLowerCase()) {
            score += 20;
          }
        }

        if (features.id && el.id) {
          if (el.id.toLowerCase() === features.id.toLowerCase()) {
            score += 15;
          }
        }

        if (features.classes && features.classes.length > 0) {
          const elClasses = Array.from(el.classList);
          let overlapping = 0;
          for (const cls of features.classes) {
            if (elClasses.includes(cls)) overlapping++;
          }
          score += Math.min(5, overlapping * 2);
        }

        if (score > 15) {
          scoredCandidates.push({
            selector: getCssSelector(el),
            score: score,
            tagName: elTagName,
            role: elRole,
            text: elText,
            hasTextScore
          });
        }
      }

      scoredCandidates.sort((a, b) => b.score - a.score);
      return scoredCandidates[0] || null;
    }, originalFeatures);

    if (bestCandidate && bestCandidate.score > 20) {
      hLogs.push(`[Smart Locator Engine] Found matching DOM element: CSS="${bestCandidate.selector}", text="${bestCandidate.text}", score=${bestCandidate.score}`)
      
      const locator = page.locator(bestCandidate.selector)
      await locator.waitFor({ state: "visible", timeout: 2000 })
      
      // Perform action
      await runActionOnLocator(locator, actionType, inputValue, step, page, timeout)
      
      const isSemantic = bestCandidate.hasTextScore
      const healingMethod = isSemantic ? "semantic_match" : "structural_remap"
      const confidence = isSemantic ? 70 : 55
      
      hLogs.push(`[Smart Locator Engine] Layer ${isSemantic ? 3 : 4} SUCCESS: Recovered element via ${healingMethod} with confidence ${confidence}%`)
      
      const oldLocator = `${step.targetType}=${step.targetValue}`
      step.actionMetadata.wasHealed = true
      step.actionMetadata.oldLocator = oldLocator
      step.actionMetadata.newLocator = `css=${bestCandidate.selector}`
      step.actionMetadata.healingMethod = healingMethod
      step.actionMetadata.confidence = confidence
      step.actionMetadata.healed = true
      step.actionMetadata.healedLocator = `css=${bestCandidate.selector}`
      step.actionMetadata.healingLogs = hLogs
      return true
    } else {
      hLogs.push(`[Smart Locator Engine] Layers 3 & 4: No matching DOM elements found above score threshold.`)
    }
  } catch (evalErr: any) {
    hLogs.push(`[Smart Locator Engine] Layers 3 & 4 Evaluation failed: ${evalErr.message}`)
  }

  console.error(`[Smart Locator Engine] Auto-healing was unable to locate a functioning fallback.`)
  step.actionMetadata.healingLogs = hLogs
  return false
}

export async function executeStep(page: Page, step: Step): Promise<void> {
  const { actionType, targetType, targetValue, inputValue, timeoutMs } = step
  const timeout = Math.max(timeoutMs || 0, 10000)

  if (actionType === "open_url") {
    const defaultLoc = page.locator("html")
    await runActionOnLocator(defaultLoc, actionType, inputValue, step, page, timeout)
    return
  }

  const primaryLocator = getLocator(page, targetType, targetValue)
  try {
    await runActionOnLocator(primaryLocator, actionType, inputValue, step, page, timeout)
  } catch (primaryError: any) {
    const healed = await attemptAutoHealing(page, step, actionType, inputValue, timeout, primaryError)
    if (!healed) {
      throw primaryError
    }
  }
}
