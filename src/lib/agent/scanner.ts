import { Page } from "playwright"
import { ScannerResult, ScannedElement } from "./types"
import { saveAgentScreenshot } from "./artifacts"

export async function scanPage(page: Page, url: string, agentRunId: string): Promise<ScannerResult> {
  console.log(`[QAAgentScanner] Navigating to and scanning: ${url}`)
  
  const consoleErrors: string[] = []
  const networkErrors: string[] = []

  // Hook console & network failure events
  page.on("console", msg => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text())
    }
  })
  page.on("pageerror", err => {
    consoleErrors.push(err.message)
  })
  page.on("requestfailed", req => {
    const errText = req.failure()?.errorText || "Network request failed"
    networkErrors.push(`${req.method()} ${req.url()} failed: ${errText}`)
  })

  // Go to URL
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
    await page.waitForTimeout(2000)
  } catch (err: any) {
    throw new Error(`Target URL did not load within 45 seconds: ${err.message}`)
  }

  // Scan layout
  const scannerData = await page.evaluate(() => {
    const inputs: any[] = []
    const buttons: any[] = []
    const links: any[] = []
    const tables: any[] = []
    const forms: any[] = []
    const modals: any[] = []
    const dropdowns: any[] = []

    const getCleanText = (el: HTMLElement) => {
      return (el.textContent || el.innerText || "").trim().substring(0, 100)
    }

    const getInputLabel = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
      if (el.labels && el.labels.length > 0) {
        return el.labels[0].textContent?.trim() || ""
      }
      const id = el.getAttribute("id")
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`)
        if (label) return label.textContent?.trim() || ""
      }
      return el.getAttribute("aria-label") || el.getAttribute("placeholder") || ""
    }

    // 1. Scan inputs, textareas, selects
    const formControls = document.querySelectorAll("input, textarea, select")
    formControls.forEach((ctrl: any) => {
      const tagName = ctrl.tagName.toLowerCase()
      const type = ctrl.getAttribute("type") || ""
      const id = ctrl.getAttribute("id") || ""
      const name = ctrl.getAttribute("name") || ""
      const placeholder = ctrl.getAttribute("placeholder") || ""
      const testid = ctrl.getAttribute("data-testid") || ""
      const role = ctrl.getAttribute("role") || ""
      const label = getInputLabel(ctrl)

      const elementData = { tagName, type, id, name, placeholder, label, testid, role }

      if (tagName === "select") {
        dropdowns.push(elementData)
      } else if (["submit", "button", "reset"].includes(type)) {
        buttons.push({ ...elementData, text: ctrl.value || placeholder || label })
      } else {
        inputs.push(elementData)
      }
    })

    // 2. Scan buttons
    const buttonElements = document.querySelectorAll("button, [role='button']")
    buttonElements.forEach((btn: any) => {
      const text = getCleanText(btn) || btn.value || ""
      const id = btn.getAttribute("id") || ""
      const name = btn.getAttribute("name") || ""
      const testid = btn.getAttribute("data-testid") || ""
      const role = btn.getAttribute("role") || "button"
      
      if (btn.tagName.toLowerCase() === "input" && ["text", "email", "password"].includes(btn.type)) {
        return
      }

      const exists = buttons.some(b => b.id === id && b.text === text && id !== "")
      if (!exists) {
        buttons.push({
          tagName: btn.tagName.toLowerCase(),
          id,
          name,
          text,
          testid,
          role
        })
      }
    })

    // 3. Scan Links
    const linkElements = document.querySelectorAll("a")
    linkElements.forEach((link: any) => {
      const text = getCleanText(link)
      const href = link.getAttribute("href") || ""
      const id = link.getAttribute("id") || ""
      
      if (text && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        links.push({
          tagName: "a",
          id,
          text,
          href,
          testid: link.getAttribute("data-testid") || ""
        })
      }
    })

    // 4. Scan Tables
    const tableElements = document.querySelectorAll("table")
    tableElements.forEach((table: any) => {
      const id = table.getAttribute("id") || ""
      const headers: string[] = []
      table.querySelectorAll("th").forEach((th: any) => {
        headers.push(getCleanText(th))
      })
      const rowCount = table.querySelectorAll("tr").length - 1
      tables.push({ id, headers, rowCount: Math.max(0, rowCount) })
    })

    // 5. Scan Forms
    const formElements = document.querySelectorAll("form")
    formElements.forEach((form: any) => {
      const id = form.getAttribute("id") || ""
      const action = form.getAttribute("action") || ""
      const inputsCount = form.querySelectorAll("input, textarea, select").length
      forms.push({ id, action, inputsCount })
    })

    // 6. Scan Modals
    const modalElements = document.querySelectorAll("[role='dialog'], .modal, .dialog")
    modalElements.forEach((modal: any) => {
      const style = window.getComputedStyle(modal)
      if (style.display !== "none" && style.visibility !== "hidden") {
        const id = modal.getAttribute("id") || ""
        const titleEl = modal.querySelector(".modal-title, h1, h2, h3, h4")
        const title = titleEl ? getCleanText(titleEl) : "Active Modal"
        modals.push({ id, title })
      }
    })

    // 7. Headings Count
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6").length

    return {
      title: document.title,
      headings,
      inputs,
      buttons,
      links,
      tables,
      forms,
      modals,
      dropdowns
    }
  })

  // Capture screenshot
  let screenshotPath = ""
  try {
    const scr = await page.screenshot({ type: "png", timeout: 4000 })
    screenshotPath = await saveAgentScreenshot(agentRunId, "scan.png", scr)
  } catch (err: any) {
    console.error("[QAAgentScanner] Failed to capture page scan screenshot:", err.message)
  }

  // Construct standard output
  return {
    targetUrl: url,
    title: scannerData.title,
    pagesDetected: [
      {
        url,
        title: scannerData.title,
        summary: {
          headings: scannerData.headings,
          buttons: scannerData.buttons.length,
          inputs: scannerData.inputs.length,
          forms: scannerData.forms.length,
          tables: scannerData.tables.length,
          links: scannerData.links.length
        }
      }
    ],
    inputs: scannerData.inputs,
    buttons: scannerData.buttons,
    links: scannerData.links,
    tables: scannerData.tables,
    forms: scannerData.forms,
    modals: scannerData.modals,
    dropdowns: scannerData.dropdowns,
    consoleErrors,
    networkErrors,
    screenshotPath
  }
}
