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
