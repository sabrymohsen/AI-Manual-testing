# Visual tests and plain-English steps

Three features modelled on Applitools Autonomous, built into this app's own
data model (projects, modules, test cases, test runs, bugs).

| Feature | Where | What it does |
|---|---|---|
| Whole-site / URL-list visual test | Sidebar → **Visual Tests** | Reads the sitemap (or a list you type or upload), screenshots every page on each browser and screen size, compares with the last **approved** screenshot, and reports changes, HTTP errors, and pages added or removed. |
| Review screen + auto-maintenance | Open any screen of a run | Approved and new images side by side, changes outlined. You accept or reject, draw ignore areas, or file a bug. Accepting a change also accepts the **identical** change on every other screen. Undo is available. |
| Plain-English steps | Test case → Steps → **Plain English** | Write `Type "demo user" in the "Username" field`, `Verify that the element below "Total Balance" contains 350`. Autocomplete, auto-correct, **Write with AI**, and **Make up test data** are included. Runs are deterministic: the AI never runs during a test. |

## After pulling this branch

1. `npx prisma db push` (or apply `prisma/migrations/20260917090000_visual_tests/migration.sql`). The change only adds tables and enums.
2. `npx prisma generate`
3. Restart **both** `npm run dev` and `npm run workers`. Screenshots are taken by the worker, on the new `visual-test-queue`.

## How a visual run works

1. **Pages.** A URL-list test uses its saved list. A whole-website test re-reads the sitemap on every run (explicit sitemap → robots.txt → `/sitemap.xml` → following links). New pages are added unless their folder is excluded. Pages that disappeared are reported as **Removed**. If the sitemap cannot be read, nothing is marked removed.
2. **Capture.** For each environment × page: open the page, wait for the network to go quiet (with a time limit), freeze animations and the caret, scroll once so lazy images load, wait for fonts, run the optional script, wait the optional delay, then take the screenshot.
3. **Compare.** The screenshot is compared with the baseline for that page and environment (`VisualScreenBaseline`). Images of different sizes are padded, never resized. Changed pixels are grouped into regions, and each region stores a perceptual hash of the old and the new crop.
   - **Exact** (Strict): any visible difference.
   - **Ignore changing text** (Dynamic): dates, times, numbers, prices, emails, URLs and form values are masked on both images.
   - **Ignore colours**: compares lightness only.
4. **Verdict.** A page seen for the first time is **New** and becomes the baseline. Otherwise the screen is **Passed** or **Needs review**. A page that fails to load is an **Error**, and its image never becomes a baseline.

A baseline changes only when a person accepts a screen. Accepting an *older* screen never replaces a baseline that a *newer* capture already set.

### Auto-maintenance

Two screens show "the same change" when every changed region of one matches a region of the other. A match means similar size, a similar *before* crop, and a similar *after* crop (dHash, ≤ 6 of 64 bits). Because the *before* crop has to match too, accepting a new logo never approves a broken image that happens to sit in the same place. The same test runs this on real browser renders:

- Logo changed on the home page ≡ logo changed on the pricing page → accepted together
- Logo change ≢ price change, ≢ logo + price change, ≢ a typo in the logo

Scope is chosen when you decide: this run, or every waiting run of the test. Undo puts the auto-resolved screens back to Needs review and restores the baselines they replaced.

## Plain-English steps

- A step is stored as a normal `TestStep`. The sentence is in `actionDescription` and `actionMetadata.plainEnglish = true`. The structured fields (`actionType`, `targetType`…) are filled in as a summary so lists, exports and reports still work.
- At run time, `executeStep` sees the flag and runs the **sentence** through `src/lib/plain-english/grammar.ts` → `interpreter.ts`. What a person reads is what runs.
- Supported: go to / back / forward / refresh · click (double, right) · hover · type / clear · select (by text or position) · check / uncheck · press keys · scroll · wait N seconds · wait for an element or URL · implicit wait · verify visible / text / URL / title / enabled / checked / HTTP status · set variable (literal, element text, URL, title) · assert `{variable}` · execute JavaScript (`{js-result}`) · GET/POST/PUT/PATCH/DELETE with headers and body (`{response.status}`, `{response.body.…}`) · upload (files in `storage/test-files/`) · accept / dismiss dialog · new / switch / close tab · **Visually check this screen** · `Optionally …`.
- Elements are found by what a person sees: role and name, label, placeholder, text, ordinal (`the 2nd link`), and position relative to other text (`the field below "Email"`, `text to the right of "Order number"`).
- Variables available when a run starts: the project's test data, the test case's test data, and `{username}` / `{password}` from the run's login.
- **Visually check this screen** records into a *Flow* visual test for that test case. The run page links to the review, and the checkpoint uses the same baselines, ignore areas and auto-maintenance as whole-site tests.

## Tested

- `tests/unit/visual-tests.test.ts`: image comparison, regions, same-change matching, URL normalisation, sitemap/list parsing, page reconciliation, verdicts (30 cases).
- `tests/unit/plain-english-grammar.test.ts`: 106 cases, including every step of the Applitools demo lessons verbatim.
- End-to-end in headless Chromium against a local test site: a 49-step plain-English script passed (login, relative elements, dropdown, API call with a header and a body assertion, JavaScript, confirm dialogs accepted and dismissed, target=_blank tabs, 404 status). Failures give readable messages. Dynamic masking removed a changing clock, and sitemap discovery found both pages.

## Known limits

- Firefox and WebKit environments need those browsers installed where the worker runs. `Dockerfile.worker` already includes them.
- One run per visual test at a time.
- Images are never deleted when runs or tests are deleted; clean up storage separately.
- Accessibility (axe) checks per page are not included.
