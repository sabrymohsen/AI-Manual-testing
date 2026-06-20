import { Page } from "playwright"

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
}

export interface ScannerResult {
  url: string
  title: string
  inputs: ScannedElement[]
  buttons: ScannedElement[]
  links: ScannedElement[]
  tables: Array<{ id?: string; headers: string[]; rowCount: number }>
  forms: Array<{ id?: string; action?: string; inputsCount: number }>
  modals: Array<{ title?: string; id?: string }>
  dropdowns: ScannedElement[]
}

export async function scanPage(page: Page, url: string): Promise<ScannerResult> {
  console.log(`[QAAgentScanner] Navigating to and scanning: ${url}`)
  
  // Go to URL with reasonable timeout
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
    await page.waitForTimeout(1000)
  } catch (err: any) {
    throw new Error(`Target URL did not load within 45 seconds: ${err.message}`)
  }

  // Evaluate script in context of browser to detect components
  const scannerData = await page.evaluate(() => {
    const inputs: any[] = []
    const buttons: any[] = []
    const links: any[] = []
    const tables: any[] = []
    const forms: any[] = []
    const modals: any[] = []
    const dropdowns: any[] = []

    // Helper to get text content safely
    const getCleanText = (el: HTMLElement) => {
      return (el.textContent || el.innerText || "").trim().substring(0, 100)
    }

    // Helper to get labels for an input element
    const getInputLabel = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
      if (el.labels && el.labels.length > 0) {
        return el.labels[0].textContent?.trim() || ""
      }
      const id = el.getAttribute("id")
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`)
        if (label) return label.textContent?.trim() || ""
      }
      // Try placeholder or aria-label as fallback label
      return el.getAttribute("aria-label") || el.getAttribute("placeholder") || ""
    }

    // 1. Scan Inputs & Selects (dropdowns)
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

    // 2. Scan Buttons
    const buttonElements = document.querySelectorAll("button, [role='button']")
    buttonElements.forEach((btn: any) => {
      const text = getCleanText(btn) || btn.value || ""
      const id = btn.getAttribute("id") || ""
      const name = btn.getAttribute("name") || ""
      const testid = btn.getAttribute("data-testid") || ""
      const role = btn.getAttribute("role") || "button"
      
      // Avoid duplicate inputs added as buttons
      if (btn.tagName.toLowerCase() === "input" && ["text", "email", "password"].includes(btn.type)) {
        return
      }

      // Check if button is already added
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

    // 3. Scan Links (A elements)
    const linkElements = document.querySelectorAll("a")
    linkElements.forEach((link: any) => {
      const text = getCleanText(link)
      const href = link.getAttribute("href") || ""
      const id = link.getAttribute("id") || ""
      
      // Filter out links with no text or no useful href
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
      const rowCount = table.querySelectorAll("tr").length - 1 // minus header row
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

    // 6. Scan Modals/Dialogs
    const modalElements = document.querySelectorAll("[role='dialog'], .modal, .dialog")
    modalElements.forEach((modal: any) => {
      // Only record if visible
      const style = window.getComputedStyle(modal)
      if (style.display !== "none" && style.visibility !== "hidden") {
        const id = modal.getAttribute("id") || ""
        const titleEl = modal.querySelector(".modal-title, h1, h2, h3, h4")
        const title = titleEl ? getCleanText(titleEl) : "Active Modal"
        modals.push({ id, title })
      }
    })

    return {
      title: document.title,
      inputs,
      buttons,
      links,
      tables,
      forms,
      modals,
      dropdowns
    }
  })

  return {
    url,
    title: scannerData.title,
    inputs: scannerData.inputs,
    buttons: scannerData.buttons,
    links: scannerData.links,
    tables: scannerData.tables,
    forms: scannerData.forms,
    modals: scannerData.modals,
    dropdowns: scannerData.dropdowns
  }
}
