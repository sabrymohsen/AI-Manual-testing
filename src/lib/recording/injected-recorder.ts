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

  // Shadow DOM Floating Toolbar & Assertions Setup
  window.__qa_assert_mode = null;
  let hoveredElement = null;

  function onMouseMove(e) {
    if (!window.__qa_assert_mode) return;
    
    // Ignore hover on the toolbar container itself
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
      target.style.outline = "2px dashed #3b82f6";
      target.style.outlineOffset = "2px";
    }
  }

  function onMouseOut(e) {
    if (hoveredElement) {
      hoveredElement.style.outline = hoveredElement.__qa_old_outline || "";
      hoveredElement = null;
    }
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseout", onMouseOut, true);

  function incrementStepCount() {
    try {
      let count = parseInt(sessionStorage.getItem("__qa_recorder_step_count") || "1", 10);
      count += 1;
      sessionStorage.setItem("__qa_recorder_step_count", count.toString());
      updateToolbarUI();
    } catch (e) {}
  }

  function updateToolbarUI() {
    try {
      const host = document.getElementById("__qa_recorder_host");
      if (!host || !host.shadowRoot) return;
      
      const countSpan = host.shadowRoot.getElementById("qa-step-count");
      if (countSpan) {
        const count = sessionStorage.getItem("__qa_recorder_step_count") || "1";
        countSpan.textContent = count;
      }

      const btnVisible = host.shadowRoot.getElementById("qa-btn-assert-visible");
      const btnText = host.shadowRoot.getElementById("qa-btn-assert-text");

      if (btnVisible && btnText) {
        btnVisible.classList.remove("qa-btn-assert-active");
        btnText.classList.remove("qa-btn-assert-active");

        if (window.__qa_assert_mode === "visible") {
          btnVisible.classList.add("qa-btn-assert-active");
        } else if (window.__qa_assert_mode === "text") {
          btnText.classList.add("qa-btn-assert-active");
        }
      }
    } catch (e) {}
  }

  function injectToolbar() {
    if (window.self !== window.top) return; // Only top level window
    if (document.getElementById("__qa_recorder_host")) return;

    const host = document.createElement("div");
    host.id = "__qa_recorder_host";
    const container = document.body || document.documentElement;
    container.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = \`
      .qa-toolbar {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        padding: 12px 16px;
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 2147483647;
        user-select: none;
      }
      .qa-logo {
        font-weight: 700;
        background: linear-gradient(135deg, #38bdf8, #818cf8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-right: 4px;
      }
      .qa-divider {
        width: 1px;
        height: 20px;
        background: rgba(255, 255, 255, 0.15);
      }
      .qa-badge {
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        padding: 4px 8px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
      }
      .qa-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #f1f5f9;
        padding: 6px 12px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
      }
      .qa-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.25);
        transform: translateY(-1px);
      }
      .qa-btn:active {
        transform: translateY(0);
      }
      .qa-btn-assert-active {
        background: #3b82f6 !important;
        border-color: #60a5fa !important;
        color: #ffffff !important;
        box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
        animation: qa-pulse 1.5s infinite;
      }
      .qa-btn-finish {
        background: linear-gradient(135deg, #10b981, #059669);
        border: none;
        color: white;
        font-weight: 600;
      }
      .qa-btn-finish:hover {
        background: linear-gradient(135deg, #059669, #047857);
        box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
      }
      .qa-btn-cancel {
        background: transparent;
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #ef4444;
      }
      .qa-btn-cancel:hover {
        background: rgba(239, 68, 68, 0.1);
        border-color: #ef4444;
      }
      @keyframes qa-pulse {
        0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
        70% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
        100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
      }
    \`;
    shadow.appendChild(style);

    const toolbar = document.createElement("div");
    toolbar.className = "qa-toolbar";
    toolbar.innerHTML = \`
      <span class="qa-logo">QA Recorder</span>
      <span class="qa-badge">Steps: <span id="qa-step-count">1</span></span>
      <div class="qa-divider"></div>
      <button class="qa-btn" id="qa-btn-assert-visible">👁️ Assert Visible</button>
      <button class="qa-btn" id="qa-btn-assert-text">📝 Assert Text</button>
      <div class="qa-divider"></div>
      <button class="qa-btn qa-btn-finish" id="qa-btn-finish">🏁 Finish & Save</button>
      <button class="qa-btn qa-btn-cancel" id="qa-btn-cancel">❌ Cancel</button>
    \`;
    shadow.appendChild(toolbar);

    shadow.getElementById("qa-btn-assert-visible").addEventListener("click", () => {
      window.__qa_assert_mode = window.__qa_assert_mode === "visible" ? null : "visible";
      updateToolbarUI();
    });

    shadow.getElementById("qa-btn-assert-text").addEventListener("click", () => {
      window.__qa_assert_mode = window.__qa_assert_mode === "text" ? null : "text";
      updateToolbarUI();
    });

    shadow.getElementById("qa-btn-finish").addEventListener("click", () => {
      const confirmSave = confirm("Are you sure you want to finish and save this test case?");
      if (confirmSave) {
        saveAction({ actionType: "finish_recording" });
      }
    });

    shadow.getElementById("qa-btn-cancel").addEventListener("click", () => {
      const confirmCancel = confirm("Are you sure you want to cancel and discard this recording session?");
      if (confirmCancel) {
        saveAction({ actionType: "cancel_recording" });
      }
    });

    updateToolbarUI();
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
      console.log("[BROWSER RECORDER]" + ctx + " saveAction read queue:", queueString);
      const queue = JSON.parse(queueString);
      queue.push(actionData);
      const newQueueString = JSON.stringify(queue);
      console.log("[BROWSER RECORDER]" + ctx + " saveAction saving queue:", newQueueString);
      sessionStorage.setItem("__qa_record_queue", newQueueString);
      processQueue();
    } catch (e) {
      console.log("[BROWSER RECORDER]" + ctx + " saveAction sessionStorage catch fallback path, error:", e);
      // Fallback in case sessionStorage is blocked/inaccessible
      window.qaRecordAction(actionData).catch(console.error);
    }
  }

  function processQueue() {
    const ctx = getContextInfo();
    console.log("[BROWSER RECORDER]" + ctx + " processQueue check, currentQueuePromise exists:", !!currentQueuePromise);
    if (currentQueuePromise) return currentQueuePromise;

    const promise = (async () => {
      try {
        while (true) {
          const queueString = sessionStorage.getItem("__qa_record_queue") || "[]";
          console.log("[BROWSER RECORDER]" + ctx + " processQueue loop read queue:", queueString);
          const queue = JSON.parse(queueString);
          if (queue.length === 0) {
            console.log("[BROWSER RECORDER]" + ctx + " processQueue queue is empty, breaking loop");
            break;
          }
          const nextAction = queue[0];
          try {
            if (typeof window.qaRecordAction === "function") {
              console.log("[BROWSER RECORDER]" + ctx + " calling backend qaRecordAction for action:", nextAction.actionType);
              await window.qaRecordAction(nextAction);
              console.log("[BROWSER RECORDER]" + ctx + " backend qaRecordAction resolved for action:", nextAction.actionType);
              const currentQueue = JSON.parse(sessionStorage.getItem("__qa_record_queue") || "[]");
              currentQueue.shift();
              sessionStorage.setItem("__qa_record_queue", JSON.stringify(currentQueue));
            } else {
              console.log("[BROWSER RECORDER]" + ctx + " window.qaRecordAction is not a function!");
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

  // Attempt to process queue 100ms after page load/injection
  setTimeout(processQueue, 100);

  // Periodically check/flush the queue (every 500ms) to resolve any transient websocket connection issues
  setInterval(processQueue, 500);

  // Click handler using capturing phase to delay and ensure steps are saved before navigation unloads the page
  document.addEventListener("click", function(e) {
    console.log("[BROWSER RECORDER] click event captured on target:", e.target.tagName, e.target.id);
    // If the click is inside our shadow DOM toolbar, let it pass through
    const host = document.getElementById("__qa_recorder_host");
    if (host && e.composedPath && e.composedPath().includes(host)) {
      return;
    }

    if (e.__qa_replayed) {
      return;
    }

    const target = e.target;

    // Handle element assertion selection when Assert Mode is active
    if (window.__qa_assert_mode) {
      e.preventDefault();
      e.stopPropagation();

      const locatorData = generateLocatorsForElement(target);
      const friendlyName = getElementFriendlyName(target);

      let actionData = null;
      if (window.__qa_assert_mode === "visible") {
        actionData = {
          actionType: "assert_visible",
          actionDescription: 'Assert that element "' + friendlyName + '" is visible',
          pageUrl: window.location.href,
          ...locatorData
        };
      } else if (window.__qa_assert_mode === "text") {
        const text = target.textContent?.trim() || "";
        actionData = {
          actionType: "assert_text",
          actionDescription: 'Assert that element "' + friendlyName + '" contains text "' + text.substring(0, 40) + '"',
          pageUrl: window.location.href,
          inputValue: text,
          ...locatorData
        };
      }

      // Restore outline
      if (hoveredElement) {
        hoveredElement.style.outline = hoveredElement.__qa_old_outline || "";
        hoveredElement = null;
      }

      // Deactivate assert mode and update UI
      window.__qa_assert_mode = null;
      updateToolbarUI();

      if (actionData) {
        saveAction(actionData);
        incrementStepCount();
      }

      return;
    }

    const tagName = target.tagName.toLowerCase();
    
    // Ignore text inputs, textarea, select (handled in change/input) to not disrupt editing
    if (tagName === "input" && !["checkbox", "radio", "button", "submit", "image", "file"].includes(target.type)) {
      return;
    }
    if (tagName === "textarea" || tagName === "select") {
      return;
    }

    // Stop propagation and prevent default action temporarily
    e.preventDefault();
    e.stopPropagation();

    const locatorData = generateLocatorsForElement(target);
    const friendlyName = getElementFriendlyName(target);

    const actionData = {
      actionType: "click",
      actionDescription: 'Click "' + friendlyName + '" ' + (tagName === "a" ? "link" : tagName === "button" ? "button" : "element"),
      pageUrl: window.location.href,
      ...locatorData
    };

    // Save action and increment step count
    try {
      const queue = JSON.parse(sessionStorage.getItem("__qa_record_queue") || "[]");
      queue.push(actionData);
      sessionStorage.setItem("__qa_record_queue", JSON.stringify(queue));
      incrementStepCount();
    } catch (err) {
      // Fallback
    }

    // Process the queue and wait for the backend callback before replaying the click
    const processPromise = processQueue();

    Promise.race([
      processPromise,
      new Promise(resolve => setTimeout(resolve, 2000)) // 2000ms safety timeout
    ]).finally(() => {
      replayClick(target, e);
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

    // Explicit fallback navigation for links
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

    // Explicit fallback submission for form submit buttons
    const button = target.closest("button, input");
    const isSubmit = button && (
      button.type === "submit" ||
      (button.tagName.toLowerCase() === "button" && !button.getAttribute("type"))
    );
    if (isSubmit && !clickEvent.defaultPrevented) {
      const form = button.closest("form");
      if (form) {
        form.submit();
      }
    }
  }

  // Change handler (types, select options, file uploads)
  document.addEventListener("change", function(e) {
    console.log("[BROWSER RECORDER] change event captured on target:", e.target.tagName, e.target.id);
    const host = document.getElementById("__qa_recorder_host");
    if (host && e.composedPath && e.composedPath().includes(host)) {
      return;
    }
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
    }
  }, true);

})();
`;
