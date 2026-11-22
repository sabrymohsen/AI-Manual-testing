import { describe, expect, it } from "vitest"
import { parseJunitReport, summarize } from "@/lib/hub-report"

// Shape written by `pytest --junitxml -o junit_family=xunit1` (pytest-playwright projects).
const XML = `<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests"><testsuite name="pytest" errors="1" failures="1" skipped="1" tests="4" time="3.2">
<testcase classname="tests.smoke.test_emergency_housing" name="test_submit_and_review_catalogs" file="tests/smoke/test_emergency_housing.py" line="16" time="0.001" />
<testcase classname="tests.supervision.test_report.TestReport" name="test_saves[chromium]" file="tests/supervision/test_report.py" line="40" time="2.5"><failure message="AssertionError: expected &quot;تم الحفظ&quot; &amp; got nothing">def test_saves(page):
&gt;   assert page.locator("x").is_visible()
E   AssertionError</failure></testcase>
<testcase classname="tests.wip.test_x" name="test_pending" file="tests/wip/test_x.py" line="3" time="0"><skipped type="pytest.skip" message="MANUAL: needs DB access">tests/wip/test_x.py:4</skipped></testcase>
<testcase classname="tests.smoke.test_y" name="test_setup_breaks" time="0.7"><error message="failed on setup with &quot;TimeoutError&quot;"><![CDATA[TimeoutError: page.goto]]></error></testcase>
</testsuite></testsuites>`

describe("parseJunitReport", () => {
  const r = parseJunitReport(XML)

  it("reads every test case with its status, file, line and duration", () => {
    expect(r.map((t) => t.status)).toEqual(["passed", "failed", "skipped", "failed"])
    expect(r[0]).toMatchObject({ title: "test_submit_and_review_catalogs", file: "tests/smoke/test_emergency_housing.py", line: 17, durationMs: 1 })
    expect(r[1].title).toBe("TestReport > test_saves[chromium]")
    expect(r[3].file).toBe("tests/smoke/test_y.py")
    expect(summarize(r)).toMatchObject({ total: 4, passed: 1, failed: 2, skipped: 1 })
  })

  it("keeps failure and error messages, unescaped, including Arabic", () => {
    expect(r[1].error?.message).toBe('AssertionError: expected "تم الحفظ" & got nothing')
    expect(r[1].error?.snippet).toContain('>   assert page.locator("x").is_visible()')
    expect(r[3].error).toMatchObject({ message: 'failed on setup with "TimeoutError"', snippet: "TimeoutError: page.goto" })
    expect(r[2].error?.message).toBe("MANUAL: needs DB access")
  })

  it("returns nothing for empty or non-XML input", () => {
    expect(parseJunitReport("")).toEqual([])
    expect(parseJunitReport(undefined as any)).toEqual([])
  })
})
