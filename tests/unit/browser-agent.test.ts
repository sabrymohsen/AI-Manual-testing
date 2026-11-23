import { describe, expect, it } from "vitest"
import { actionsFor, compactSnapshot, currentTab, jsLocatorToPython, listedElements, parseSnapshot, redactSecrets, roleLocator, stepSentence } from "@/lib/browser-agent/snapshot"
import { cliArgs, commandError } from "@/lib/browser-agent/commands"
import { buildPrompt, parseAgentReply } from "@/lib/browser-agent/agent"
import { parseStep } from "@/lib/plain-english/grammar"

// Real playwright-cli output (the-internet.herokuapp.com/login), trimmed.
const SNAP = `- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#content"
  - 'link "The Internet: home" [ref=e3] [cursor=pointer]':
    - /url: /
  - main [ref=e7]:
    - heading "Login Page" [level=2] [ref=e9]
    - generic [ref=e15]:
      - generic [ref=e16] [cursor=pointer]: Username
      - textbox "Username" [active] [ref=e17]: "-abc"
      - textbox "Password" [ref=e21]: SuperSecretPassword!
    - checkbox "Remember me" [checked] [ref=e30]
    - combobox "Country" [disabled] [ref=e31]
    - button " Login" [ref=e22] [cursor=pointer]:
      - generic [ref=e23]:  Login`

describe("parseSnapshot", () => {
  const els = parseSnapshot(SNAP)
  const by = (ref: string) => els.find((e) => e.ref === ref)!

  it("reads role, name, ref, value and flags", () => {
    expect(by("e3")).toMatchObject({ role: "link", name: "The Internet: home" })
    expect(by("e9")).toMatchObject({ role: "heading", name: "Login Page", level: 2 })
    expect(by("e17")).toMatchObject({ role: "textbox", name: "Username", value: "-abc" })
    expect(by("e16")).toMatchObject({ role: "generic", name: "", value: "Username" })
    expect(by("e30").checked).toBe(true)
    expect(by("e31").disabled).toBe(true)
    expect(by("e22").name).toBe("Login")
  })

  it("lists only elements a tester acts on or checks", () => {
    expect(listedElements(els).map((e) => e.ref)).toEqual(["e2", "e3", "e9", "e17", "e21", "e30", "e31", "e22"])
  })

  it("compacts for the AI: no urls, cursor hints or icon glyphs", () => {
    const c = compactSnapshot(SNAP)
    expect(c).not.toContain("/url")
    expect(c).not.toContain("cursor=pointer")
    expect(c).toContain('button " Login" [ref=e22]'.replace("", ""))
    expect(compactSnapshot(SNAP, 50)).toContain("cut here")
  })

  it("hides secret values", () => {
    expect(redactSecrets(SNAP, { password: "SuperSecretPassword!" })).toContain("{password}")
    expect(redactSecrets(SNAP, { password: "SuperSecretPassword!" })).not.toContain("SuperSecretPassword!")
  })

  it("reads the current tab", () => {
    expect(currentTab("- 0: (current) [The Internet](https://x.test/login)")).toEqual({ title: "The Internet", url: "https://x.test/login" })
  })
})

describe("locators", () => {
  it("builds role locators in JavaScript and Python", () => {
    expect(roleLocator({ role: "button", name: "It's ok" }, "js")).toBe("page.getByRole('button', { name: 'It\\'s ok' })")
    expect(roleLocator({ role: "textbox", name: 'Say "hi"' }, "python")).toBe('page.get_by_role("textbox", name="Say \\"hi\\"")')
    expect(roleLocator({ role: "generic", name: "" }, "js")).toBeNull()
  })

  it("converts playwright-cli locators to Python", () => {
    expect(jsLocatorToPython("getByRole('textbox', { name: 'Username' })")).toBe('page.get_by_role("textbox", name="Username")')
    expect(jsLocatorToPython("getByRole('button', { name: 'Go', exact: true })")).toBe('page.get_by_role("button", name="Go", exact=True)')
    expect(jsLocatorToPython("locator('div').filter({ hasText: 'Password' }).nth(3)")).toBe('page.locator("div").filter(has_text="Password").nth(3)')
    expect(jsLocatorToPython("getByTestId('save')")).toBe('page.get_by_test_id("save")')
  })
})

describe("recorded steps", () => {
  it("writes no-code sentences the hub's step grammar accepts", () => {
    const sentences = [
      stepSentence("goto", null, "https://x.test/login"),
      stepSentence("click", { role: "button", name: "Login" }),
      stepSentence("click", { role: "link", name: "Forgot" }),
      stepSentence("click", { role: "tab", name: "Details" }),
      stepSentence("fill", { role: "textbox", name: "Username" }, "tomsmith"),
      stepSentence("fill", { role: "textbox", name: "Password" }, "{password}"),
      stepSentence("select", { role: "combobox", name: "Country" }, "Egypt"),
      stepSentence("check", { role: "checkbox", name: "Remember me" }),
      stepSentence("uncheck", { role: "checkbox", name: "Remember me" }),
      stepSentence("press", null, "enter"),
      stepSentence("verify-visible", { role: "heading", name: "Secure Area" }),
      stepSentence("verify-visible", { role: "button", name: "Logout" }),
      stepSentence("verify-text", null, "You logged into a secure area!"),
      stepSentence("hover", { role: "link", name: "Products" }),
    ]
    expect(sentences[4]).toBe('Type "tomsmith" in the "Username" field')
    expect(sentences[5]).toBe('Type {password} in the "Password" field')
    for (const s of sentences) {
      expect(s).toBeTruthy()
      expect(parseStep(s!).ok, s!).toBe(true)
    }
  })

  it("offers actions that fit the element", () => {
    expect(actionsFor({ role: "textbox" })[0]).toBe("fill")
    expect(actionsFor({ role: "checkbox" })).toContain("uncheck")
    expect(actionsFor({ role: "heading" })[0]).toBe("verify-visible")
  })
})

describe("commands", () => {
  it("allows the agent's commands and blocks everything else", () => {
    expect(commandError("click", ["e12"])).toBeNull()
    expect(commandError("fill", ["e7", "-starts with dash"])).toBeNull()
    expect(commandError("open", ["https://x.test"])).toBeNull()
    expect(commandError("run-code", ["await page.close()"])).toMatch(/allowed/)
    expect(commandError("eval", ["1"])).toMatch(/allowed/)
    expect(commandError("open", ["file:///etc/passwd"])).toMatch(/Invalid/)
    expect(commandError("goto", ["javascript:alert(1)"])).toMatch(/Invalid/)
    expect(commandError("click", ["--config=x"])).toMatch(/can't start/)
    expect(commandError("click", ["#css"])).toMatch(/Invalid/)
    expect(commandError("press", ["Enter; rm"])).toMatch(/Invalid/)
  })

  it("puts values that start with - after --", () => {
    expect(cliArgs("s1", "fill", ["e7", "-x"])).toEqual(["-s=s1", "--json", "fill", "--", "e7", "-x"])
    expect(cliArgs("s1", "open", ["https://x.test"], { headed: true })).toEqual(["-s=s1", "--json", "open", "--headed", "https://x.test"])
  })
})

describe("agent replies", () => {
  it("accepts a valid action on an element that is on the page", () => {
    expect(parseAgentReply('{"action":"fill","ref":"e17","value":"{username}","why":"type user"}', SNAP)).toEqual({ kind: "act", cmd: "fill", ref: "e17", value: "{username}", why: "type user" })
    expect(parseAgentReply('```json\n{"action":"press","value":"Enter"}\n```', SNAP)).toMatchObject({ kind: "act", cmd: "press", value: "Enter" })
  })

  it("never acts on an element that isn't on the page", () => {
    expect(parseAgentReply('{"action":"click","ref":"e999"}', SNAP)).toMatchObject({ kind: "act", cmd: "wait" })
  })

  it("reads verdicts and treats unusable replies as failures", () => {
    expect(parseAgentReply('{"done":true,"passed":true,"actual":"Secure Area is shown"}', SNAP)).toEqual({ kind: "done", passed: true, actual: "Secure Area is shown" })
    expect(parseAgentReply('{"done":true,"passed":"yes"}', SNAP)).toMatchObject({ kind: "done", passed: false })
    expect(parseAgentReply("no idea", SNAP)).toMatchObject({ kind: "done", passed: false })
    expect(parseAgentReply('{"action":"eval","value":"1"}', SNAP)).toMatchObject({ kind: "done", passed: false })
    expect(parseAgentReply('{"action":"goto","value":"file:///etc"}', SNAP)).toMatchObject({ kind: "done", passed: false })
  })

  it("prompts with the step, expected result, data names and the page", () => {
    const p = buildPrompt({
      projectId: "p",
      userId: "u",
      testTitle: "Login",
      previous: [{ action: "Open the login page", passed: true }],
      step: { action: "Log in", expected: "Secure Area" },
      page: { url: "https://x.test", title: "T", snapshot: SNAP },
      done: [{ action: "click e22", error: "timeout" }],
      dataNames: ["password"],
    })
    expect(p).toContain("CURRENT STEP: Log in")
    expect(p).toContain("EXPECTED RESULT: Secure Area")
    expect(p).toContain("{password}")
    expect(p).toContain("FAILED: timeout")
    expect(p).toContain("[ref=e17]")
  })
})

import { toJavaScript, toPython } from "@/lib/browser-agent/record-code"

describe("recorded code", () => {
  const actions = [
    { action: "goto" as const, sentence: 'Go to "https://x.test/login"', value: "https://x.test/login" },
    { action: "fill" as const, sentence: "", locator: "getByRole('textbox', { name: 'Username' })", value: "tom's" },
    { action: "fill" as const, sentence: "", locator: "getByRole('textbox', { name: 'Password' })", value: "{password}" },
    { action: "click" as const, sentence: "", locator: "getByRole('button', { name: 'Login' })" },
    { action: "press" as const, sentence: "", value: "enter" },
    { action: "verify-visible" as const, sentence: "", locator: "getByRole('heading', { name: 'Secure Area' })" },
    { action: "verify-text" as const, sentence: "", value: "You logged in" },
  ]

  it("writes a Playwright JavaScript test", () => {
    const js = toJavaScript("Login works", actions)
    expect(js).toContain("test('Login works', async ({ page }) => {")
    expect(js).toContain("await page.getByRole('textbox', { name: 'Username' }).fill('tom\\'s');")
    expect(js).toContain("fill(process.env.PASSWORD ?? '')")
    expect(js).toContain("await page.keyboard.press('Enter');")
    expect(js).toContain("await expect(page.getByRole('heading', { name: 'Secure Area' })).toBeVisible();")
  })

  it("writes a pytest-playwright test", () => {
    const py = toPython("Login works", actions)
    expect(py).toMatch(/^import os\n/)
    expect(py).toContain("def test_login_works(page: Page) -> None:")
    expect(py).toContain('    page.get_by_role("textbox", name="Username").fill("tom\'s")')
    expect(py).toContain('fill(os.environ.get("PASSWORD", ""))')
    expect(py).toContain('    expect(page.get_by_text("You logged in").first).to_be_visible()')
  })
})

import { splitUser } from "@/lib/plain-english/grammar"
import { stepsToPlaywright } from "@/lib/plain-english/to-playwright"
import { asUser } from "@/lib/browser-agent/snapshot"

describe("more than one user", () => {
  it("reads the user prefix of a step", () => {
    expect(splitUser("As reviewer: Click the \"Approve\" button")).toEqual({ user: "reviewer", rest: 'Click the "Approve" button' })
    expect(splitUser("as the approver_2: Verify that the page contains \"Approved\"").user).toBe("approver_2")
    expect(splitUser('Click the "Login" button').user).toBeNull()
    const p = parseStep('as reviewer: click the "Approve" button')
    expect(p.ok && p.user).toBe("reviewer")
    expect(p.ok && p.meaning).toMatch(/^As reviewer: Click/)
    expect(parseStep("As reviewer:").ok).toBe(false)
  })

  it("records steps per user, with saved values", () => {
    const s = stepSentence("remember", { role: "cell", name: "REQ-1042" }, "request_id")!
    expect(s).toBe('Save the text of "REQ-1042" as {request_id}')
    for (const t of [asUser(s, "submitter"), stepSentence("remember", { role: "heading", name: "Request 7" }, "req")!, asUser('Type {request_id} in the "Search" field', "reviewer")]) {
      expect(parseStep(t).ok, t).toBe(true)
    }
    expect(actionsFor({ role: "cell" })).toContain("remember")
  })

  it("lets the AI remember a value and act as a user", () => {
    expect(parseAgentReply('{"action":"remember","name":"{request_id}","value":"REQ-1042"}', "")).toEqual({ kind: "remember", name: "request_id", value: "REQ-1042", why: "" })
    expect(parseAgentReply('{"action":"remember","name":"1x","value":"a"}', "").kind).toBe("done")
    const p = buildPrompt({
      projectId: "p",
      userId: "u",
      testTitle: "Approve",
      previous: [],
      step: { action: "Open request {request_id}", expected: "" },
      page: { snapshot: "- button \"Go\" [ref=e1]" },
      done: [],
      dataNames: ["submitter_user", "reviewer_user", "reviewer_password"],
      remembered: { request_id: "REQ-1042" },
      user: "reviewer",
    })
    expect(p).toContain("YOU ARE ACTING AS: reviewer")
    expect(p).toContain("This user's test data: {reviewer_user}, {reviewer_password}")
    expect(p).toContain('{request_id} = "REQ-1042"')
  })

  it("writes code with a browser context per user", () => {
    const acts = [
      { action: "goto" as const, sentence: "", value: "https://x.test", user: "submitter" },
      { action: "remember" as const, sentence: "", locator: "getByRole('cell', { name: 'REQ-1' })", value: "request_id", user: "submitter" },
      { action: "goto" as const, sentence: "", value: "https://x.test", user: "reviewer" },
      { action: "fill" as const, sentence: "", locator: "getByRole('textbox', { name: 'Search' })", value: "{request_id}", user: "reviewer" },
      { action: "fill" as const, sentence: "", locator: "getByRole('textbox', { name: 'Password' })", value: "{reviewer_password}", user: "reviewer" },
    ]
    const js = toJavaScript("Approve", acts)
    expect(js).toContain("async ({ browser }) => {")
    expect(js).toContain("const reviewerPage = await (await browser.newContext()).newPage();")
    expect(js).toContain("const requestId = (await submitterPage.getByRole('cell', { name: 'REQ-1' }).innerText()).trim();")
    expect(js).toContain("await reviewerPage.getByRole('textbox', { name: 'Search' }).fill(requestId);")
    expect(js).toContain("fill(process.env.REVIEWER_PASSWORD ?? '')")
    const py = toPython("Approve", acts)
    expect(py).toContain("def test_approve(browser: Browser) -> None:")
    expect(py).toContain("    reviewer_page = browser.new_context().new_page()")
    expect(py).toContain('    request_id = submitter_page.get_by_role("cell", name="REQ-1").inner_text().strip()')
    expect(py).toContain('reviewer_page.get_by_role("textbox", name="Search").fill(request_id)')
  })

  it("compiles a no-code test with users into their own contexts", () => {
    const { code, errors } = stepsToPlaywright({
      name: "Approve",
      steps: ['As submitter: Go to "https://x.test"', 'As submitter: Save the text of "Request number" as {request_id}', 'As reviewer: Go to "https://x.test"', 'As reviewer: Type {request_id} in the "Search" field'],
    })
    expect(errors).toEqual([])
    expect(code).toContain("async ({ page: firstPage, browser }) => {")
    expect(code).toContain('const users = { "submitter": firstPage }')
    expect(code).toContain('page = await asUser("reviewer")')
    expect(code).toContain("qa.share(page, users[user])")
    expect(code).toContain("await p.context().close()")
    expect(stepsToPlaywright({ name: "x", steps: ['Go to "https://x.test"'] }).code).toContain("async ({ page }) => {")
  })
})

import { rememberPlan } from "@/lib/browser-agent/snapshot"
import { wordAfter } from "@/lib/plain-english/interpreter"

describe("remembering a value inside a sentence", () => {
  it("keeps the word after the fixed text", () => {
    expect(rememberPlan({ role: "paragraph", name: "", value: "Your request number is REQ-2497" })).toEqual({ value: "REQ-2497", after: "Your request number is" })
    expect(rememberPlan({ role: "paragraph", name: "", value: "Order #A12-77 was created." })).toEqual({ value: "A12-77", after: "Order" })
    expect(rememberPlan({ role: "heading", name: "Request sent" })).toEqual({ value: "Request sent" })
    expect(wordAfter("Your request number is REQ-2497.", "Your request number is")).toBe("REQ-2497")
    const s = stepSentence("remember", { role: "paragraph", name: "", value: "Your request number is REQ-2497" }, "request_id")!
    expect(s).toBe('Save the text after "Your request number is" as {request_id}')
    const p = parseStep(s)
    expect(p.ok && p.command).toEqual({ type: "setVariable", name: "request_id", source: { from: "after", label: "Your request number is" } })
    const js = toJavaScript("x", [{ action: "remember", sentence: s, value: "request_id", after: "Your request number is" }])
    expect(js).toContain("const requestId = ((await page.getByText('Your request number is').first().innerText()).split('Your request number is')[1] ?? '').trim()")
    const py = toPython("x", [{ action: "remember", sentence: s, value: "request_id", after: "Your request number is" }])
    expect(py).toContain('request_id = (page.get_by_text("Your request number is").first.inner_text().split("Your request number is", 1)[-1].split() or [""])[0]')
  })
})

import { suggestRoles, userKey, loginValues } from "@/lib/brd/test-users"
import { usersInstructions, buildGenerationContext } from "@/lib/brd/generation-context"

describe("BRD test users", () => {
  it("makes one-word keys from roles", () => {
    expect(userKey("Case worker")).toBe("case_worker")
    expect(userKey("The Reviewer", ["reviewer"])).toBe("reviewer_2")
    expect(userKey("المراجع")).toBe("المراجع")
    expect(userKey("مقدم الطلب")).toBe("مقدم_الطلب")
    expect(userKey("123")).toBe("user")
  })

  it("finds the roles a BRD mentions", () => {
    const roles = suggestRoles([
      "As a case worker, I want to review the request",
      "As an applicant I want to submit a housing request",
      "بصفتي مقدم الطلب، أرغب في تقديم طلب سكن",
      "As a case worker, I can reject",
    ])
    expect(roles).toEqual(["case worker", "applicant", "مقدم الطلب"])
  })

  it("steps can name Arabic users", () => {
    expect(splitUser("As مقدم_الطلب: اضغط زر إرسال")).toEqual({ user: "مقدم_الطلب", rest: "اضغط زر إرسال" })
  })

  it("tells the AI the roles, never the logins", () => {
    const users = [
      { key: "applicant", role: "Applicant" },
      { key: "reviewer", role: "Reviewer" },
    ]
    const text = buildGenerationContext(
      { id: "1", key: "FR-1", title: "Approve", description: "Reviewer approves", taskId: null, acceptanceCriteria: [], section: null, parentKey: null, priority: null, status: "active" },
      [],
      [],
      false,
      users
    )
    expect(text).toContain("- reviewer = Reviewer")
    expect(text).toContain('"As applicant: Log in with {applicant_username} and {applicant_password}"')
    expect(text).toContain("{request_id}")
    expect(usersInstructions(users, true).join("\n")).toContain("{applicant_password}")
    const { values, secrets } = loginValues([{ key: "reviewer", username: "rev1", password: "s3cret" }])
    expect(values).toEqual({ reviewer_username: "rev1", reviewer_password: "s3cret" })
    expect(secrets).toEqual({ reviewer_password: "s3cret" })
  })
})

import { withLoginSteps, withRememberSteps } from "@/lib/browser-agent/user-steps"

describe("runnable multi-user cases", () => {
  const users = [
    { key: "applicant", role: "Applicant" },
    { key: "reviewer", role: "Reviewer" },
  ]
  const generated = [
    { action: "As applicant: Navigate to the return request submission page.", expected: "The page is displayed." },
    { action: "As applicant: Fill in the title and submit the request.", expected: "The request number {request_id} is displayed." },
    { action: "As reviewer: Navigate to the reviewer inbox page.", expected: "The inbox is displayed." },
    { action: "As reviewer: Open the request {request_id}.", expected: "Details for {request_id} are displayed." },
  ]

  it("logs each user in and remembers values passed between them", () => {
    const steps = withLoginSteps(withRememberSteps(generated, []), users)
    expect(steps.map((s) => s.action)).toEqual([
      "As applicant: Log in with {applicant_username} and {applicant_password}",
      generated[0].action,
      generated[1].action,
      "As applicant: Remember the request id shown on the page as {request_id}",
      "As reviewer: Log in with {reviewer_username} and {reviewer_password}",
      generated[2].action,
      generated[3].action,
    ])
    // Running it again changes nothing.
    expect(withLoginSteps(withRememberSteps(steps, []), users)).toEqual(steps)
  })

  it("keeps a case that already logs in and remembers", () => {
    const ok = [
      { action: "As reviewer: Sign in with {reviewer_username} and {reviewer_password}", expected: "" },
      { action: "As reviewer: Save the number as {n}", expected: "{n} shown" },
      { action: "As reviewer: Search {n}", expected: "" },
    ]
    expect(withLoginSteps(withRememberSteps(ok, []), users)).toEqual(ok)
    expect(withRememberSteps([{ action: "Type {title}", expected: "{title} shown" }], ["title"])).toHaveLength(1)
  })
})
