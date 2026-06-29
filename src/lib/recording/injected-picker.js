// @ts-nocheck - Injected browser script stored as a template literal. HTML inside the string is not real JSX/TS.
// Multi-element picker overlay. Sibling of injected-recorder.js but it captures DOM elements into a
// collection instead of recording user actions as steps. Listeners stay alive for multi-select.
//
// Communicates with the Node side via functions the picker-session-manager exposes:
//   window.onElementPicked(data)       -> push a captured element
//   window.__pickerCommand(cmd)        -> toolbar buttons (save | clear | stop | export | addToTest | createBug)
// The manager pushes UI state back in via:
//   window.__pickerSetCount(n)         -> update the counter (after capture / navigation re-inject)
//   window.__pickerSetPaused(bool)     -> reflect paused state
export const INJECTED_PICKER_SCRIPT = `(function() {
  if (window.self !== window.top) return;
  if (window.__qa_picker_injected) return;
  window.__qa_picker_injected = true;

  var paused = false;
  var count = 0;

  function isDynamicValue(val) {
    if (!val) return false;
    var dynamicRegexes = [
      /ng-tns-c\\d+-\\d+/,
      /ng-star-inserted/,
      /css-[a-z0-9]+/i,
      /sc-[a-z0-9]+/i,
      /Mui[A-Z][a-zA-Z]+-root-\\d+/,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      /^\\d+$/
    ];
    return dynamicRegexes.some(function(rx) { return rx.test(val); });
  }

  function getStableClasses(element) {
    var classList = element.className;
    if (typeof classList !== "string") return [];
    return classList.split(/\\s+/).filter(function(c) {
      return c && !isDynamicValue(c) && !c.startsWith("ng-") && !c.startsWith("css-") && !c.startsWith("sc-") && !c.startsWith("qa-picker");
    });
  }

  function generateCssSelector(element) {
    var testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-qa");
    if (testId && !isDynamicValue(testId)) return '[data-testid="' + testId + '"]';
    var id = element.id;
    if (id && !isDynamicValue(id)) return '#' + id;
    var name = element.getAttribute("name");
    if (name && !isDynamicValue(name)) return element.tagName.toLowerCase() + '[name="' + name + '"]';

    var path = [];
    var curr = element;
    while (curr && curr.nodeType === Node.ELEMENT_NODE) {
      var tagName = curr.tagName.toLowerCase();
      if (tagName === "body" || tagName === "html") { path.unshift(tagName); break; }
      var cTestId = curr.getAttribute("data-testid") || curr.getAttribute("data-test");
      if (cTestId && !isDynamicValue(cTestId)) { path.unshift('[data-testid="' + cTestId + '"]'); break; }
      var cId = curr.id;
      if (cId && !isDynamicValue(cId)) { path.unshift('#' + cId); break; }
      var stableClasses = getStableClasses(curr);
      if (stableClasses.length > 0) {
        path.unshift(tagName + "." + stableClasses.join("."));
      } else {
        var siblingIndex = 1;
        var sibling = curr.previousElementSibling;
        while (sibling) { if (sibling.tagName.toLowerCase() === tagName) siblingIndex++; sibling = sibling.previousElementSibling; }
        path.unshift(tagName + ":nth-of-type(" + siblingIndex + ")");
      }
      curr = curr.parentElement;
    }
    return path.join(" > ");
  }

  function generateXPath(element) {
    var testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
    if (testId && !isDynamicValue(testId)) return "//*[@data-testid='" + testId + "']";
    var id = element.id;
    if (id && !isDynamicValue(id)) return "//*[@id='" + id + "']";
    var paths = [];
    var curr = element;
    while (curr && curr.nodeType === Node.ELEMENT_NODE) {
      var index = 1;
      var sibling = curr.previousElementSibling;
      while (sibling) { if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === curr.tagName) index++; sibling = sibling.previousElementSibling; }
      var tagName = curr.tagName.toLowerCase();
      var indexPart = (index > 1 || (curr.nextElementSibling && curr.nextElementSibling.tagName === curr.tagName)) ? "[" + index + "]" : "";
      paths.unshift(tagName + indexPart);
      curr = curr.parentElement;
    }
    return "/" + paths.join("/");
  }

  function calculateReliabilityScore(locators) {
    var score = 0;
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
      var depth = locators.xpathSelector.split("/").length;
      if (depth > 5) score -= Math.min(25, depth * 2);
    }
    return Math.max(0, Math.min(100, score));
  }

  function chooseBestLocator(locators) {
    if (locators.testIdSelector) {
      return { locatorType: "test_id", locatorValue: locators.attributes["data-testid"] || locators.attributes["data-test"] || locators.attributes["data-qa"] || "", recommendedSelector: locators.testIdSelector };
    }
    if (locators.idSelector) {
      var rawId = locators.idSelector.startsWith("#") ? locators.idSelector.substring(1) : locators.idSelector;
      return { locatorType: "css", locatorValue: "#" + rawId, recommendedSelector: locators.idSelector };
    }
    if (locators.labelSelector) return { locatorType: "label", locatorValue: locators.labelSelector, recommendedSelector: "Label: " + locators.labelSelector };
    if (locators.placeholderSelector) return { locatorType: "placeholder", locatorValue: locators.placeholderSelector, recommendedSelector: "Placeholder: " + locators.placeholderSelector };
    if (locators.roleSelector) {
      var parts = locators.roleSelector.split(":");
      var role = parts[0];
      var name = parts.slice(1).join(":");
      return { locatorType: "role", locatorValue: role + ', name: "' + name + '"', recommendedSelector: "Role: " + role + " (" + name + ")" };
    }
    if (locators.textSelector && locators.textSelector.length < 50) return { locatorType: "text", locatorValue: locators.textSelector, recommendedSelector: 'Text: "' + locators.textSelector + '"' };
    if (locators.cssSelector) return { locatorType: "css", locatorValue: locators.cssSelector, recommendedSelector: locators.cssSelector };
    return { locatorType: "xpath", locatorValue: locators.xpathSelector || "", recommendedSelector: locators.xpathSelector || "" };
  }

  function suggestActionType(element) {
    var tag = element.tagName.toLowerCase();
    var type = (element.getAttribute("type") || "").toLowerCase();
    if (tag === "input" && ["checkbox", "radio"].includes(type)) return "click";
    if (tag === "input" || tag === "textarea") return "input";
    if (tag === "select") return "select";
    if (tag === "a" || tag === "button" || element.getAttribute("role") === "button") return "click";
    return "verify";
  }

  function generateLocatorsForElement(element) {
    var tagName = element.tagName.toLowerCase();
    var isPasswordInput = tagName === "input" && (
      (element.getAttribute("type") || "").toLowerCase() === "password" ||
      (element.id || "").toLowerCase().includes("password") ||
      (element.getAttribute("name") || "").toLowerCase().includes("password")
    );
    var visibleText = isPasswordInput ? "" : ((element.textContent || "").trim().substring(0, 100));
    var attributes = {};
    for (var i = 0; i < element.attributes.length; i++) {
      var attr = element.attributes[i];
      if (isPasswordInput && ["value", "placeholder", "aria-label", "title"].includes(attr.name)) attributes[attr.name] = "";
      else attributes[attr.name] = attr.value;
    }
    var testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-qa");
    var testIdSelector = testId && !isDynamicValue(testId) ? '[data-testid="' + testId + '"]' : undefined;
    var id = element.id;
    var idSelector = id && !isDynamicValue(id) ? '#' + id : undefined;
    var placeholder = isPasswordInput ? undefined : element.getAttribute("placeholder");
    var placeholderSelector = placeholder ? placeholder : undefined;

    var labelSelector;
    if (id) { var labelEl = document.querySelector('label[for="' + id + '"]'); if (labelEl) labelSelector = (labelEl.textContent || "").trim() || undefined; }
    if (!labelSelector) {
      var labelParent = element.closest("label");
      if (labelParent) { var clone = labelParent.cloneNode(true); var input = clone.querySelector("input, select, textarea"); if (input) input.remove(); labelSelector = (clone.textContent || "").trim() || undefined; }
    }

    var roleSelector;
    var derivedRole = element.getAttribute("role");
    if (!derivedRole) {
      if (tagName === "button" || (tagName === "input" && (attributes["type"] === "button" || attributes["type"] === "submit"))) derivedRole = "button";
      else if (tagName === "a") derivedRole = "link";
      else if (tagName === "input" && attributes["type"] === "checkbox") derivedRole = "checkbox";
      else if (tagName === "input" && attributes["type"] === "radio") derivedRole = "radio";
      else if (tagName === "input" || tagName === "textarea") derivedRole = "textbox";
      else if (tagName === "select") derivedRole = "combobox";
      else if (["h1","h2","h3","h4","h5","h6"].includes(tagName)) derivedRole = "heading";
    }
    if (derivedRole) {
      var accessibleName = element.getAttribute("aria-label") || labelSelector || visibleText || placeholder || attributes["title"] || "";
      roleSelector = derivedRole + ":" + accessibleName;
    }

    var textSelector = visibleText ? visibleText : undefined;
    var cssSelector = generateCssSelector(element);
    var xpathSelector = generateXPath(element);
    var partial = { tagName: tagName, visibleText: visibleText, idSelector: idSelector, testIdSelector: testIdSelector, roleSelector: roleSelector, textSelector: textSelector, labelSelector: labelSelector, placeholderSelector: placeholderSelector, cssSelector: cssSelector, xpathSelector: xpathSelector, attributes: attributes };
    var score = calculateReliabilityScore(partial);
    var best = chooseBestLocator(partial);
    var name = (visibleText || labelSelector || placeholder || attributes["aria-label"] || testId || tagName).toString().trim().substring(0, 40) || tagName;
    return Object.assign({}, partial, {
      reliabilityScore: score,
      locatorType: best.locatorType,
      locatorValue: best.locatorValue,
      recommendedSelector: best.recommendedSelector,
      suggestedName: name,
      actionType: suggestActionType(element),
      pageUrl: window.location.href
    });
  }

  // ---- Overlay UI ----
  var style = document.createElement("style");
  style.id = "qa-picker-style";
  style.textContent = \`
    .qa-picker-highlight { outline: 3px solid #c084fc !important; outline-offset: -3px !important; background-color: rgba(192,132,252,0.15) !important; cursor: crosshair !important; }
    #qa-picker-bar { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
      background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 12px; padding: 8px 10px;
      display: flex; align-items: center; gap: 6px; font-family: system-ui, sans-serif; font-size: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
    #qa-picker-bar button { background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 8px; padding: 5px 8px; cursor: pointer; font-size: 12px; line-height: 1; }
    #qa-picker-bar button:hover { background: #334155; }
    #qa-picker-bar .qa-pk-count { background: #7c3aed; border-radius: 999px; padding: 3px 9px; font-weight: 700; }
    #qa-picker-bar .qa-pk-state { font-weight: 700; padding: 3px 8px; border-radius: 6px; }
    #qa-picker-bar .qa-pk-sel { background: #16a34a; }
    #qa-picker-bar .qa-pk-pause { background: #d97706; }
  \`;
  document.documentElement.appendChild(style);

  var bar = document.createElement("div");
  bar.id = "qa-picker-bar";
  bar.innerHTML =
    '<span class="qa-pk-state qa-pk-sel" id="qa-pk-state">● Selecting</span>' +
    '<span class="qa-pk-count" id="qa-pk-count">0</span>' +
    '<button data-cmd="__toggle" title="Pause/Resume — pause to navigate the app">⏸</button>' +
    '<button data-cmd="save" title="Save as Collection">💾 Save</button>' +
    '<button data-cmd="addToTest" title="Add to Test Case">➕ Test</button>' +
    '<button data-cmd="createBug" title="Create Bug from last element">🐞 Bug</button>' +
    '<button data-cmd="export" title="Export JSON">📤</button>' +
    '<button data-cmd="clear" title="Clear session">🧹</button>' +
    '<button data-cmd="stop" title="Stop session & close browser">⏹</button>';
  document.documentElement.appendChild(bar);

  function refresh() {
    var st = document.getElementById("qa-pk-state");
    var ct = document.getElementById("qa-pk-count");
    if (ct) ct.textContent = String(count);
    if (st) {
      st.textContent = paused ? "⏸ Paused (navigate)" : "● Selecting";
      st.className = "qa-pk-state " + (paused ? "qa-pk-pause" : "qa-pk-sel");
    }
  }

  bar.addEventListener("click", function(e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    var cmd = btn.getAttribute("data-cmd");
    if (cmd === "__toggle") { paused = !paused; refresh(); return; }
    if (window.__pickerCommand) window.__pickerCommand(cmd);
  }, true);

  function inBar(el) { return !!(el && el.closest && el.closest("#qa-picker-bar")); }

  document.addEventListener("mouseover", function(e) { if (paused || inBar(e.target)) return; e.target.classList.add("qa-picker-highlight"); }, true);
  document.addEventListener("mouseout", function(e) { if (inBar(e.target)) return; e.target.classList.remove("qa-picker-highlight"); }, true);

  document.addEventListener("click", function(e) {
    if (inBar(e.target)) return;
    if (paused) return; // pass-through so the user can navigate / interact
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    el.classList.remove("qa-picker-highlight");
    try {
      var data = generateLocatorsForElement(el);
      count++;
      refresh();
      if (window.onElementPicked) window.onElementPicked(data);
    } catch (err) { /* ignore capture errors */ }
  }, true);

  // Hooks the Node side uses to sync UI state (after capture / navigation re-inject)
  window.__pickerSetCount = function(n) { count = Number(n) || 0; refresh(); };
  window.__pickerSetPaused = function(p) { paused = !!p; refresh(); };

  refresh();
})()`
