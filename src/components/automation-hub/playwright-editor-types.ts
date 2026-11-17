/**
 * Type definitions the hub's code editor loads, so typing `page.` or
 * `expect(locator).` in a JavaScript test lists the real Playwright methods
 * with a one-line description. A hand-picked subset of @playwright/test's
 * API (the full .d.ts is several MB and pulls in Node's types): the methods
 * people use day to day, with the same names and signatures.
 */
export const PLAYWRIGHT_EDITOR_TYPES = `
declare module "@playwright/test" {
  type Buffer = Uint8Array
  type AriaRole = "alert" | "alertdialog" | "button" | "checkbox" | "combobox" | "dialog" | "grid" | "gridcell" | "heading" | "img" | "link" | "list" | "listbox" | "listitem" | "menu" | "menuitem" | "navigation" | "option" | "progressbar" | "radio" | "radiogroup" | "row" | "searchbox" | "slider" | "spinbutton" | "status" | "switch" | "tab" | "table" | "tablist" | "tabpanel" | "textbox" | "tooltip" | "tree" | "treeitem" | "banner" | "main" | "form" | "region" | "cell" | "columnheader" | "rowheader" | "paragraph" | "separator" | "toolbar"

  interface TimeoutOptions { /** Milliseconds to wait. Default: the configured timeout. */ timeout?: number }

  interface Locator {
    /** Click the element. Waits for it to be visible, stable and enabled. */
    click(options?: TimeoutOptions & { button?: "left" | "right" | "middle"; clickCount?: number; force?: boolean; modifiers?: ("Alt" | "Control" | "Meta" | "Shift")[]; position?: { x: number; y: number } }): Promise<void>
    /** Double-click the element. */
    dblclick(options?: TimeoutOptions): Promise<void>
    /** Clear the field and type this value (inputs, textareas, contenteditable). */
    fill(value: string, options?: TimeoutOptions): Promise<void>
    /** Type character by character, firing key events (use fill() unless you need the keystrokes). */
    pressSequentially(text: string, options?: TimeoutOptions & { delay?: number }): Promise<void>
    /** Press a key or combination, e.g. "Enter", "Tab", "Control+A". */
    press(key: string, options?: TimeoutOptions): Promise<void>
    /** Clear an input field. */
    clear(options?: TimeoutOptions): Promise<void>
    /** Tick a checkbox or radio button. */
    check(options?: TimeoutOptions): Promise<void>
    /** Untick a checkbox. */
    uncheck(options?: TimeoutOptions): Promise<void>
    /** Set checked state. */
    setChecked(checked: boolean, options?: TimeoutOptions): Promise<void>
    /** Choose option(s) in a <select> by value, label or index. */
    selectOption(values: string | string[] | { value?: string; label?: string; index?: number } | { value?: string; label?: string; index?: number }[], options?: TimeoutOptions): Promise<string[]>
    /** Upload file(s) to an <input type="file">. */
    setInputFiles(files: string | string[], options?: TimeoutOptions): Promise<void>
    /** Move the mouse over the element. */
    hover(options?: TimeoutOptions): Promise<void>
    /** Focus the element. */
    focus(options?: TimeoutOptions): Promise<void>
    /** Drag this element onto another. */
    dragTo(target: Locator, options?: TimeoutOptions): Promise<void>
    /** Scroll the element into view. */
    scrollIntoViewIfNeeded(options?: TimeoutOptions): Promise<void>
    /** Wait until the element is attached / visible / hidden / detached. */
    waitFor(options?: TimeoutOptions & { state?: "attached" | "detached" | "visible" | "hidden" }): Promise<void>
    /** The element's visible text. */
    innerText(options?: TimeoutOptions): Promise<string>
    /** The element's text content. */
    textContent(options?: TimeoutOptions): Promise<string | null>
    /** Visible texts of every matching element. */
    allInnerTexts(): Promise<string[]>
    /** Value of an input, textarea or select. */
    inputValue(options?: TimeoutOptions): Promise<string>
    /** An attribute's value. */
    getAttribute(name: string, options?: TimeoutOptions): Promise<string | null>
    /** Whether the element is visible right now (does not wait). */
    isVisible(): Promise<boolean>
    isHidden(): Promise<boolean>
    isEnabled(options?: TimeoutOptions): Promise<boolean>
    isChecked(options?: TimeoutOptions): Promise<boolean>
    /** How many elements match. */
    count(): Promise<number>
    /** Screenshot of just this element. */
    screenshot(options?: TimeoutOptions & { path?: string }): Promise<Buffer>
    /** First / last / n-th (0-based) matching element. */
    first(): Locator
    last(): Locator
    nth(index: number): Locator
    /** Narrow down: only matches that contain this text or element. */
    filter(options: { hasText?: string | RegExp; hasNotText?: string | RegExp; has?: Locator; hasNot?: Locator; visible?: boolean }): Locator
    /** Elements matching both this and the other locator. */
    and(locator: Locator): Locator
    /** Elements matching either locator. */
    or(locator: Locator): Locator
    /** All matching elements as separate locators. */
    all(): Promise<Locator[]>
    locator(selector: string, options?: { hasText?: string | RegExp; has?: Locator }): Locator
    getByRole(role: AriaRole, options?: { name?: string | RegExp; exact?: boolean; checked?: boolean; pressed?: boolean; selected?: boolean; expanded?: boolean; level?: number; disabled?: boolean; includeHidden?: boolean }): Locator
    getByText(text: string | RegExp, options?: { exact?: boolean }): Locator
    getByLabel(text: string | RegExp, options?: { exact?: boolean }): Locator
    getByPlaceholder(text: string | RegExp, options?: { exact?: boolean }): Locator
    getByTestId(testId: string | RegExp): Locator
    getByAltText(text: string | RegExp, options?: { exact?: boolean }): Locator
    getByTitle(text: string | RegExp, options?: { exact?: boolean }): Locator
  }

  interface Response {
    status(): number
    ok(): boolean
    url(): string
    json(): Promise<any>
    text(): Promise<string>
    headers(): Record<string, string>
  }

  interface Page {
    /** Open a URL. Waits for the page "load" event by default. */
    goto(url: string, options?: TimeoutOptions & { waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" }): Promise<Response | null>
    /** Reload the page. */
    reload(options?: TimeoutOptions): Promise<Response | null>
    goBack(options?: TimeoutOptions): Promise<Response | null>
    goForward(options?: TimeoutOptions): Promise<Response | null>
    /** The current URL. */
    url(): string
    /** The page title. */
    title(): Promise<string>
    /** Find elements by ARIA role and accessible name: the most robust way to locate. */
    getByRole(role: AriaRole, options?: { name?: string | RegExp; exact?: boolean; checked?: boolean; pressed?: boolean; selected?: boolean; expanded?: boolean; level?: number; disabled?: boolean; includeHidden?: boolean }): Locator
    /** Find by visible text. */
    getByText(text: string | RegExp, options?: { exact?: boolean }): Locator
    /** Find a form field by its label text. */
    getByLabel(text: string | RegExp, options?: { exact?: boolean }): Locator
    /** Find an input by its placeholder. */
    getByPlaceholder(text: string | RegExp, options?: { exact?: boolean }): Locator
    /** Find by data-testid attribute. */
    getByTestId(testId: string | RegExp): Locator
    /** Find an image by alt text. */
    getByAltText(text: string | RegExp, options?: { exact?: boolean }): Locator
    /** Find by title attribute. */
    getByTitle(text: string | RegExp, options?: { exact?: boolean }): Locator
    /** Find by CSS (or "xpath=…") selector. Prefer getByRole / getByLabel when you can. */
    locator(selector: string, options?: { hasText?: string | RegExp; has?: Locator }): Locator
    /** Locate inside an <iframe>. */
    frameLocator(selector: string): { locator(selector: string): Locator; getByRole: Locator["getByRole"]; getByText: Locator["getByText"]; getByLabel: Locator["getByLabel"] }
    /** Wait for the URL to match. */
    waitForURL(url: string | RegExp, options?: TimeoutOptions): Promise<void>
    /** Wait for a network response whose URL matches. */
    waitForResponse(urlOrPredicate: string | RegExp | ((response: Response) => boolean), options?: TimeoutOptions): Promise<Response>
    /** Wait for the page to reach a load state. */
    waitForLoadState(state?: "load" | "domcontentloaded" | "networkidle", options?: TimeoutOptions): Promise<void>
    /** Fixed pause. Avoid it: tests become slow and flaky. Wait for something specific instead. */
    waitForTimeout(timeout: number): Promise<void>
    /** Screenshot of the page. */
    screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>
    /** Run JavaScript in the page. */
    evaluate<R>(fn: (arg: any) => R, arg?: any): Promise<R>
    /** Mock or watch network requests. */
    route(url: string | RegExp, handler: (route: { fulfill(response: { status?: number; body?: string; json?: any; contentType?: string }): Promise<void>; continue(): Promise<void>; abort(): Promise<void>; request(): { url(): string; method(): string } }) => any): Promise<void>
    /** Set the window size. */
    setViewportSize(size: { width: number; height: number }): Promise<void>
    /** Listen for events, e.g. page.on("dialog", d => d.accept()). */
    on(event: "dialog" | "console" | "request" | "response" | "popup" | "pageerror", listener: (arg: any) => void): Page
    keyboard: { press(key: string): Promise<void>; type(text: string): Promise<void>; down(key: string): Promise<void>; up(key: string): Promise<void> }
    mouse: { click(x: number, y: number): Promise<void>; move(x: number, y: number): Promise<void>; wheel(deltaX: number, deltaY: number): Promise<void> }
    context(): BrowserContext
  }

  interface BrowserContext {
    newPage(): Promise<Page>
    cookies(): Promise<any[]>
    addCookies(cookies: any[]): Promise<void>
    clearCookies(): Promise<void>
    storageState(options?: { path?: string }): Promise<any>
  }

  interface APIResponse {
    /** HTTP status code. */
    status(): number
    /** True for 2xx statuses. */
    ok(): boolean
    statusText(): string
    url(): string
    headers(): Record<string, string>
    /** Parse the body as JSON. */
    json(): Promise<any>
    text(): Promise<string>
  }

  interface RequestOptions {
    /** JSON body (objects are sent as JSON). */
    data?: any
    headers?: Record<string, string>
    params?: Record<string, string | number | boolean>
    form?: Record<string, string>
    timeout?: number
    failOnStatusCode?: boolean
  }

  interface APIRequestContext {
    get(url: string, options?: RequestOptions): Promise<APIResponse>
    post(url: string, options?: RequestOptions): Promise<APIResponse>
    put(url: string, options?: RequestOptions): Promise<APIResponse>
    patch(url: string, options?: RequestOptions): Promise<APIResponse>
    delete(url: string, options?: RequestOptions): Promise<APIResponse>
    head(url: string, options?: RequestOptions): Promise<APIResponse>
  }

  interface Fixtures {
    /** A fresh browser tab for this test. */
    page: Page
    /** The browser context (cookies, storage) the page belongs to. */
    context: BrowserContext
    /** HTTP client for API tests: request.get(url), request.post(url, { data }). */
    request: APIRequestContext
    browserName: "chromium" | "firefox" | "webkit"
    baseURL?: string
  }

  interface TestInfo { title: string; retry: number; outputDir: string; attach(name: string, options: { body?: string | Buffer; path?: string; contentType?: string }): Promise<void> }

  type TestBody = (fixtures: Fixtures, testInfo: TestInfo) => Promise<void> | void

  interface TestFn {
    /** Declare a test. */
    (title: string, body: TestBody): void
    (title: string, details: { tag?: string | string[] }, body: TestBody): void
    /** Group tests. */
    describe: ((title: string, body: () => void) => void) & { only(title: string, body: () => void): void; skip(title: string, body: () => void): void; serial(title: string, body: () => void): void; configure(options: { mode?: "parallel" | "serial"; retries?: number; timeout?: number }): void }
    /** Runs before each test in the file / group. */
    beforeEach(body: TestBody): void
    afterEach(body: TestBody): void
    beforeAll(body: (fixtures: { browser: any; request: APIRequestContext }) => Promise<void> | void): void
    afterAll(body: (fixtures: { browser: any; request: APIRequestContext }) => Promise<void> | void): void
    /** Run only this test (remove before committing). */
    only(title: string, body: TestBody): void
    /** Skip this test. */
    skip(title: string, body: TestBody): void
    /** Mark as expected to fail. */
    fail(title: string, body: TestBody): void
    /** Mark as slow (triples the timeout). */
    slow(): void
    /** A named step: shows up in the report and trace. */
    step<T>(title: string, body: () => Promise<T>): Promise<T>
    /** Override options for this file, e.g. test.use({ viewport: { width: 375, height: 812 } }). */
    use(options: { viewport?: { width: number; height: number }; locale?: string; baseURL?: string; storageState?: string; extraHTTPHeaders?: Record<string, string>; ignoreHTTPSErrors?: boolean; colorScheme?: "light" | "dark" }): void
    /** Change this test's timeout (ms). */
    setTimeout(timeout: number): void
    info(): TestInfo
  }

  interface Matchers {
    /** Negate the next check: expect(x).not.toBeVisible(). */
    not: Matchers
    // Locator checks (auto-wait and retry until the timeout)
    /** Element is visible. */
    toBeVisible(options?: TimeoutOptions): Promise<void>
    toBeHidden(options?: TimeoutOptions): Promise<void>
    toBeEnabled(options?: TimeoutOptions): Promise<void>
    toBeDisabled(options?: TimeoutOptions): Promise<void>
    toBeChecked(options?: TimeoutOptions & { checked?: boolean }): Promise<void>
    toBeEditable(options?: TimeoutOptions): Promise<void>
    toBeFocused(options?: TimeoutOptions): Promise<void>
    toBeEmpty(options?: TimeoutOptions): Promise<void>
    toBeAttached(options?: TimeoutOptions): Promise<void>
    toBeInViewport(options?: TimeoutOptions): Promise<void>
    /** Element's text equals (string) or matches (RegExp). */
    toHaveText(expected: string | RegExp | (string | RegExp)[], options?: TimeoutOptions & { ignoreCase?: boolean }): Promise<void>
    /** Element's text contains this. */
    toContainText(expected: string | RegExp | (string | RegExp)[], options?: TimeoutOptions & { ignoreCase?: boolean }): Promise<void>
    /** Input's current value. */
    toHaveValue(expected: string | RegExp, options?: TimeoutOptions): Promise<void>
    toHaveAttribute(name: string, value?: string | RegExp, options?: TimeoutOptions): Promise<void>
    toHaveClass(expected: string | RegExp, options?: TimeoutOptions): Promise<void>
    toHaveCSS(name: string, value: string | RegExp, options?: TimeoutOptions): Promise<void>
    /** Number of matching elements. */
    toHaveCount(count: number, options?: TimeoutOptions): Promise<void>
    toHaveAccessibleName(name: string | RegExp, options?: TimeoutOptions): Promise<void>
    // Page checks
    /** Page URL equals / matches. */
    toHaveURL(expected: string | RegExp, options?: TimeoutOptions): Promise<void>
    /** Page title equals / matches. */
    toHaveTitle(expected: string | RegExp, options?: TimeoutOptions): Promise<void>
    /** Visual comparison against a saved screenshot. */
    toHaveScreenshot(name?: string, options?: TimeoutOptions & { maxDiffPixels?: number; fullPage?: boolean }): Promise<void>
    // API response
    /** Response status is 2xx. */
    toBeOK(): Promise<void>
    // Plain value checks (no waiting)
    toBe(expected: any): void
    toEqual(expected: any): void
    toStrictEqual(expected: any): void
    toBeTruthy(): void
    toBeFalsy(): void
    toBeNull(): void
    toBeUndefined(): void
    toBeDefined(): void
    toContain(expected: any): void
    toHaveLength(length: number): void
    toHaveProperty(path: string, value?: any): void
    toMatch(expected: string | RegExp): void
    toMatchObject(expected: object): void
    toBeGreaterThan(n: number): void
    toBeGreaterThanOrEqual(n: number): void
    toBeLessThan(n: number): void
    toBeLessThanOrEqual(n: number): void
    toBeCloseTo(n: number, digits?: number): void
    toThrow(expected?: string | RegExp): void
  }

  interface Expect {
    /** Check a value, element, page or API response. */
    (actual: any, message?: string): Matchers
    /** Keep going after a failed check; the test still fails at the end. */
    soft(actual: any, message?: string): Matchers
    /** Retry a block of code until it passes. */
    poll<T>(fn: () => Promise<T> | T, options?: { timeout?: number; intervals?: number[] }): Matchers
  }

  export const test: TestFn
  export const expect: Expect
  export type { Page, Locator, BrowserContext, APIRequestContext, APIResponse }
}

declare const process: { env: Record<string, string | undefined> }
`
