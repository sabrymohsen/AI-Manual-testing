// @ts-nocheck - This file is an injected browser script stored as a template literal. HTML inside the string is not real JSX/TS.
export const INJECTED_RECORDER_SCRIPT = `(function() {
  if (window.self !== window.top) return;
  if (window.__qa_recorder_injected) return;
  window.__qa_recorder_injected = true;

  function isDynamicValue(val) {
    if (!val) return false;
    const dynamicRegexes = [
      /ng-tns-c\\d+-\\d+/,
      /ng-star-inserted/,
      /css-[a-z0-9]+/i,
      /sc-[a-z0-9]+/i,
      /Mui[A-Z][a-zA-Z]+-root-\\d+/,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      /^\\d+$/
    ];
    return dynamicRegexes.some((rx) => rx.test(val));
  }

  function getStableClasses(element) {
    const classList = element.className;
    if (typeof classList !== "string") return [];
    return classList
      .split(/\\s+/)
      .filter((c) => c && !isDynamicValue(c) && !c.startsWith("ng-") && !c.startsWith("css-") && !c.startsWith("sc-"));
  }

  function generateCssSelector(element) {
    const testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-qa");
    if (testId && !isDynamicValue(testId)) {
      return '[data-testid="' + testId + '"]';
    }
    const id = element.id;
    if (id && !isDynamicValue(id)) {
      return '#' + id;
    }
    const name = element.getAttribute("name");
    if (name && !isDynamicValue(name)) {
      return element.tagName.toLowerCase() + '[name="' + name + '"]';
    }

    const path = [];
    let curr = element;
    while (curr && curr.nodeType === Node.ELEMENT_NODE) {
      const tagName = curr.tagName.toLowerCase();
      if (tagName === "body" || tagName === "html") {
        path.unshift(tagName);
        break;
      }
      const cTestId = curr.getAttribute("data-testid") || curr.getAttribute("data-test");
      if (cTestId && !isDynamicValue(cTestId)) {
        path.unshift('[data-testid="' + cTestId + '"]');
        break;
      }
      const cId = curr.id;
      if (cId && !isDynamicValue(cId)) {
        path.unshift('#' + cId);
        break;
      }
      const stableClasses = getStableClasses(curr);
      if (stableClasses.length > 0) {
        path.unshift(tagName + "." + stableClasses.join("."));
      } else {
        let siblingIndex = 1;
        let sibling = curr.previousElementSibling;
        while (sibling) {
          if (sibling.tagName.toLowerCase() === tagName) siblingIndex++;
          sibling = sibling.previousElementSibling;
        }
        path.unshift(tagName + ":nth-of-type(" + siblingIndex + ")");
      }
      curr = curr.parentElement;
    }
    return path.join(" > ");
  }

  function generateXPath(element) {
    const testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
    if (testId && !isDynamicValue(testId)) {
      return "//*[@data-testid='" + testId + "']";
    }
    const id = element.id;
    if (id && !isDynamicValue(id)) {
      return "//*[@id='" + id + "']";
    }

    const paths = [];
    let curr = element;
    while (curr && curr.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = curr.previousElementSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === curr.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      const tagName = curr.tagName.toLowerCase();
      const indexPart = index > 1 || (curr.nextElementSibling && curr.nextElementSibling.tagName === curr.tagName)
        ? "[" + index + "]"
        : "";
      paths.unshift(tagName + indexPart);
      curr = curr.parentElement;
    }
    return "/" + paths.join("/");
  }

  function calculateReliabilityScore(locators) {
    let score = 0;
    if (locators.testIdSelector) score += 100;
    else if (locators.idSelector) score += 90;
    else if (locators.labelSelector) score += 80;
    else if (locators.placeholderSelector) score += 75;
    else if (locators.roleSelector) score += 70;
    else if (locators.textSelector && locators.textSelector.length < 40) score += 60;
    else if (locators.cssSelector) score += 40;
    else score += 10;

    if (locators.cssSelector && locators.cssSelector.includes("nth-of-type")) score -= 15;
    if (locators.xpathSelector && locators.xpathSelector.includes("/")) {
      const depth = locators.xpathSelector.split("/").length;
      if (depth > 5) score -= Math.min(25, depth * 2);
    }
    return Math.max(0, Math.min(100, score));
  }

  function chooseBestLocator(locators) {
    if (locators.testIdSelector) {
      return {
        locatorType: "test_id",
        locatorValue: locators.attributes["data-testid"] || locators.attributes["data-test"] || locators.attributes["data-qa"] || "",
        recommendedSelector: locators.testIdSelector,
      };
    }
    if (locators.idSelector) {
      const rawId = locators.idSelector.startsWith("#") ? locators.idSelector.substring(1) : locators.idSelector;
      return {
        locatorType: "css",
        locatorValue: "#" + rawId,
        recommendedSelector: locators.idSelector,
      };
    }
    if (locators.labelSelector) {
      return {
        locatorType: "label",
        locatorValue: locators.labelSelector,
        recommendedSelector: "Label: " + locators.labelSelector,
      };
    }
    if (locators.placeholderSelector) {
      return {
        locatorType: "placeholder",
        locatorValue: locators.placeholderSelector,
        recommendedSelector: "Placeholder: " + locators.placeholderSelector,
      };
    }
    if (locators.roleSelector) {
      const parts = locators.roleSelector.split(":");
      const role = parts[0];
      const name = parts.slice(1).join(":");
      return {
        locatorType: "role",
        locatorValue: role + ', name: "' + name + '"',
        recommendedSelector: "Role: " + role + " (" + name + ")",
      };
    }
    if (locators.textSelector && locators.textSelector.length < 50) {
      return {
        locatorType: "text",
        locatorValue: locators.textSelector,
        recommendedSelector: 'Text: "' + locators.textSelector + '"',
      };
    }
    if (locators.cssSelector) {
      return {
        locatorType: "css",
        locatorValue: locators.cssSelector,
        recommendedSelector: locators.cssSelector,
      };
    }
    return {
      locatorType: "xpath",
      locatorValue: locators.xpathSelector || "",
      recommendedSelector: locators.xpathSelector || "",
    };
  }

  function generateLocatorsForElement(element) {
    const tagName = element.tagName.toLowerCase();
    
    const isPasswordInput = tagName === "input" && (
      (element.getAttribute("type") || "").toLowerCase() === "password" ||
      (element.id || "").toLowerCase().includes("password") ||
      (element.getAttribute("name") || "").toLowerCase().includes("password") ||
      (element.getAttribute("autocomplete") || "").toLowerCase().includes("password") ||
      (element.getAttribute("name") || "").toLowerCase().includes("token") ||
      (element.getAttribute("name") || "").toLowerCase().includes("secret")
    );

    let visibleText = isPasswordInput ? "" : (element.textContent?.trim().substring(0, 100) || "");

    const attributes = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (isPasswordInput && ["value", "placeholder", "aria-label", "title"].includes(attr.name)) {
        attributes[attr.name] = "";
      } else {
        attributes[attr.name] = attr.value;
      }
    }

    const testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-qa");
    const testIdSelector = testId && !isDynamicValue(testId) ? '[data-testid="' + testId + '"]' : undefined;

    const id = element.id;
    const idSelector = id && !isDynamicValue(id) ? '#' + id : undefined;

    const placeholder = isPasswordInput ? undefined : element.getAttribute("placeholder");
    const placeholderSelector = placeholder ? placeholder : undefined;

    let labelSelector;
    if (id) {
      const labelEl = document.querySelector('label[for="' + id + '"]');
      if (labelEl) labelSelector = labelEl.textContent?.trim() || undefined;
    }
    if (!labelSelector) {
      const labelParent = element.closest("label");
      if (labelParent) {
        const clone = labelParent.cloneNode(true);
        const input = clone.querySelector("input, select, textarea");
        if (input) input.remove();
        labelSelector = clone.textContent?.trim() || undefined;
      }
    }

    let roleSelector;
    let derivedRole = element.getAttribute("role");
    if (!derivedRole) {
      if (tagName === "button" || (tagName === "input" && (attributes["type"] === "button" || attributes["type"] === "submit"))) {
        derivedRole = "button";
      } else if (tagName === "a") {
        derivedRole = "link";
      } else if (tagName === "input" && attributes["type"] === "checkbox") {
        derivedRole = "checkbox";
      } else if (tagName === "input" && attributes["type"] === "radio") {
        derivedRole = "radio";
      } else if (tagName === "input" || tagName === "textarea") {
        derivedRole = "textbox";
      } else if (tagName === "select") {
        derivedRole = "combobox";
      } else if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "h5" || tagName === "h6") {
        derivedRole = "heading";
      }
    }

    if (derivedRole) {
      const accessibleName = element.getAttribute("aria-label") || labelSelector || visibleText || placeholder || attributes["title"] || "";
      roleSelector = derivedRole + ":" + accessibleName;
    }

    const textSelector = visibleText ? visibleText : undefined;
    const cssSelector = generateCssSelector(element);
    const xpathSelector = generateXPath(element);

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
    };

    const score = calculateReliabilityScore(partialLocators);
    const best = chooseBestLocator(partialLocators);

    const alternativeLocators = {
      testId: testIdSelector,
      id: idSelector,
      css: cssSelector,
      xpath: xpathSelector,
      role: roleSelector,
      text: textSelector,
      label: labelSelector,
      placeholder: placeholderSelector
    };

    return {
      ...partialLocators,
      reliabilityScore: score,
      targetType: best.locatorType,
      targetValue: best.locatorValue,
      recommendedSelector: best.recommendedSelector,
      alternativeLocators
    };
  }

  function getElementFriendlyName(el) {
    if (el.getAttribute("data-testid")) return el.getAttribute("data-testid");
    if (el.id) return el.id;
    if (el.getAttribute("name")) return el.getAttribute("name");
    if (el.getAttribute("placeholder")) return el.getAttribute("placeholder");
    
    const label = el.closest("label") || document.querySelector('label[for="' + el.id + '"]');
    if (label) {
      const text = label.textContent.trim();
      if (text) return text;
    }

    if (el.textContent) {
      const text = el.textContent.trim().substring(0, 30);
      if (text) return text;
    }

    return el.tagName.toLowerCase();
  }

  function isPasswordInput(el) {
    const tagName = el.tagName.toLowerCase();
    return tagName === "input" && (
      (el.getAttribute("type") || "").toLowerCase() === "password" ||
      (el.id || "").toLowerCase().includes("password") ||
      (el.getAttribute("name") || "").toLowerCase().includes("password") ||
      (el.getAttribute("autocomplete") || "").toLowerCase().includes("password") ||
      (el.getAttribute("name") || "").toLowerCase().includes("token") ||
      (el.getAttribute("name") || "").toLowerCase().includes("secret")
    );
  }

  function detectComponentType(el) {
    if (!el) return "unknown";

    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || "";
    const typeAttr = el.getAttribute("type") || "";
    const className = el.className;
    const classes = typeof className === "string" ? className.toLowerCase() : "";
    const placeholder = el.getAttribute("placeholder")?.toLowerCase() || "";
    const name = el.getAttribute("name")?.toLowerCase() || "";
    const id = el.id?.toLowerCase() || "";

    // 1. native_select
    if (tagName === "select") {
      return "native_select";
    }

    // 2. checkbox & radio
    if (tagName === "input" && typeAttr === "checkbox") {
      return "checkbox";
    }
    if (tagName === "input" && typeAttr === "radio") {
      return "radio";
    }
    if (role === "checkbox") {
      return "checkbox";
    }
    if (role === "radio") {
      return "radio";
    }

    // 3. file_upload
    if (tagName === "input" && typeAttr === "file") {
      return "file_upload";
    }

    // 4. date_picker & time_picker
    if (tagName === "input" && typeAttr === "date") {
      return "date_picker";
    }
    if (tagName === "input" && typeAttr === "time") {
      return "time_picker";
    }
    if (
      placeholder.includes("date") ||
      placeholder.includes("calendar") ||
      placeholder.includes("dd/mm/yyyy") ||
      placeholder.includes("mm/dd/yyyy") ||
      placeholder.includes("select date") ||
      placeholder.includes("yyyy-mm-dd") ||
      name.includes("date") ||
      id.includes("date") ||
      classes.includes("datepicker") ||
      classes.includes("calendar-picker") ||
      classes.includes("react-datepicker") ||
      el.closest(".datepicker") ||
      el.closest(".calendar-picker") ||
      el.closest(".react-datepicker-wrapper") ||
      el.closest("[aria-haspopup='grid']")
    ) {
      return "date_picker";
    }

    if (
      placeholder.includes("time") ||
      placeholder.includes("clock") ||
      placeholder.includes("select time") ||
      name.includes("time") ||
      id.includes("time") ||
      classes.includes("timepicker") ||
      el.closest(".timepicker")
    ) {
      return "time_picker";
    }

    // 5. slider
    if (tagName === "input" && typeAttr === "range") {
      return "slider";
    }
    if (role === "slider" || classes.includes("slider") || el.closest(".slider") || el.closest("[role='slider']")) {
      return "slider";
    }

    // 6. toggle (switch)
    if (role === "switch" || classes.includes("switch") || classes.includes("toggle") || el.closest("[role='switch']")) {
      return "toggle";
    }

    // 7. tab
    if (role === "tab" || classes.includes("tab") || classes.includes("-tab-") || el.closest("[role='tablist']")) {
      return "tab";
    }

    // 8. menu
    if (role === "menuitem" || role === "menu" || classes.includes("menuitem") || el.closest("[role='menu']")) {
      return "menu";
    }

    // 9. accordion
    if (
      el.closest(".accordion") ||
      classes.includes("accordion-trigger") ||
      classes.includes("accordion-header") ||
      el.getAttribute("aria-controls")?.includes("accordion")
    ) {
      return "accordion";
    }

    // 10. pagination
    if (
      el.closest(".pagination") ||
      el.closest("nav[aria-label*='pagination']") ||
      classes.includes("pagination") ||
      placeholder.includes("page")
    ) {
      return "pagination";
    }

    // 11. toast / alert
    if (
      role === "alert" ||
      role === "status" ||
      classes.includes("toast") ||
      classes.includes("notification") ||
      classes.includes("alert") ||
      classes.includes("snackbar") ||
      el.closest("[role='alert']") ||
      el.closest(".toast")
    ) {
      return "toast";
    }

    // 12. table
    if (tagName === "table" || tagName === "td" || tagName === "tr" || tagName === "th" || role === "grid" || el.closest("table") || el.closest("[role='grid']")) {
      return "table";
    }

    // 13. modal / dialog
    if (role === "dialog" || el.getAttribute("aria-modal") === "true" || el.closest("[role='dialog']") || el.closest(".modal")) {
      return "modal";
    }

    // 14. multi_select (combobox/select with multiple option attributes)
    if (
      el.closest(".multi-select") ||
      classes.includes("multi-select") ||
      classes.includes("multiselect") ||
      el.getAttribute("aria-multiselectable") === "true" ||
      el.closest("[aria-multiselectable='true']")
    ) {
      return "multi_select";
    }

    // 15. searchable_select / autocomplete
    if (
      tagName === "input" && (
        role === "combobox" ||
        el.getAttribute("aria-autocomplete") === "list" ||
        el.getAttribute("aria-autocomplete") === "both" ||
        classes.includes("combobox") ||
        classes.includes("autocomplete") ||
        classes.includes("select-input") ||
        placeholder.includes("search") ||
        placeholder.includes("find") ||
        placeholder.includes("select")
      )
    ) {
      return "searchable_select";
    }

    // 16. custom_select (combobox buttons/divs)
    if (
      role === "combobox" ||
      el.getAttribute("aria-haspopup") === "listbox" ||
      classes.includes("select-trigger") ||
      classes.includes("dropdown-trigger") ||
      classes.includes("combobox-trigger") ||
      el.closest(".select-trigger") ||
      el.closest(".dropdown-trigger")
    ) {
      return "custom_select";
    }

    // 17. standard inputs
    if (tagName === "input") {
      return "input";
    }
    if (tagName === "textarea") {
      return "textarea";
    }
    if (tagName === "button" || role === "button" || typeAttr === "button" || typeAttr === "submit") {
      return "button";
    }
    if (tagName === "a" || role === "link") {
      return "link";
    }

    return "unknown";
  }

  function isDropdownOption(el) {
    if (!el) return false;
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || "";
    const className = el.className;
    const classes = typeof className === "string" ? className.toLowerCase() : "";
    
    if (tagName === "option" || role === "option" || role === "menuitem") {
      return true;
    }
    if (classes.includes("option") || classes.includes("select-item") || classes.includes("dropdown-item")) {
      return true;
    }
    if (el.closest("[role='listbox']") || el.closest("[role='menu']") || el.closest(".select-content") || el.closest(".dropdown-content")) {
      if (tagName === "li" || tagName === "div" || tagName === "span" || tagName === "button") {
        return true;
      }
    }
    return false;
  }

  window.__qa_active_dropdown = null;
  window.__qa_dropdown_grouping = true;

  function commitActiveDropdown() {
    if (!window.__qa_active_dropdown) return;
    
    const friendlyName = getElementFriendlyName(window.__qa_active_dropdown.triggerEl);
    const text = window.__qa_active_dropdown.textEntered;
    
    let actionData;
    if (window.__qa_active_dropdown.componentType === "searchable_select" && text) {
      actionData = {
        actionType: "fill",
        actionDescription: 'Fill "' + friendlyName + '" with "' + text + '"',
        pageUrl: window.location.href,
        inputValue: text,
        componentType: "searchable_select",
        rawEvents: window.__qa_active_dropdown.rawEvents,
        ...window.__qa_active_dropdown.triggerLocator
      };
    } else {
      actionData = {
        actionType: "click",
        actionDescription: 'Click "' + friendlyName + '" ' + (window.__qa_active_dropdown.componentType === "custom_select" ? "dropdown trigger" : "element"),
        pageUrl: window.location.href,
        componentType: window.__qa_active_dropdown.componentType,
        rawEvents: window.__qa_active_dropdown.rawEvents,
        ...window.__qa_active_dropdown.triggerLocator
      };
    }
    
    saveAction(actionData);
    window.__qa_active_dropdown = null;

    const host = document.getElementById("__qa_recorder_host");
    if (host && host.shadowRoot) {
      const statusEl = host.shadowRoot.getElementById("qa-grouping-status");
      if (statusEl) {
        statusEl.textContent = "Ready";
        statusEl.style.color = "#94a3b8";
      }
    }
  }

  function handleToastDetected(el) {
    if (el.__qa_detected) return;
    el.__qa_detected = true;
    
    const text = el.textContent?.trim() || "";
    if (!text || text.length > 200) return;
    
    const locatorData = generateLocatorsForElement(el);
    const actionData = {
      actionType: "wait_for_text",
      actionDescription: 'Wait for toast notification: "' + text.substring(0, 50) + '"',
      pageUrl: window.location.href,
      componentType: "toast",
      assertionType: "wait_for_text",
      assertionValue: text,
      inputValue: text,
      ...locatorData
    };
    saveAction(actionData);
    syncSessionStatus();
  }

  function handleModalDetected(el) {
    if (el.__qa_detected) return;
    el.__qa_detected = true;
    
    const titleEl = el.querySelector("h1, h2, h3, h4, h5, h6, .modal-title, [id*='title']");
    const title = titleEl?.textContent?.trim() || "Dialog";
    
    const locatorData = generateLocatorsForElement(el);
    const actionData = {
      actionType: "modal_open",
      actionDescription: 'Modal dialog "' + title + '" opened',
      pageUrl: window.location.href,
      componentType: "modal",
      ...locatorData
    };
    saveAction(actionData);
    syncSessionStatus();
  }

  // Set up MutationObserver
  const bodyObserver = new MutationObserver(function(mutations) {
    if (window.__qa_mode === "paused") return;

    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.type === "childList") {
        for (let j = 0; j < mutation.addedNodes.length; j++) {
          const node = mutation.addedNodes[j];
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          
          const detected = detectComponentType(node);
          if (detected === "toast") {
            handleToastDetected(node);
          } else if (detected === "modal") {
            handleModalDetected(node);
          } else {
            const toasts = node.querySelectorAll("[role='alert'], .toast, .notification, .alert, .snackbar");
            toasts.forEach(handleToastDetected);
            
            const modals = node.querySelectorAll("[role='dialog'], [aria-modal='true'], .modal");
            modals.forEach(handleModalDetected);
          }
        }
      }
    }
  });
  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Active state mode trackers
  window.__qa_assert_mode = null; 
  window.__qa_mode = "recording"; // "recording", "picker", "verify", "paused"
  window.__finishSessionModalOpen = false;
  window.__isFinishingSession = false;
  window.__finishSessionLocked = false;
  let hoveredElement = null;
  let localConsoleErrorsCount = 0;
  let localNetworkErrorsCount = 0;

  // Intercept JS exceptions to count errors locally
  window.addEventListener("error", function() {
    localConsoleErrorsCount++;
    updateToolbarBadgeCount();
  });
  window.addEventListener("unhandledrejection", function() {
    localConsoleErrorsCount++;
    updateToolbarBadgeCount();
  });

  // Dragging states
  let isDragging = false;
  let startX, startY;
  let initialX, initialY;

  function onMouseMove(e) {
    if (window.__qa_mode !== "picker" && window.__qa_mode !== "verify") return;
    
    const host = document.getElementById("__qa_recorder_host");
    if (host && e.composedPath && e.composedPath().includes(host)) return;

    const target = e.target;
    if (hoveredElement && hoveredElement !== target) {
      hoveredElement.style.outline = hoveredElement.__qa_old_outline || "";
      hoveredElement = null;
    }

    if (!hoveredElement) {
      hoveredElement = target;
      target.__qa_old_outline = target.style.outline;
      if (window.__qa_mode === "verify") {
        target.style.outline = "2px dashed #8b5cf6"; // Purple for verification
      } else {
        target.style.outline = "2px dashed #3b82f6"; // Blue for picker
      }
      target.style.outlineOffset = "2px";
      showElementInspectorTooltip(target, e);
    }
  }

  function onMouseOut(e) {
    if (hoveredElement) {
      hoveredElement.style.outline = hoveredElement.__qa_old_outline || "";
      hoveredElement = null;
      hideElementInspectorTooltip();
    }
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseout", onMouseOut, true);

  // Expose status checker function
  async function syncSessionStatus() {
    if (window.__finishSessionLocked) return;
    try {
      const res = await window.qaRecordAction({ actionType: "get_status" });
      if (res && res.success) {
        const host = document.getElementById("__qa_recorder_host");
        if (!host || !host.shadowRoot) return;

        const countSpan = host.shadowRoot.getElementById("qa-step-count");
        if (countSpan) countSpan.textContent = res.currentStepCount || "1";

        const titleSpan = host.shadowRoot.getElementById("qa-case-title");
        if (titleSpan) titleSpan.textContent = res.caseTitle || "Draft Case";

        const statusBadge = host.shadowRoot.getElementById("qa-status-badge");
        if (statusBadge) {
          statusBadge.textContent = window.__qa_mode.toUpperCase();
          statusBadge.className = "qa-badge-" + window.__qa_mode;
        }

        localConsoleErrorsCount = res.consoleErrorsCount || 0;
        localNetworkErrorsCount = res.networkErrorsCount || 0;
        updateToolbarBadgeCount();
      }
    } catch (e) {}
  }

  function updateToolbarBadgeCount() {
    const host = document.getElementById("__qa_recorder_host");
    if (!host || !host.shadowRoot) return;
    const errorsWarning = host.shadowRoot.getElementById("qa-errors-warning");
    const errorsCount = host.shadowRoot.getElementById("qa-errors-count");
    const total = localConsoleErrorsCount + localNetworkErrorsCount;
    if (errorsWarning && errorsCount) {
      if (total > 0) {
        errorsCount.textContent = total;
        errorsWarning.style.display = "flex";
      } else {
        errorsWarning.style.display = "none";
      }
    }
  }

  function showElementInspectorTooltip(element, e) {
    const host = document.getElementById("__qa_recorder_host");
    if (!host || !host.shadowRoot) return;
    const tooltip = host.shadowRoot.getElementById("qa-hover-tooltip");
    if (!tooltip) return;

    const testId = element.getAttribute("data-testid") || "";
    const ariaLabel = element.getAttribute("aria-label") || "";
    
    tooltip.innerHTML = \`
      <div><strong>Tag:</strong> \${element.tagName.toLowerCase()}</div>
      \${element.id ? \`<div><strong>ID:</strong> #\${element.id}</div>\` : ""}
      \${testId ? \`<div><strong>Test ID:</strong> \${testId}</div>\` : ""}
      \${ariaLabel ? \`<div><strong>Aria:</strong> \${ariaLabel}</div>\` : ""}
    \`;
    tooltip.style.left = (e.clientX + 15) + "px";
    tooltip.style.top = (e.clientY + 15) + "px";
    tooltip.style.display = "block";
  }

  function hideElementInspectorTooltip() {
    const host = document.getElementById("__qa_recorder_host");
    if (!host || !host.shadowRoot) return;
    const tooltip = host.shadowRoot.getElementById("qa-hover-tooltip");
    if (tooltip) tooltip.style.display = "none";
  }

  // Shadow DOM Injections & Drag/Draggable setup
  function injectToolbar() {
    if (window.self !== window.top) return;
    if (document.getElementById("__qa_recorder_host")) return;

    const host = document.createElement("div");
    host.id = "__qa_recorder_host";
    const container = document.body || document.documentElement;
    container.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = \`
      .qa-glass-panel {
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 320px;
        background: rgba(15, 23, 42, 0.96);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        z-index: 2147483647;
        overflow: hidden;
        transition: height 0.2s ease, opacity 0.15s ease;
      }
      .qa-header {
        padding: 12px 16px;
        background: rgba(30, 41, 59, 0.5);
        border-b: 1px solid rgba(255,255,255,0.1);
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .qa-title-area {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .qa-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .qa-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ef4444;
        animation: pulse 1.5s infinite;
      }
      .qa-dot-paused {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #eab308;
      }
      .qa-logo {
        font-weight: 700;
        font-size: 14px;
        background: linear-gradient(135deg, #38bdf8, #818cf8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .qa-badge-state {
        font-size: 9px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 6px;
        text-transform: uppercase;
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
      }
      .qa-badge-recording { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
      .qa-badge-paused { background: rgba(234, 179, 8, 0.15); color: #eab308; }
      .qa-badge-picker { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
      .qa-badge-verify { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }

      .qa-body {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .qa-case-info {
        font-size: 11px;
        color: #94a3b8;
        background: rgba(255,255,255,0.03);
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.05);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .qa-actions-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .qa-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #f1f5f9;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.15s ease;
      }
      .qa-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255,255,255,0.2);
        transform: translateY(-1px);
      }
      .qa-btn-active {
        background: rgba(59, 130, 246, 0.25) !important;
        border-color: #3b82f6 !important;
        color: #60a5fa !important;
      }
      .qa-btn-finish {
        background: linear-gradient(135deg, #10b981, #059669);
        border: none;
        color: white;
        font-weight: 600;
      }
      .qa-btn-finish:hover {
        background: linear-gradient(135deg, #059669, #047857);
      }
      .qa-btn-cancel {
        background: transparent;
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #f87171;
      }
      .qa-btn-cancel:hover {
        background: rgba(239, 68, 68, 0.1);
        border-color: #ef4444;
      }
      .qa-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.08);
      }
      .qa-warning-panel {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        padding: 6px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #fca5a5;
      }
      .qa-link {
        color: #38bdf8;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        font-size: 11px;
        font-weight: bold;
        text-decoration: underline;
      }
      .qa-link:hover { color: #60a5fa; }
      
      /* In-browser Modals */
      .qa-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.65);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
      }
      .qa-dialog {
        background: #0f172a;
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 16px;
        width: 380px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
      }
      .qa-dialog-title {
        font-weight: bold;
        font-size: 15px;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .qa-form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .qa-form-group label {
        font-size: 11px;
        font-weight: bold;
        color: #94a3b8;
      }
      .qa-input, .qa-select, .qa-textarea {
        background: #1e293b;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        color: white;
        padding: 8px 12px;
        font-size: 13px;
        font-family: inherit;
        outline: none;
      }
      .qa-input:focus, .qa-select:focus, .qa-textarea:focus {
        border-color: #3b82f6;
      }
      .qa-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }
      .qa-hover-tooltip {
        position: fixed;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 8px 12px;
        color: white;
        font-size: 11px;
        z-index: 2147483647;
        box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        pointer-events: none;
        display: none;
      }
      .qa-circle-trigger {
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: white;
        font-weight: bold;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 10px 25px rgba(139, 92, 246, 0.4);
        z-index: 2147483647;
        border: 1px solid rgba(255,255,255,0.25);
        transition: transform 0.2s ease;
      }
      .qa-circle-trigger:hover {
        transform: scale(1.08);
      }
      
      @keyframes pulse {
        0% { transform: scale(0.9); opacity: 0.8; }
        50% { transform: scale(1.2); opacity: 1; }
        100% { transform: scale(0.9); opacity: 0.8; }
      }
    \`;
    shadow.appendChild(style);

    // Inspector Tooltip
    const tooltip = document.createElement("div");
    tooltip.id = "qa-hover-tooltip";
    tooltip.className = "qa-hover-tooltip";
    shadow.appendChild(tooltip);

    // Collapsed Trigger Button
    const trigger = document.createElement("div");
    trigger.id = "qa-toolbar-collapsed-trigger";
    trigger.className = "qa-circle-trigger";
    trigger.style.display = "none";
    trigger.innerHTML = "<span>QA</span>";
    shadow.appendChild(trigger);

    // Main Panel
    const toolbar = document.createElement("div");
    toolbar.id = "qa-toolbar-container";
    toolbar.className = "qa-glass-panel";
    toolbar.innerHTML = \`
      <div class="qa-header" id="qa-header-drag">
        <div class="qa-title-area">
          <div class="qa-title-row">
            <span class="qa-dot" id="qa-dot-indicator"></span>
            <span class="qa-logo">QA Recorder</span>
            <span class="qa-badge-state qa-badge-recording" id="qa-status-badge">RECORDING</span>
          </div>
        </div>
        <button class="qa-link" id="qa-btn-collapse" style="font-size:16px; text-decoration:none;">➖</button>
      </div>      <div class="qa-body" id="qa-body-content">
        <div class="qa-case-info" id="qa-case-title">Loading case...</div>
        
        <div class="qa-actions-grid">
          <button class="qa-btn" id="qa-btn-pause">⏸️ Pause</button>
          <button class="qa-btn" id="qa-btn-new-case">➕ New Case</button>
          <button class="qa-btn" id="qa-btn-save-case">💾 Save Case</button>
          <button class="qa-btn" id="qa-btn-view-steps">📋 Steps (<span id="qa-step-count">1</span>)</button>
        </div>

        <div class="qa-divider"></div>

        <div class="qa-actions-grid" style="grid-template-columns: 1fr 1fr;">
          <button class="qa-btn qa-btn-active" id="qa-btn-toggle-grouping">🔗 Grouping: ON</button>
          <div style="font-size: 11px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-style: italic;" id="qa-grouping-status">Ready</div>
        </div>

        <div class="qa-divider"></div>

        <div class="qa-actions-grid">
          <button class="qa-btn" id="qa-btn-pick">🔍 Pick Element</button>
          <button class="qa-btn" id="qa-btn-verify">✔️ Verify El</button>
          <button class="qa-btn" id="qa-btn-screenshot">📸 Screenshot</button>
          <button class="qa-btn" id="qa-btn-bug">🐛 Create Bug</button>
        </div>

        <div class="qa-divider"></div>

        <div class="qa-actions-grid" style="grid-template-columns: 1fr;">
          <button class="qa-btn qa-btn-finish" id="qa-btn-finish">🏁 Finish Session</button>
        </div>

        <div id="qa-errors-warning" class="qa-warning-panel" style="display:none;">
          <span>⚠️ <span id="qa-errors-count">0</span> console/API errors</span>
          <button class="qa-link" id="qa-btn-warning-bug">Create Bug</button>
        </div>
      </div>
    \`;
    shadow.appendChild(toolbar);

    // Drag support
    const headerDrag = shadow.getElementById("qa-header-drag");
    headerDrag.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = toolbar.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      toolbar.style.left = (initialX + dx) + "px";
      toolbar.style.top = (initialY + dy) + "px";
      toolbar.style.bottom = "auto";
      toolbar.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });

    // Collapse handlers
    const btnCollapse = shadow.getElementById("qa-btn-collapse");
    btnCollapse.addEventListener("click", () => {
      toolbar.style.display = "none";
      trigger.style.display = "flex";
    });

    trigger.addEventListener("click", () => {
      trigger.style.display = "none";
      toolbar.style.display = "block";
    });

    // Pause / Resume handler
    const btnPause = shadow.getElementById("qa-btn-pause");
    btnPause.addEventListener("click", async () => {
      if (window.__qa_mode === "paused") {
        const res = await window.qaRecordAction({ actionType: "resume_recording" });
        if (res && res.success) {
          window.__qa_mode = "recording";
          btnPause.textContent = "⏸️ Pause";
          shadow.getElementById("qa-dot-indicator").className = "qa-dot";
        }
      } else {
        const res = await window.qaRecordAction({ actionType: "pause_recording" });
        if (res && res.success) {
          window.__qa_mode = "paused";
          btnPause.textContent = "▶️ Resume";
          shadow.getElementById("qa-dot-indicator").className = "qa-dot-paused";
        }
      }
      syncSessionStatus();
    });

    // Finish session handler
    shadow.getElementById("qa-btn-finish").addEventListener("click", () => {
      openFinishSessionModal();
    });

    // New case modal trigger
    shadow.getElementById("qa-btn-new-case").addEventListener("click", () => {
      openNewCaseModal();
    });

    // Save case handler
    shadow.getElementById("qa-btn-save-case").addEventListener("click", async () => {
      if (confirm("Do you want to save the current recorded test case?")) {
        const res = await window.qaRecordAction({ actionType: "save_current_case" });
        if (res && res.success) {
          alert("Test case saved successfully! You can continue recording a new case.");
          openNewCaseModal();
        }
      }
    });

    // Toggle grouping mode
    const btnToggleGrouping = shadow.getElementById("qa-btn-toggle-grouping");
    btnToggleGrouping.addEventListener("click", () => {
      window.__qa_dropdown_grouping = !window.__qa_dropdown_grouping;
      if (window.__qa_dropdown_grouping) {
        btnToggleGrouping.textContent = "🔗 Grouping: ON";
        btnToggleGrouping.classList.add("qa-btn-active");
      } else {
        btnToggleGrouping.textContent = "🔗 Grouping: OFF";
        btnToggleGrouping.classList.remove("qa-btn-active");
        commitActiveDropdown();
      }
    });

    // Pick element mode
    const btnPick = shadow.getElementById("qa-btn-pick");
    btnPick.addEventListener("click", () => {
      if (window.__qa_mode === "picker") {
        window.__qa_mode = "recording";
        btnPick.classList.remove("qa-btn-active");
      } else {
        window.__qa_mode = "picker";
        btnPick.classList.add("qa-btn-active");
        shadow.getElementById("qa-btn-verify").classList.remove("qa-btn-active");
      }
      syncSessionStatus();
    });

    // Verify element mode
    const btnVerify = shadow.getElementById("qa-btn-verify");
    btnVerify.addEventListener("click", () => {
      if (window.__qa_mode === "verify") {
        window.__qa_mode = "recording";
        btnVerify.classList.remove("qa-btn-active");
      } else {
        window.__qa_mode = "verify";
        btnVerify.classList.add("qa-btn-active");
        shadow.getElementById("qa-btn-pick").classList.remove("qa-btn-active");
      }
      syncSessionStatus();
    });

    // Screenshot capture
    shadow.getElementById("qa-btn-screenshot").addEventListener("click", async () => {
      const full = confirm("Capture full scrollable page? (OK = Full Page, Cancel = Viewport)");
      const res = await window.qaRecordAction({ actionType: "take_screenshot", fullPage: full });
      if (res && res.success && res.screenshotPath) {
        alert("Screenshot captured and saved! Path: " + res.screenshotPath);
      }
    });

    // Bug modal trigger
    shadow.getElementById("qa-btn-bug").addEventListener("click", () => {
      openBugModal();
    });
    shadow.getElementById("qa-btn-warning-bug").addEventListener("click", () => {
      openBugModal();
    });

    // Steps list trigger
    shadow.getElementById("qa-btn-view-steps").addEventListener("click", () => {
      openStepsModal();
    });

    // Initial load
    syncSessionStatus();
    setInterval(syncSessionStatus, 2000);
  }

  // Dialog / Modals Builders inside Shadow DOM
  function openFinishSessionModal() {
    const host = document.getElementById("__qa_recorder_host");
    const shadow = host.shadowRoot;
    
    if (shadow.getElementById("qa-finish-overlay")) return;

    window.__finishSessionModalOpen = true;
    window.__finishSessionLocked = true;

    const overlay = document.createElement("div");
    overlay.id = "qa-finish-overlay";
    overlay.className = "qa-modal-overlay";
    
    function renderMainView(savedCount, draftCount, draftStepCount) {
      overlay.innerHTML = `
        <div class="qa-dialog" style="width: 400px;">
          <div class="qa-dialog-title">🏁 Finish Recording Session</div>
          <div style="font-size: 13px; color: #cbd5e1; margin-bottom: 15px; line-height: 1.5;">
            <p>Are you sure you want to finish the entire recording session? This will close the browser.</p>
            <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px; margin-top: 10px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 6px;">
              <div>📁 Saved test cases: <strong style="color: #34d399;">\${savedCount}</strong></div>
              <div>📝 Unsaved drafts: <strong style="color: #f59e0b;">\${draftCount}</strong> (with <strong>\${draftStepCount}</strong> steps)</div>
            </div>
            <div id="qa-finish-error" style="color: #f87171; font-weight: bold; margin-top: 10px; font-size: 12px; display: none;"></div>
          </div>
          <div class="qa-dialog-actions" style="display: flex; flex-direction: column; gap: 8px;">
            <button class="qa-btn qa-btn-finish" id="qa-btn-finish-save" style="width:100%; margin-left:0;">💾 Save Current Case & Finish</button>
            \${draftStepCount > 0 ? `
              <button class="qa-btn" id="qa-btn-finish-discard" style="width:100%; margin-left:0; background: #ef4444; border-color: #ef4444; color: white;">🗑️ Finish Without Saving Drafts</button>
            ` : `
              <button class="qa-btn" id="qa-btn-finish-discard" style="width:100%; margin-left:0;">🗑️ Finish Session (No Draft)</button>
            `}
            <button class="qa-btn qa-btn-cancel" id="qa-btn-finish-cancel" style="width:100%; margin-left:0;">Cancel</button>
          </div>
        </div>
      `;

      shadow.getElementById("qa-btn-finish-cancel").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__finishSessionModalOpen = false;
        window.__finishSessionLocked = false;
        overlay.remove();
      });

      shadow.getElementById("qa-btn-finish-save").addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btnSave = shadow.getElementById("qa-btn-finish-save");
        btnSave.disabled = true;
        btnSave.textContent = "Finishing session...";
        window.__isFinishingSession = true;
        const errDiv = shadow.getElementById("qa-finish-error");
        errDiv.style.display = "none";

        const res = await window.qaRecordAction({ 
          actionType: "finish_recording", 
          saveDraft: true,
          confirmed: true
        });
        if (res && res.success) {
          // Playwright will terminate context; keep modal open & locked
        } else {
          window.__isFinishingSession = false;
          btnSave.disabled = false;
          btnSave.textContent = "💾 Save Current Case & Finish";
          errDiv.textContent = (res && res.error) || "Error saving case and finishing.";
          errDiv.style.display = "block";
        }
      });

      shadow.getElementById("qa-btn-finish-discard").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (draftStepCount > 0) {
          renderDiscardConfirmView(savedCount, draftCount, draftStepCount);
        } else {
          executeDiscardFinish();
        }
      });
    }

    function renderDiscardConfirmView(savedCount, draftCount, draftStepCount) {
      overlay.innerHTML = `
        <div class="qa-dialog" style="width: 400px;">
          <div class="qa-dialog-title" style="color: #ef4444;">⚠️ Discard Unsaved Steps?</div>
          <div style="font-size: 13px; color: #cbd5e1; margin-bottom: 20px; line-height: 1.5;">
            Unsaved recorded steps will be permanently discarded. Are you sure you want to finish without saving?
          </div>
          <div id="qa-discard-error" style="color: #f87171; font-weight: bold; margin-top: 10px; font-size: 12px; display: none;"></div>
          <div class="qa-dialog-actions" style="display: flex; flex-direction: column; gap: 8px;">
            <button class="qa-btn" id="qa-btn-discard-confirm" style="width:100%; margin-left:0; background: #ef4444; color: white; border-color: #ef4444;">Discard & Finish</button>
            <button class="qa-btn" id="qa-btn-discard-cancel" style="width:100%; margin-left:0;">Cancel</button>
          </div>
        </div>
      `;

      shadow.getElementById("qa-btn-discard-cancel").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        renderMainView(savedCount, draftCount, draftStepCount);
      });

      shadow.getElementById("qa-btn-discard-confirm").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        executeDiscardFinish();
      });
    }

    async function executeDiscardFinish() {
      const btnConfirm = shadow.getElementById("qa-btn-discard-confirm") || shadow.getElementById("qa-btn-finish-discard");
      if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.textContent = "Finishing session...";
      }
      window.__isFinishingSession = true;
      const errDiv = shadow.getElementById("qa-discard-error") || shadow.getElementById("qa-finish-error");
      if (errDiv) errDiv.style.display = "none";

      const res = await window.qaRecordAction({ 
        actionType: "finish_recording", 
        saveDraft: false,
        confirmed: true
      });
      if (res && res.success) {
        // Playwright will terminate context; keep modal open & locked
      } else {
        window.__isFinishingSession = false;
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.textContent = "Discard & Finish";
        }
        if (errDiv) {
          errDiv.textContent = (res && res.error) || "Error finishing session.";
          errDiv.style.display = "block";
        }
      }
    }

    // Initial fetch of stats
    overlay.innerHTML = `
      <div class="qa-dialog" style="width: 400px; text-align: center; padding: 30px 20px;">
        <div class="qa-dialog-title" style="margin-bottom:10px;">Loading Session Stats...</div>
        <div style="font-size: 12px; color: #94a3b8;">Please wait while we retrieve the latest counts.</div>
      </div>
    `;
    shadow.appendChild(overlay);

    window.qaRecordAction({ actionType: "get_stats" }).then(res => {
      if (res && res.success) {
        renderMainView(res.savedCount, res.draftCount, res.draftStepCount);
      } else {
        renderMainView(0, 0, 0);
      }
    }).catch(err => {
      console.error("Error fetching stats:", err);
      renderMainView(0, 0, 0);
    });
  }

  // Dialog / Modals Builders inside Shadow DOM
  function openNewCaseModal() {
    const host = document.getElementById("__qa_recorder_host");
    const shadow = host.shadowRoot;
    
    // Check if exists
    if (shadow.getElementById("qa-newcase-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "qa-newcase-overlay";
    overlay.className = "qa-modal-overlay";
    overlay.innerHTML = \`
      <div class="qa-dialog">
        <div class="qa-dialog-title">➕ Start New Test Case</div>
        <div class="qa-form-group">
          <label>Test Case Title *</label>
          <input type="text" id="qa-input-new-title" class="qa-input" placeholder="e.g. Verify Profile settings change" />
        </div>
        <div class="qa-form-group">
          <label>Priority</label>
          <select id="qa-select-new-priority" class="qa-select">
            <option value="Low">Low</option>
            <option value="Medium" selected>Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
        <div class="qa-form-group">
          <label>Preconditions</label>
          <input type="text" id="qa-input-new-preconditions" class="qa-input" placeholder="e.g. User logged in as admin" />
        </div>
        <div class="qa-dialog-actions">
          <button class="qa-btn qa-btn-cancel" id="qa-btn-newcase-close">Cancel</button>
          <button class="qa-btn qa-btn-finish" id="qa-btn-newcase-submit">Start Recording</button>
        </div>
      </div>
    \`;
    shadow.appendChild(overlay);

    shadow.getElementById("qa-btn-newcase-close").addEventListener("click", () => {
      overlay.remove();
    });

    shadow.getElementById("qa-btn-newcase-submit").addEventListener("click", async () => {
      const title = shadow.getElementById("qa-input-new-title").value;
      const priority = shadow.getElementById("qa-select-new-priority").value;
      const preconditions = shadow.getElementById("qa-input-new-preconditions").value;

      if (!title.trim()) {
        alert("Title is required!");
        return;
      }

      const res = await window.qaRecordAction({
        actionType: "new_test_case",
        title,
        priority,
        preconditions,
        module: "General"
      });

      if (res && res.success) {
        overlay.remove();
        syncSessionStatus();
      } else {
        alert("Error starting new test case.");
      }
    });
  }

  function openBugModal() {
    const host = document.getElementById("__qa_recorder_host");
    const shadow = host.shadowRoot;
    if (shadow.getElementById("qa-bug-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "qa-bug-overlay";
    overlay.className = "qa-modal-overlay";
    overlay.innerHTML = \`
      <div class="qa-dialog">
        <div class="qa-dialog-title">🐛 Report Bug from Session</div>
        <div class="qa-form-group">
          <label>Bug Title *</label>
          <input type="text" id="qa-input-bug-title" class="qa-input" placeholder="e.g. Login button doesn't respond on click" />
        </div>
        <div class="qa-form-group">
          <label>Severity</label>
          <select id="qa-select-bug-severity" class="qa-select">
            <option value="Low">Low</option>
            <option value="Medium" selected>Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
        <div class="qa-form-group">
          <label>Priority</label>
          <select id="qa-select-bug-priority" class="qa-select">
            <option value="Low">Low</option>
            <option value="Medium" selected>Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
        <div class="qa-form-group">
          <label>Actual Result / Symptom *</label>
          <textarea id="qa-input-bug-actual" class="qa-textarea" rows="3" placeholder="Explain what actually occurred..."></textarea>
        </div>
        <div class="qa-form-group">
          <label>Developer Notes</label>
          <input type="text" id="qa-input-bug-notes" class="qa-input" placeholder="e.g. Failed with 500 server error in console" />
        </div>
        <div class="qa-dialog-actions">
          <button class="qa-btn qa-btn-cancel" id="qa-btn-bug-close">Cancel</button>
          <button class="qa-btn qa-btn-finish" id="qa-btn-bug-submit">Submit Bug</button>
        </div>
      </div>
    \`;
    shadow.appendChild(overlay);

    shadow.getElementById("qa-btn-bug-close").addEventListener("click", () => {
      overlay.remove();
    });

    shadow.getElementById("qa-btn-bug-submit").addEventListener("click", async () => {
      const title = shadow.getElementById("qa-input-bug-title").value;
      const severity = shadow.getElementById("qa-select-bug-severity").value;
      const priority = shadow.getElementById("qa-select-bug-priority").value;
      const actualResult = shadow.getElementById("qa-input-bug-actual").value;
      const notes = shadow.getElementById("qa-input-bug-notes").value;

      if (!title.trim() || !actualResult.trim()) {
        alert("Title and Actual Result are required fields!");
        return;
      }

      const res = await window.qaRecordAction({
        actionType: "create_bug",
        title,
        severity,
        priority,
        actualResult,
        notes
      });
      if (res && res.success) {
        alert("Bug successfully created! ID: " + res.bug.bugKey);
        overlay.remove();
      } else {
        alert("Failed to report bug.");
      }
    });
  }

  async function openStepsModal() {
    const host = document.getElementById("__qa_recorder_host");
    const shadow = host.shadowRoot;
    if (shadow.getElementById("qa-steps-overlay")) return;

    const res = await window.qaRecordAction({ actionType: "get_recorded_steps" });
    if (!res || !res.success) return;

    const overlay = document.createElement("div");
    overlay.id = "qa-steps-overlay";
    overlay.className = "qa-modal-overlay";
    
    let activeTab = "grouped"; // "grouped" or "raw"

    function getStepsHTML(steps, tab) {
      let filtered = steps;
      if (tab === "grouped") {
        filtered = steps.filter(s => s.includeInFinalTestCase !== false);
      }
      if (filtered.length === 0) {
        return "<div style='text-align:center; padding: 12px; color:#94a3b8;'>No steps found.</div>";
      }
      let html = "";
      filtered.forEach(s => {
        const isIgnored = s.includeInFinalTestCase === false;
        
        const rowStyle = isIgnored 
          ? 'padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center; opacity:0.5; background:rgba(255,255,255,0.02);'
          : 'padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;';

        const compBadge = s.componentType ? '<span style="font-size:9px; background:rgba(59,130,246,0.2); color:#60a5fa; padding:2px 5px; border-radius:4px; margin-left:6px; font-weight:bold;">' + s.componentType + '</span>' : "";
        const grpBadge = s.groupId || isIgnored ? '<span style="font-size:9px; background:rgba(16,185,129,0.2); color:#34d399; padding:2px 5px; border-radius:4px; margin-left:6px; font-weight:bold;">' + (isIgnored ? "ignored" : "grouped") + '</span>' : "";

        let actionButtons = "";
        if (isIgnored) {
          actionButtons = 
            '<button class="qa-step-restore-btn" data-id="' + s.id + '" style="font-size:9px; padding:2px 6px; cursor:pointer; background:#10b981; border:none; border-radius:4px; color:white; font-weight:bold; margin-right:4px;">Restore</button>' +
            '<button class="qa-step-delete-btn" data-id="' + s.id + '" style="font-size:9px; padding:2px 6px; cursor:pointer; background:#ef4444; border:none; border-radius:4px; color:white; font-weight:bold;">Delete</button>';
        } else {
          actionButtons = 
            '<button class="qa-step-ignore-btn" data-id="' + s.id + '" style="font-size:9px; padding:2px 6px; cursor:pointer; background:#f59e0b; border:none; border-radius:4px; color:white; font-weight:bold; margin-right:4px;">Ignore</button>' +
            '<button class="qa-step-delete-btn" data-id="' + s.id + '" style="font-size:9px; padding:2px 6px; cursor:pointer; background:#ef4444; border:none; border-radius:4px; color:white; font-weight:bold;">Delete</button>';
        }

        const detailsHtml = isIgnored 
          ? "" 
          : '<div style="font-size:12px; color:#cbd5e1; margin-top:2px;">' + s.actionDescription + '</div>' +
            (s.inputValue ? '<div style="font-size:10px; color:#94a3b8; margin-top:2px; font-family:monospace;">Value: ' + s.inputValue + '</div>' : "");

        html += '<div style="' + rowStyle + '">' +
            '<div style="flex-1; min-width: 0;">' +
              '<div style="font-weight:bold; font-size:11px; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">' +
                'Step ' + s.stepNumber + ': ' + s.actionType.toUpperCase() +
                compBadge +
                grpBadge +
              '</div>' +
              detailsHtml +
            '</div>' +
            '<div style="display:flex; align-items:center; shrink-0; margin-left:10px;">' +
              actionButtons +
            '</div>' +
          '</div>';
      });
      return html;
    }

    overlay.innerHTML = '<div class="qa-dialog" style="width: 480px;">' +
        '<div class="qa-dialog-title">📋 Recorded Steps List</div>' +
        '<div style="display:flex; gap:8px; margin-bottom:10px;">' +
          '<button class="qa-btn qa-btn-active" id="qa-tab-grouped" style="flex:1;">Grouped Steps</button>' +
          '<button class="qa-btn" id="qa-tab-raw" style="flex:1;">Raw Events (All)</button>' +
        '</div>' +
        '<div id="qa-steps-list-container" style="max-height: 250px; overflow-y: auto; background:rgba(0,0,0,0.2); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">' +
          getStepsHTML(res.steps, activeTab) +
        '</div>' +
        '<div class="qa-dialog-actions">' +
          '<button class="qa-btn" id="qa-btn-steps-close">Close</button>' +
        '</div>' +
      '</div>';
    shadow.appendChild(overlay);

    const container = shadow.getElementById("qa-steps-list-container");
    const tabGrouped = shadow.getElementById("qa-tab-grouped");
    const tabRaw = shadow.getElementById("qa-tab-raw");

    let currentStepsList = res.steps;

    function attachStepListeners() {
      const ignoreBtns = shadow.querySelectorAll(".qa-step-ignore-btn");
      ignoreBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
          const stepId = btn.getAttribute("data-id");
          const btnTxt = btn.textContent;
          btn.disabled = true;
          btn.textContent = "...";
          const res = await window.qaRecordAction({ actionType: "ignore_step", stepId });
          if (res && res.success) {
            refreshSteps();
          } else {
            btn.disabled = false;
            btn.textContent = btnTxt;
            alert("Failed to ignore step");
          }
        });
      });

      const restoreBtns = shadow.querySelectorAll(".qa-step-restore-btn");
      restoreBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
          const stepId = btn.getAttribute("data-id");
          const btnTxt = btn.textContent;
          btn.disabled = true;
          btn.textContent = "...";
          const res = await window.qaRecordAction({ actionType: "restore_step", stepId });
          if (res && res.success) {
            refreshSteps();
          } else {
            btn.disabled = false;
            btn.textContent = btnTxt;
            alert("Failed to restore step");
          }
        });
      });

      const deleteBtns = shadow.querySelectorAll(".qa-step-delete-btn");
      deleteBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
          if (confirm("Are you sure you want to delete this recorded step? This will shift subsequent steps.")) {
            const stepId = btn.getAttribute("data-id");
            const btnTxt = btn.textContent;
            btn.disabled = true;
            btn.textContent = "...";
            const res = await window.qaRecordAction({ actionType: "delete_step", stepId });
            if (res && res.success) {
              refreshSteps();
            } else {
              btn.disabled = false;
              btn.textContent = btnTxt;
              alert("Failed to delete step");
            }
          }
        });
      });
    }

    async function refreshSteps() {
      const res = await window.qaRecordAction({ actionType: "get_recorded_steps" });
      if (res && res.success) {
        currentStepsList = res.steps;
        container.innerHTML = getStepsHTML(currentStepsList, activeTab);
        attachStepListeners();
      }
    }

    attachStepListeners();

    tabGrouped.addEventListener("click", () => {
      activeTab = "grouped";
      tabGrouped.classList.add("qa-btn-active");
      tabRaw.classList.remove("qa-btn-active");
      container.innerHTML = getStepsHTML(currentStepsList, activeTab);
      attachStepListeners();
    });

    tabRaw.addEventListener("click", () => {
      activeTab = "raw";
      tabRaw.classList.add("qa-btn-active");
      tabGrouped.classList.remove("qa-btn-active");
      container.innerHTML = getStepsHTML(currentStepsList, activeTab);
      attachStepListeners();
    });

    shadow.getElementById("qa-btn-steps-close").addEventListener("click", () => {
      overlay.remove();
    });
  }

  function openLocatorModal(element, locatorData) {
    const host = document.getElementById("__qa_recorder_host");
    const shadow = host.shadowRoot;
    if (shadow.getElementById("qa-locator-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "qa-locator-overlay";
    overlay.className = "qa-modal-overlay";
    overlay.innerHTML = \`
      <div class="qa-dialog" style="width: 450px;">
        <div class="qa-dialog-title">🔍 Capture Element Locator</div>
        <div class="qa-form-group">
          <label>Element Tag</label>
          <div class="qa-case-info">\${locatorData.tagName}</div>
        </div>
        <div class="qa-form-group">
          <label>Recommended Locator</label>
          <div class="qa-case-info" style="font-family:monospace; color:#38bdf8;">\${locatorData.recommendedSelector}</div>
        </div>
        <div class="qa-form-group">
          <label>Locator Value (Type: \${locatorData.targetType})</label>
          <input type="text" id="qa-input-locator-val" class="qa-input" value="\${locatorData.targetValue}" />
        </div>
        <div class="qa-form-group">
          <label>Friendly Name / Locator Alias *</label>
          <input type="text" id="qa-input-locator-friendly" class="qa-input" value="\${getElementFriendlyName(element)}" />
        </div>
        <div class="qa-dialog-actions">
          <button class="qa-btn qa-btn-cancel" id="qa-btn-locator-close">Close</button>
          <button class="qa-btn qa-btn-finish" id="qa-btn-locator-save">Save as Reusable Locator</button>
        </div>
      </div>
    \`;
    shadow.appendChild(overlay);

    shadow.getElementById("qa-btn-locator-close").addEventListener("click", () => {
      overlay.remove();
      window.__qa_mode = "recording";
      syncSessionStatus();
    });

    shadow.getElementById("qa-btn-locator-save").addEventListener("click", async () => {
      const friendlyName = shadow.getElementById("qa-input-locator-friendly").value;
      const locatorValue = shadow.getElementById("qa-input-locator-val").value;

      if (!friendlyName.trim()) {
        alert("Friendly name is required!");
        return;
      }

      const res = await window.qaRecordAction({
        actionType: "add_note",
        note: \`[SAVED LOCATOR] "\${friendlyName}" -> selector: \${locatorValue} (tag: \${locatorData.tagName})\`
      });

      if (res && res.success) {
        alert("Saved to session logs! Reusable locator link registered.");
        overlay.remove();
        window.__qa_mode = "recording";
        syncSessionStatus();
      }
    });
  }

  function openAssertionModal(element, locatorData) {
    const host = document.getElementById("__qa_recorder_host");
    const shadow = host.shadowRoot;
    if (shadow.getElementById("qa-assert-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "qa-assert-overlay";
    overlay.className = "qa-modal-overlay";
    overlay.innerHTML = \`
      <div class="qa-dialog">
        <div class="qa-dialog-title">✔️ Create Verification Step</div>
        <div class="qa-form-group">
          <label>Target Element</label>
          <div class="qa-case-info">\${getElementFriendlyName(element)}</div>
        </div>
        <div class="qa-form-group">
          <label>Assertion Rule</label>
          <select id="qa-select-assert-rule" class="qa-select">
            <option value="assert_visible">Element should be visible</option>
            <option value="assert_hidden">Element should not be visible</option>
            <option value="assert_text">Text contents should match</option>
            <option value="wait_for_text">Toast message should appear</option>
          </select>
        </div>
        <div class="qa-form-group" id="qa-group-assert-val">
          <label>Expected Value / Expected Text</label>
          <input type="text" id="qa-input-assert-expected" class="qa-input" value="\${element.textContent?.trim().substring(0,60) || ''}" />
        </div>
        <div class="qa-dialog-actions">
          <button class="qa-btn qa-btn-cancel" id="qa-btn-assert-close">Cancel</button>
          <button class="qa-btn qa-btn-finish" id="qa-btn-assert-save">Create Assertion</button>
        </div>
      </div>
    \`;
    shadow.appendChild(overlay);

    const ruleSelect = shadow.getElementById("qa-select-assert-rule");
    ruleSelect.addEventListener("change", () => {
      const showVal = ruleSelect.value === "assert_text" || ruleSelect.value === "wait_for_text";
      shadow.getElementById("qa-group-assert-val").style.display = showVal ? "flex" : "none";
    });

    shadow.getElementById("qa-btn-assert-close").addEventListener("click", () => {
      overlay.remove();
      window.__qa_mode = "recording";
      syncSessionStatus();
    });

    shadow.getElementById("qa-btn-assert-save").addEventListener("click", async () => {
      const rule = ruleSelect.value;
      const expectedText = shadow.getElementById("qa-input-assert-expected").value;
      const friendlyName = getElementFriendlyName(element);

      let actionDescription = \`Assert that element "\${friendlyName}" is visible\`;
      if (rule === "assert_hidden") {
        actionDescription = \`Assert that element "\${friendlyName}" is not visible\`;
      } else if (rule === "assert_text") {
        actionDescription = \`Assert that element "\${friendlyName}" contains text "\${expectedText}"\`;
      } else if (rule === "wait_for_text") {
        actionDescription = \`Wait for message "\${expectedText}" to appear on page\`;
      }

      const res = await window.qaRecordAction({
        actionType: rule,
        actionDescription,
        pageUrl: window.location.href,
        assertionType: rule,
        assertionValue: expectedText || null,
        inputValue: expectedText || null,
        ...locatorData
      });

      if (res && res.success) {
        overlay.remove();
        window.__qa_mode = "recording";
        syncSessionStatus();
      } else {
        alert("Failed to save assertion step.");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectToolbar);
  } else {
    injectToolbar();
  }

  // Queue processing logic to handle rapid page navigation/unloads
  let currentQueuePromise = null;

  function getContextInfo() {
    return "[" + window.location.hostname + " / " + (window.self === window.top ? "top" : "iframe") + "]";
  }

  function saveAction(actionData) {
    const ctx = getContextInfo();
    console.log("[BROWSER RECORDER]" + ctx + " saveAction called with action:", actionData.actionType);
    try {
      const queueString = sessionStorage.getItem("__qa_record_queue") || "[]";
      const queue = JSON.parse(queueString);
      queue.push(actionData);
      sessionStorage.setItem("__qa_record_queue", JSON.stringify(queue));
      processQueue();
    } catch (e) {
      window.qaRecordAction(actionData).catch(console.error);
    }
  }

  function processQueue() {
    const ctx = getContextInfo();
    if (currentQueuePromise) return currentQueuePromise;

    const promise = (async () => {
      try {
        while (true) {
          const queueString = sessionStorage.getItem("__qa_record_queue") || "[]";
          const queue = JSON.parse(queueString);
          if (queue.length === 0) break;
          const nextAction = queue[0];
          try {
            if (typeof window.qaRecordAction === "function") {
              await window.qaRecordAction(nextAction);
              const currentQueue = JSON.parse(sessionStorage.getItem("__qa_record_queue") || "[]");
              currentQueue.shift();
              sessionStorage.setItem("__qa_record_queue", JSON.stringify(currentQueue));
            } else {
              break;
            }
          } catch (err) {
            console.error("[BROWSER RECORDER]" + ctx + " error processing nextAction:", err);
            break;
          }
        }
      } catch (e) {
        console.error(ctx + " Error processing queue:", e);
      }
    })();

    currentQueuePromise = promise;
    promise.finally(() => {
      if (currentQueuePromise === promise) {
        currentQueuePromise = null;
      }
    });

    return currentQueuePromise;
  }

  setTimeout(processQueue, 100);
  setInterval(processQueue, 500);

  // Keystroke / Input listener for searchable selects
  document.addEventListener("input", function(e) {
    const target = e.target;
    if (window.__qa_mode === "paused") return;
    if (window.__qa_active_dropdown && window.__qa_active_dropdown.triggerEl === target) {
      window.__qa_active_dropdown.textEntered = target.value;
      window.__qa_active_dropdown.rawEvents.push({ type: "type_search", value: target.value, time: Date.now() });

      const host = document.getElementById("__qa_recorder_host");
      if (host && host.shadowRoot) {
        const statusEl = host.shadowRoot.getElementById("qa-grouping-status");
        if (statusEl) {
          statusEl.textContent = "Typing select query...";
          statusEl.style.color = "#fbbf24";
        }
      }
    }
  }, true);

  // Click handler
  document.addEventListener("click", function(e) {
    const host = document.getElementById("__qa_recorder_host");
    if (host && e.composedPath && e.composedPath().includes(host)) {
      return;
    }

    if (e.__qa_replayed) return;
    if (window.__qa_mode === "paused") return;

    const target = e.target;
    e.preventDefault();
    e.stopPropagation();

    // Outline reset
    if (hoveredElement) {
      hoveredElement.style.outline = hoveredElement.__qa_old_outline || "";
      hoveredElement = null;
      hideElementInspectorTooltip();
    }

    const locatorData = generateLocatorsForElement(target);

    if (window.__qa_mode === "picker") {
      openLocatorModal(target, locatorData);
      return;
    }

    if (window.__qa_mode === "verify") {
      openAssertionModal(target, locatorData);
      return;
    }

    // Default Recording Action
    const tagName = target.tagName.toLowerCase();
    const detectedType = detectComponentType(target);
    const friendlyName = getElementFriendlyName(target);

    // Grouping State Machine Check
    if (window.__qa_dropdown_grouping) {
      const isOpt = isDropdownOption(target);
      
      if (isOpt) {
        if (window.__qa_active_dropdown) {
          // Commit the group!
          const optionText = target.textContent?.trim() || "";
          const optionValue = target.getAttribute("value") || target.getAttribute("data-value") || optionText;
          const triggerFriendlyName = getElementFriendlyName(window.__qa_active_dropdown.triggerEl);
          
          let actionType = "select_custom";
          if (window.__qa_active_dropdown.componentType === "searchable_select" || window.__qa_active_dropdown.textEntered) {
            actionType = "select_searchable";
          } else if (window.__qa_active_dropdown.componentType === "multi_select") {
            actionType = "multi_select";
          }

          const actionData = {
            actionType: actionType,
            actionDescription: actionType === "select_searchable"
              ? 'Search and select "' + optionText + '" from dropdown "' + triggerFriendlyName + '"'
              : 'Select "' + optionText + '" from custom dropdown "' + triggerFriendlyName + '"',
            pageUrl: window.location.href,
            componentType: window.__qa_active_dropdown.componentType,
            selectedOptionText: optionText,
            selectedOptionValue: optionValue,
            actionMetadata: {
              triggerSelector: window.__qa_active_dropdown.triggerLocator.recommendedSelector || window.__qa_active_dropdown.triggerLocator.cssSelector,
              optionSelector: locatorData.recommendedSelector || locatorData.cssSelector,
              searchPhrase: window.__qa_active_dropdown.textEntered || ""
            },
            rawEvents: [
              ...window.__qa_active_dropdown.rawEvents,
              { type: "click_option", time: Date.now(), locator: locatorData }
            ],
            ...window.__qa_active_dropdown.triggerLocator
          };

          saveAction(actionData);
          window.__qa_active_dropdown = null;

          const host = document.getElementById("__qa_recorder_host");
          if (host && host.shadowRoot) {
            const statusEl = host.shadowRoot.getElementById("qa-grouping-status");
            if (statusEl) {
              statusEl.textContent = "Ready";
              statusEl.style.color = "#94a3b8";
            }
          }

          replayClick(target, e);
          syncSessionStatus();
          return;
        }
      } else {
        // Not an option click.
        // If it's a trigger element click (custom_select, searchable_select, multi_select):
        if (detectedType === "custom_select" || detectedType === "searchable_select" || detectedType === "multi_select") {
          // If we had a previous uncommitted dropdown, commit it first!
          if (window.__qa_active_dropdown && window.__qa_active_dropdown.triggerEl !== target) {
            commitActiveDropdown();
          }
          
          window.__qa_active_dropdown = {
            triggerEl: target,
            componentType: detectedType,
            triggerLocator: locatorData,
            textEntered: "",
            rawEvents: [{ type: "click_trigger", time: Date.now(), locator: locatorData }]
          };

          const host = document.getElementById("__qa_recorder_host");
          if (host && host.shadowRoot) {
            const statusEl = host.shadowRoot.getElementById("qa-grouping-status");
            if (statusEl) {
              statusEl.textContent = "Recording dropdown...";
              statusEl.style.color = "#fbbf24";
            }
          }

          // Defer sending step, just replay the click in the DOM to open dropdown
          replayClick(target, e);
          syncSessionStatus();
          return;
        } else if (window.__qa_active_dropdown) {
          // We click a nested input in custom select
          if (tagName === "input" && window.__qa_active_dropdown.componentType === "custom_select") {
            window.__qa_active_dropdown.triggerEl = target;
            window.__qa_active_dropdown.componentType = "searchable_select";
            window.__qa_active_dropdown.rawEvents.push({ type: "focus_input", locator: locatorData, time: Date.now() });
            replayClick(target, e);
            return;
          }

          // Clicking something else commits the active dropdown first
          commitActiveDropdown();
        }
      }
    }

    // Ignore text inputs, textarea, select (handled in change/input) to not disrupt editing
    if (tagName === "input" && !["checkbox", "radio", "button", "submit", "image", "file"].includes(target.type)) {
      replayClick(target, e);
      return;
    }
    if (tagName === "textarea" || tagName === "select") {
      replayClick(target, e);
      return;
    }

    // Resolve component-specific actions
    let actionType = "click";
    let actionDescription = 'Click "' + friendlyName + '" ' + (tagName === "a" ? "link" : tagName === "button" ? "button" : "element");
    let actionMetadata = null;

    if (detectedType === "checkbox") {
      const checked = target.checked !== undefined ? !target.checked : target.getAttribute("aria-checked") !== "true";
      actionType = checked ? "check" : "uncheck";
      actionDescription = (checked ? "Check " : "Uncheck ") + '"' + friendlyName + '" checkbox';
    } else if (detectedType === "toggle") {
      const active = target.getAttribute("aria-checked") === "true" || target.classList.contains("active") || target.classList.contains("checked");
      actionType = active ? "toggle_off" : "toggle_on";
      actionDescription = (active ? "Toggle off " : "Toggle on ") + '"' + friendlyName + '"';
    } else if (detectedType === "radio") {
      actionType = "radio_select";
      actionDescription = 'Select "' + friendlyName + '" radio option';
    } else if (detectedType === "table") {
      const row = target.closest("tr");
      let rowContext = "";
      if (row) {
        const cells = Array.from(row.querySelectorAll("td, th"))
          .map(c => c.textContent?.trim() || "")
          .filter(t => t.length > 0 && t.length < 50 && !t.includes(target.textContent?.trim() || ""));
        if (cells.length > 0) {
          rowContext = " in row matching [" + cells.slice(0, 3).join(", ") + "]";
        }
      }
      actionType = "table_row_select";
      actionDescription = 'Click "' + friendlyName + '"' + rowContext;
    } else if (detectedType === "pagination") {
      const text = target.textContent?.toLowerCase() || "";
      const label = target.getAttribute("aria-label")?.toLowerCase() || "";
      if (text.includes("next") || label.includes("next") || text.includes(">") || label.includes(">")) {
        actionType = "pagination_next";
        actionDescription = "Navigate to next page";
      } else if (text.includes("prev") || label.includes("prev") || text.includes("<") || label.includes("<")) {
        actionType = "pagination_previous";
        actionDescription = "Navigate to previous page";
      }
    } else if (detectedType === "accordion") {
      const isExpanded = target.getAttribute("aria-expanded") === "true";
      actionType = isExpanded ? "accordion_collapse" : "accordion_expand";
      actionDescription = (isExpanded ? "Collapse " : "Expand ") + '"' + friendlyName + '" accordion';
    } else if (detectedType === "tab") {
      actionType = "tab_select";
      actionDescription = 'Select tab "' + friendlyName + '"';
    } else if (detectedType === "menu") {
      actionType = "menu_select";
      actionDescription = 'Select menu item "' + friendlyName + '"';
    } else if (detectedType === "modal") {
      const isClose = friendlyName.toLowerCase().includes("close") || friendlyName.toLowerCase().includes("cancel") || friendlyName === "X" || friendlyName === "×";
      actionType = isClose ? "modal_close" : "click";
      actionDescription = isClose ? "Close modal dialog" : 'Click "' + friendlyName + '" inside modal';
    }

    const actionData = {
      actionType: actionType,
      actionDescription: actionDescription,
      pageUrl: window.location.href,
      componentType: detectedType !== "unknown" ? detectedType : null,
      actionMetadata: actionMetadata,
      ...locatorData
    };

    try {
      const queue = JSON.parse(sessionStorage.getItem("__qa_record_queue") || "[]");
      queue.push(actionData);
      sessionStorage.setItem("__qa_record_queue", JSON.stringify(queue));
    } catch (err) {}

    const processPromise = processQueue();
    Promise.race([
      processPromise,
      new Promise(resolve => setTimeout(resolve, 2000))
    ]).finally(() => {
      replayClick(target, e);
      syncSessionStatus();
    });
  }, true);

  function replayClick(target, originalEvent) {
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: originalEvent.detail,
      screenX: originalEvent.screenX,
      screenY: originalEvent.screenY,
      clientX: originalEvent.clientX,
      clientY: originalEvent.clientY,
      ctrlKey: originalEvent.ctrlKey,
      altKey: originalEvent.altKey,
      shiftKey: originalEvent.shiftKey,
      metaKey: originalEvent.metaKey,
      button: originalEvent.button,
      buttons: originalEvent.buttons,
      relatedTarget: originalEvent.relatedTarget,
    });
    
    clickEvent.__qa_replayed = true;
    target.dispatchEvent(clickEvent);

    // Link fallback
    const link = target.closest("a");
    if (link && link.href && !clickEvent.defaultPrevented) {
      const linkTarget = link.getAttribute("target");
      if (linkTarget === "_blank") {
        window.open(link.href, "_blank");
      } else {
        window.location.href = link.href;
      }
      return;
    }

    // Submit fallback
    const button = target.closest("button, input");
    const isSubmit = button && (
      button.type === "submit" ||
      (button.tagName.toLowerCase() === "button" && !button.getAttribute("type"))
    );
    if (isSubmit && !clickEvent.defaultPrevented) {
      const form = button.closest("form");
      if (form) form.submit();
    }
  }

  // Change handler (typing, select, upload)
  document.addEventListener("change", function(e) {
    const host = document.getElementById("__qa_recorder_host");
    if (host && e.composedPath && e.composedPath().includes(host)) return;
    if (window.__qa_mode === "paused") return;

    const target = e.target;
    const tagName = target.tagName.toLowerCase();
    
    if (tagName === "input" || tagName === "textarea") {
      if (["checkbox", "radio", "button", "submit", "image"].includes(target.type)) {
        return;
      }
      
      const locatorData = generateLocatorsForElement(target);
      const friendlyName = getElementFriendlyName(target);
      
      let val = target.value;
      if (isPasswordInput(target)) {
        val = "***MASKED***";
      }

      const actionData = {
        actionType: target.type === "file" ? "upload_file" : "fill",
        actionDescription: target.type === "file" 
          ? 'Upload file "' + val.split("\\\\").pop() + '" to "' + friendlyName + '"'
          : 'Fill "' + friendlyName + '" with "' + val + '"',
        pageUrl: window.location.href,
        inputValue: val,
        ...locatorData
      };

      saveAction(actionData);
      syncSessionStatus();
    } else if (tagName === "select") {
      const locatorData = generateLocatorsForElement(target);
      const friendlyName = getElementFriendlyName(target);
      const selectedOption = target.options[target.selectedIndex];
      const optionText = selectedOption ? selectedOption.text.trim() : "";
      const optionValue = target.value;

      const actionData = {
        actionType: "select",
        actionDescription: 'Select "' + optionText + '" from dropdown "' + friendlyName + '"',
        pageUrl: window.location.href,
        inputValue: optionValue,
        ...locatorData
      };

      saveAction(actionData);
      syncSessionStatus();
    }
  }, true);

})();
`;
