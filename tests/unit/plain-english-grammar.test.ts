/**
 * Plain-English steps: the deterministic grammar. Includes every step from the
 * Applitools Autonomous demo lessons verbatim, so the wording testers already
 * use keeps working.
 */
import assert from "node:assert/strict"
import { describe, it } from "vitest"
import * as g from "@/lib/plain-english/grammar"
import * as st from "@/lib/plain-english/structured"

describe("plain-English grammar", () => {
const P = (s: string) => { const r = g.parseStep(s); if (!r.ok) throw new Error(`not parsed: ${s} → ${r.error}`); return r }
const bad = (s: string) => { const r = g.parseStep(s); if (r.ok) throw new Error(`should NOT parse: ${s} → ${JSON.stringify(r.command)}`); return r }
const eq = (s: string, cmd: any) => it(s, () => assert.deepEqual(P(s).command, cmd))

// Applitools demo lessons, verbatim
eq('navigate to "https://sandbox.applitools.com/bank"', { type: "goto", url: "https://sandbox.applitools.com/bank" })
eq('type "demo user" in the "Username" field', { type: "type", value: "demo user", target: { by: "name", name: "Username", kind: "field" }, append: false })
eq('Type *** in the "Password" field', { type: "type", value: "***", target: { by: "name", name: "Password", kind: "field" }, append: false })
eq('click "Sign in"', { type: "click", target: { by: "name", name: "Sign in", kind: "any" }, clickType: "single" })
eq('type {username} in the username field', { type: "type", value: "{username}", target: { by: "name", name: "username", kind: "field" }, append: false })
eq('Click on "Sign in"', { type: "click", target: { by: "name", name: "Sign in", kind: "any" }, clickType: "single" })
eq('Select "Demo Request" from dropdown below "Contact Reason"', { type: "select", option: "Demo Request", target: { by: "relative", kind: "dropdown", relation: "below", anchor: "Contact Reason" } })
eq('Click the "Submit" button', { type: "click", target: { by: "name", name: "Submit", kind: "button" }, clickType: "single" })
eq('Set variable requestid = text to the right of "use this id to track your request"', { type: "setVariable", name: "requestid", source: { from: "element", target: { by: "relative", kind: "text", relation: "rightOf", anchor: "use this id to track your request" } } })
eq('GET https://sandbox.applitools.com/api/get-contact-status?id={requestid} with header "accesskey: mysecretkey"', { type: "api", method: "GET", url: "https://sandbox.applitools.com/api/get-contact-status?id={requestid}", headers: { accesskey: "mysecretkey" }, body: null })
eq('Assert that {response.body.data.status} equals "SUBMITTED"', { type: "assertValue", left: "{response.body.data.status}", comparison: "equals", right: "SUBMITTED" })
eq('Verify that  the "Jack Gomez" heading  is visible', { type: "assertVisible", target: { by: "name", name: "Jack Gomez", kind: "heading" }, negate: false })
eq('Verify that  the element below "Total Balance"  contains 350', { type: "assertText", target: { by: "relative", kind: "text", relation: "below", anchor: "Total Balance" }, comparison: "contains", expected: "350" })
eq('navigate to "https://{env}applitools.com"', { type: "goto", url: "https://{env}applitools.com" })
eq('Optionally click "Accept All"', { type: "click", target: { by: "name", name: "Accept All", kind: "any" }, clickType: "single" })
it("optional flag", () => assert.equal(P('Optionally click "Accept All"').optional, true))
eq('Set variable selector = "h1"', { type: "setVariable", name: "selector", source: { from: "literal", value: "h1" } })
eq('Execute javascript: document.getElementById("p").value', { type: "executeJs", code: 'document.getElementById("p").value' })
eq('Execute javascript: document.getElementsByTagName( {selector} )[0].textContent', { type: "executeJs", code: "document.getElementsByTagName( {selector} )[0].textContent" })
eq('Assert that {js-result} is "Example Domain"', { type: "assertValue", left: "{js-result}", comparison: "equals", right: "Example Domain" })
eq('set url as "https://sandbox.applitools.com/e-commerce"', { type: "setVariable", name: "url", source: { from: "literal", value: "https://sandbox.applitools.com/e-commerce" } })
eq('open new browser tab with url {url}', { type: "newTab", url: "{url}" })
eq('close current browser tab', { type: "closeTab" })
eq('Implicitly wait for elements up to 10 seconds', { type: "implicitWait", ms: 10000 })
eq('Wait up to 20 seconds for  the "Financial Overview" heading  to appear', { type: "waitFor", target: { by: "name", name: "Financial Overview", kind: "heading" }, timeoutMs: 20000, state: "visible" })
// Applitools placeholder examples
eq("Click the first link in the dialog".replace(" in the dialog",""), { type: "click", target: { by: "ordinal", kind: "link", ordinal: 1 }, clickType: "single" })
eq('Check the second box'.replace("second box", '"Remember me" box'), { type: "check", target: { by: "name", name: "Remember me", kind: "field" } })
eq("Close the current browser tab", { type: "closeTab" })
eq("Refresh the page", { type: "reload" })
eq("Scroll up to 30 pixels", { type: "scroll", direction: "up", pixels: 30, half: false })
eq("Scroll to the top of page", { type: "scroll", direction: "top" })
eq("Press ESCAPE", { type: "press", key: "Escape" })
eq("Verify that the status of the page is 401", { type: "assertStatus", status: 401 })
eq("Verify that {response.status} equals 201", { type: "assertValue", left: "{response.status}", comparison: "equals", right: "201" })
eq("Wait 5 seconds", { type: "wait", ms: 5000 })
eq("Wait 1 minute", { type: "wait", ms: 60000 })
eq("Go to https://www.example.com", { type: "goto", url: "https://www.example.com" })
eq("Click on the 2nd link", { type: "click", target: { by: "ordinal", kind: "link", ordinal: 2 }, clickType: "single" })
eq("Click on the 3rd image", { type: "click", target: { by: "ordinal", kind: "image", ordinal: 3 }, clickType: "single" })
eq("Hover over the first link", { type: "hover", target: { by: "ordinal", kind: "link", ordinal: 1 } })
eq("Scroll down", { type: "scroll", direction: "down", pixels: undefined, half: false })
eq("Scroll halfway down", { type: "scroll", direction: "down", pixels: undefined, half: true })
eq("Scroll the viewport halfway down", { type: "scroll", direction: "down", pixels: undefined, half: true })
eq("Scroll down 50 pixels", { type: "scroll", direction: "down", pixels: 50, half: false })
eq("Scroll to the bottom of the page", { type: "scroll", direction: "bottom" })
eq('Scroll to the "OK" button', { type: "scroll", direction: "to", target: { by: "name", name: "OK", kind: "button" } })
eq("Press the tab key", { type: "press", key: "Tab" })
eq("Press the left key", { type: "press", key: "ArrowLeft" })
eq("Click the alert OK button", { type: "dialog", accept: true, ifVisible: false })
eq("Click the alert Cancel button", { type: "dialog", accept: false, ifVisible: false })
eq('Select the 2nd option in the "Country" dropdown', { type: "select", option: "#2", target: { by: "name", name: "Country", kind: "dropdown" } })
eq("Set the implicit wait time to 10 seconds", { type: "implicitWait", ms: 10000 })
eq("Accept the alert if it is visible", { type: "dialog", accept: true, ifVisible: true })
eq('Set “User Name” as “{first}{last}”', { type: "type", value: "{first}{last}", target: { by: "name", name: "User Name", kind: "any" }, append: false })
eq("Visually check this screen", { type: "checkpoint", name: null, fullPage: null })
eq('Visually check this screen as "Checkout summary"', { type: "checkpoint", name: "Checkout summary", fullPage: null })
// Everyday phrasing
eq("Press Enter", { type: "press", key: "Enter" })
eq("press ctrl+a", { type: "press", key: "Control+A" })
eq('Uncheck the "Subscribe" checkbox', { type: "uncheck", target: { by: "name", name: "Subscribe", kind: "checkbox" } })
eq('Check "I agree"', { type: "check", target: { by: "name", name: "I agree", kind: "checkbox" } })
eq('Verify that "Error" is not visible', { type: "assertVisible", target: { by: "name", name: "Error", kind: "any" }, negate: true })
eq('Verify that "Error" is hidden', { type: "assertVisible", target: { by: "name", name: "Error", kind: "any" }, negate: true })
eq('Verify that the page contains "Order confirmed"', { type: "assertText", target: null, comparison: "contains", expected: "Order confirmed" })
eq('Verify that the URL contains "/home"', { type: "assertUrl", comparison: "contains", expected: "/home" })
eq('Verify the title is "Dashboard"', { type: "assertTitle", comparison: "equals", expected: "Dashboard" })
eq('Verify that the "Email" field is disabled', { type: "assertEnabled", target: { by: "name", name: "Email", kind: "field" }, negate: true })
eq('Verify that the "Remember" checkbox is checked', { type: "assertChecked", target: { by: "name", name: "Remember", kind: "checkbox" }, negate: false })
eq('Verify that the "Total" text equals "$20.00"', { type: "assertText", target: { by: "name", name: "Total", kind: "text" }, comparison: "equals", expected: "$20.00" })
eq('Wait for the "Loading" text to disappear', { type: "waitFor", target: { by: "name", name: "Loading", kind: "text" }, timeoutMs: null, state: "hidden" })
eq('Wait for the URL to contain "/dashboard"', { type: "waitForUrl", comparison: "contains", expected: "/dashboard", timeoutMs: null })
eq('Upload "invoice.pdf" to the "Attachment" field', { type: "upload", file: "invoice.pdf", target: { by: "name", name: "Attachment", kind: "field" } })
eq('POST https://api.x.com/items with header "Content-Type: application/json" with body "{\\"a\\":1}"', { type: "api", method: "POST", url: "https://api.x.com/items", headers: { "Content-Type": "application/json" }, body: '{"a":1}' })
eq('Double-click "Row"', { type: "click", target: { by: "name", name: "Row", kind: "any" }, clickType: "double" })
eq('Right click the "File" link', { type: "click", target: { by: "name", name: "File", kind: "link" }, clickType: "right" })
eq('Clear the "Search" field', { type: "clear", target: { by: "name", name: "Search", kind: "field" } })
eq('Fill the "Email" field with "a@b.co"', { type: "type", value: "a@b.co", target: { by: "name", name: "Email", kind: "field" }, append: false })
eq('Enter "hello" into the textarea below "Message"', { type: "type", value: "hello", target: { by: "relative", kind: "field", relation: "below", anchor: "Message" }, append: false })
eq('Click css "#save"', { type: "click", target: { by: "css", selector: "#save" }, clickType: "single" })
eq('Click the element with test id "save-btn"', { type: "click", target: { by: "testid", id: "save-btn" }, clickType: "single" })
eq('Click the second "Edit" link', { type: "click", target: { by: "name", name: "Edit", kind: "link", ordinal: 2 }, clickType: "single" })
eq('Switch to the new tab', { type: "switchTab", index: "last" })
eq('Go back', { type: "back" })
eq('Save the page title as pageTitle', { type: "setVariable", name: "pageTitle", source: { from: "title" } })
eq('Set variable total = text below "Total Balance"', { type: "setVariable", name: "total", source: { from: "element", target: { by: "relative", kind: "text", relation: "below", anchor: "Total Balance" } } })
eq('Assert that {count} is greater than 3', { type: "assertValue", left: "{count}", comparison: "greaterThan", right: "3" })
// Auto-correction
it("typo verb corrected", () => assert.equal(P('clik "Sign in"').text, 'Click "Sign in"'))
it("typo naviagte", () => assert.equal(P('naviagte to "https://a.com"').command.type, "goto"))
it("trailing period", () => assert.deepEqual(P('Click "OK".').command, { type: "click", target: { by: "name", name: "OK", kind: "any" }, clickType: "single" }))
it("smart quotes", () => assert.equal(P("Type “x” in the “Name” field").command.type, "type"))
it("url trailing dot kept? (url ends with dot is rare)", () => assert.equal(P("Go to https://a.com/x").command.type, "goto"))
it("apostrophe inside quoted value", () => assert.equal((P(`Click "Don't allow"`).command as any).target.name, "Don't allow"))
it("apostrophe in bare word does not open a quote", () => assert.equal((P(`Verify that the page contains "It's done"`).command as any).expected, "It's done"))
// Must not parse / good errors
it("garbage", () => bad("banana smoothie recipe"))
it("unclosed quote", () => assert.match(bad('Click "Sign in').error, /never closed/))
it("empty", () => assert.match(bad("   ").error, /Write what/))
it("verify without object", () => assert.match(bad("Verify that it works").error, /check|element/i))
// Autocomplete
it("suggest by prefix", () => assert.ok(g.suggestSteps("Type")[0].startsWith("Type")))
it("suggest verify", () => assert.ok(g.suggestSteps("verify that the url").some((s: string) => /URL contains/.test(s))))
it("variables used", () => assert.deepEqual(g.variablesUsed('GET https://x/{id}?t={response.body.token} {id}'), ["id", "response"]))
it("every template parses", () => { for (const tpl of g.STEP_TEMPLATES) { const r = g.parseStep(tpl); if (!r.ok) throw new Error(`template fails: ${tpl} → ${r.error}`) } })
it("describe never throws", () => { for (const tpl of g.STEP_TEMPLATES) { const r = g.parseStep(tpl); if (r.ok) assert.ok(r.meaning.length > 3) } })
it("structured: type → fill label", () => assert.deepEqual(st.toStructured(P('type "demo user" in the "Username" field').command), { actionType: "fill", targetType: "label", targetValue: "Username", inputValue: "demo user" }))
it("structured: click button → role", () => assert.deepEqual(st.toStructured(P('Click the "Submit" button').command), { actionType: "click", targetType: "role", targetValue: 'button, name: "Submit"', inputValue: "" }))
it("structured: api → custom", () => assert.equal(st.toStructured(P("GET https://a.com").command).actionType, "custom_instruction"))
it("describe → parse round trip", () => {
  const cases = [
    { actionType: "open_url", targetType: "url", inputValue: "https://a.com" },
    { actionType: "click", targetType: "role", targetValue: 'button, name: "Save"' },
    { actionType: "fill", targetType: "label", targetValue: "Email", inputValue: "a@b.co" },
    { actionType: "fill", targetType: "placeholder", targetValue: "Password", inputValue: "***MASKED***" },
    { actionType: "select", targetType: "label", targetValue: "Country", inputValue: "Egypt" },
    { actionType: "assert_visible", targetType: "text", targetValue: "Welcome" },
    { actionType: "url_contains", targetType: "none", inputValue: "/home" },
    { actionType: "wait", targetType: "none", inputValue: "3000" },
    { actionType: "text_contains", targetType: "css", targetValue: "#total", inputValue: "350" },
  ]
  for (const c of cases) { const s = st.describeStructuredStep(c as any); assert.ok(s, JSON.stringify(c)); const r = g.parseStep(s); assert.ok(r.ok, `${s} → ${(r as any).error}`) }
})
it("plainEnglishStepFields keeps unparsed text", () => { const r = st.plainEnglishStepFields("banana smoothie"); assert.equal(r.parsed.ok, false); assert.equal(r.step.actionDescription, "Banana smoothie"); assert.equal(r.step.actionMetadata.plainEnglish, true) })

})
