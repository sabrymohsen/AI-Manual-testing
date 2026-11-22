'use strict';
// End-to-end check of the pipeline referee with a synthetic SAMPLE run (no browser, no network).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../pipeline');
const J = require('../jira');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const S = (p) => require(path.join(ROOT, p));
const EPIC = path.join(ROOT, 'test-input', 'EPIC_1_SauceDemo.md');

function newRun() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pipe-'));
  const { runDir } = P.init({ 'out-root': out, story: 'SD-02', 'story-title': 'Clear login errors', epic: 'SauceDemo Shopping Flow',
    'epic-file': EPIC, 'base-url': 'https://www.saucedemo.com', scope: '6', sample: true, date: '2026-01-01' });
  return runDir;
}

function writeAnalysis(runDir, { clear = false } = {}) {
  const a = path.join(runDir, 'analysis');
  const q = { storyId: 'SD-02', storyTitle: 'Clear login errors', sample: true, clarity: clear ? 'Clear' : 'Unclear', jiraUpdated: clear, emailUpdated: clear,
    acceptanceCriteria: [{ id: 'AC-1', text: 'Empty username -> "Epic sadface: Username is required"' }],
    gaps: [{ id: 'G-01', text: 'prefix differs' }],
    questions: [{ id: 'Q-01', question: 'Which prefix?', priority: 'High', status: clear ? 'Answered' : 'Open', answer: clear ? 'with prefix' : null, answeredBy: clear ? 'PO' : null }] };
  const im = { storyId: 'SD-02', sample: true, epic: 'SauceDemo', impacts: [
    { id: 'IM-01', module: 'SD-01 Log in', storyRef: 'SD-01', relation: 'shared-component', likelihood: 3, severity: 3, score: 9, level: 'Critical', evidence: 'Depends On SD-01', why: 'same form', testFocus: 'valid login' }] };
  fs.writeFileSync(path.join(a, 'SD-02-questions.json'), JSON.stringify(q));
  fs.writeFileSync(path.join(a, 'SD-02-impact.json'), JSON.stringify(im));
  fs.writeFileSync(path.join(a, 'SD-02-result.md'), '> SAMPLE\n# x\n## Acceptance criteria\n## Gaps\n## Questions\n## Impact\n## Readiness\n');
  fs.writeFileSync(path.join(a, 'SD-02-email-draft.md'), S('skill/1-RequirmentAnalysisSkill/scripts/build_email.js').buildEmail(q, {}));
  fs.writeFileSync(path.join(a, 'SD-02-jira-comment.md'), S('skill/1-RequirmentAnalysisSkill/scripts/build_jira_comment.js').buildJiraComment(q, im));
  const U = S('skill/1-RequirmentAnalysisSkill/scripts/util.js');
  fs.writeFileSync(path.join(a, 'EPIC_1-SD-02-graph.html'), S('skill/1-RequirmentAnalysisSkill/scripts/build_epic_graph.js').buildGraph(U.parseEpic(fs.readFileSync(EPIC, 'utf8')), im, 'SD-02'));
}

function writeSuite(runDir, override) {
  const suite = { suiteId: 'TS-LOGIN-001', storyId: 'SD-02', storyTitle: 'Clear login errors', epic: 'SauceDemo', baseUrl: 'https://www.saucedemo.com',
    sample: true, override, overrideNote: override ? 'Tester, 2026-01-01: demo' : null, observationDerived: false,
    acceptanceCriteria: [{ id: 'AC-1', text: 'Empty username' }],
    testCases: [
      { id: 'TC-LOGIN-001', title: 'Empty username', scope: 'Target', acRef: ['AC-1'], priority: 'P1', status: 'Ready', questionRef: ['Q-01'],
        steps: [{ action: 'Click Login', expected: 'Epic sadface: Username is required' }], expectedResult: 'Epic sadface: Username is required' },
      { id: 'TC-LOGIN-002', title: 'Valid login still works', scope: 'Impacted', impactRef: 'IM-01', priority: 'P1', status: 'Ready',
        steps: [{ action: 'Log in as standard_user', expected: 'Products' }], expectedResult: 'Products' }] };
  const f = path.join(runDir, 'testcases', 'SD-02-testcases.json');
  fs.writeFileSync(f, JSON.stringify(suite));
  const B = S('skill/2-TestCaseCreationSkill/scripts/build_testcases.js');
  fs.writeFileSync(path.join(runDir, 'testcases', 'SD-02-testcases.md'), B.toMarkdown(suite));
  fs.writeFileSync(path.join(runDir, 'testcases', 'SD-02-testcases.csv'), B.toCsv(suite));
  return f;
}

function execute(runDir, suiteFile) {
  const R = S('skill/3-TestExecutionSkill/scripts/record_result.js');
  const out = path.join(runDir, 'execution', 'run');
  R.start({ out, suite: suiteFile, baseUrl: 'https://www.saucedemo.com' });
  fs.writeFileSync(path.join(out, 'evidence', 'a.png'), 'png');
  R.begin({ out, test: 'TC-LOGIN-001' });
  R.step({ out, test: 'TC-LOGIN-001', n: 1, status: 'fail', actual: 'Username is required', screenshot: 'evidence/a.png' });
  R.end({ out, test: 'TC-LOGIN-001', status: 'Failed' });
  R.begin({ out, test: 'TC-LOGIN-002' });
  R.step({ out, test: 'TC-LOGIN-002', n: 1, status: 'pass', actual: 'Products', screenshot: 'evidence/a.png' });
  R.end({ out, test: 'TC-LOGIN-002', status: 'Passed' });
  R.finish({ out });
  fs.writeFileSync(path.join(runDir, 'execution', 'SD-02-automation.json'), JSON.stringify({ tool: 'playwright-cli', automationCode: false }));
  return path.join(out, 'results.json');
}

test('init creates the run folder layout and a -v2 folder for a re-run', () => {
  const runDir = newRun();
  assert.match(path.basename(runDir), /^SD-02_Clear-login-errors_SauceDemo-Shopping-Flow_2026-01-01$/);
  for (const d of ['analysis', 'gate', 'testcases', 'execution', 'bugs', 'report', 'summary']) assert.ok(fs.existsSync(path.join(runDir, d)));
  const again = P.init({ 'out-root': path.dirname(runDir), story: 'SD-02', 'story-title': 'Clear login errors', epic: 'SauceDemo Shopping Flow', date: '2026-01-01' });
  assert.match(again.runDir, /-v2$/);
});

test('a stage cannot start before the previous one is Done', () => {
  const runDir = newRun();
  assert.throws(() => P.start({ 'run-dir': runDir, _: ['start', 'testcases'] }), /analysis is Pending/);
});

test('complete fails (not Done) when the analysis outputs are missing', () => {
  const runDir = newRun();
  const r = P.complete({ 'run-dir': runDir, _: ['complete', 'analysis'] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /missing SD-02-result.md/.test(e)));
  assert.strictEqual(P.status({ 'run-dir': runDir }).stages.analysis.status, 'Failed');
});

test('gate: no notice and no decision before analysis is Done; override needs the notice and the user\'s words', () => {
  const runDir = newRun();
  assert.throws(() => P.notice({ 'run-dir': runDir }), /must be Done/);
  assert.throws(() => P.gate({ 'run-dir': runDir, decision: 'override', by: 'x', why: 'y', words: 'z' }), /after stage 1 is Done/);
  writeAnalysis(runDir);
  assert.ok(P.complete({ 'run-dir': runDir, _: ['complete', 'analysis'] }).ok);
  assert.throws(() => P.gate({ 'run-dir': runDir, decision: 'override', by: 'x', why: 'y', words: 'z' }), /Draft the blocking notice first/);
  P.notice({ 'run-dir': runDir });
  assert.throws(() => P.gate({ 'run-dir': runDir, decision: 'ready' }), /not met/);
  assert.throws(() => P.gate({ 'run-dir': runDir, decision: 'override', by: 'Tester' }), /--why/);
  const g = P.gate({ 'run-dir': runDir, decision: 'override', by: 'Tester', why: 'demo', words: 'go ahead' });
  assert.strictEqual(g.decision, 'Override');
  assert.ok(P.complete({ 'run-dir': runDir, _: ['complete', 'gate'] }).ok);
});

test('gate ready is accepted only when all four conditions are met', () => {
  const runDir = newRun();
  writeAnalysis(runDir, { clear: true });
  P.complete({ 'run-dir': runDir, _: ['complete', 'analysis'] });
  assert.strictEqual(P.gate({ 'run-dir': runDir, decision: 'ready' }).decision, 'Ready');
  assert.throws(() => { P.notice({ 'run-dir': runDir }); P.gate({ 'run-dir': runDir, decision: 'override', by: 'a', why: 'b', words: 'c' }); }, /gate is met/);
});

test('full SAMPLE run passes every validator and the summary lists what was not sent', () => {
  const runDir = newRun();
  writeAnalysis(runDir);
  P.complete({ 'run-dir': runDir, _: ['complete', 'analysis'] });
  P.notice({ 'run-dir': runDir });
  P.gate({ 'run-dir': runDir, decision: 'override', by: 'Tester', why: 'demo', words: 'go ahead' });
  P.complete({ 'run-dir': runDir, _: ['complete', 'gate'] });

  const suiteFile = writeSuite(runDir, true);
  const tc = P.complete({ 'run-dir': runDir, _: ['complete', 'testcases'] });
  assert.ok(tc.ok, tc.errors.join('; '));

  const resultsFile = execute(runDir, suiteFile);
  const ex = P.complete({ 'run-dir': runDir, _: ['complete', 'execution'] });
  assert.ok(ex.ok, ex.errors.join('; '));

  const bugsDir = path.join(runDir, 'bugs');
  const triage = { storyId: 'SD-02', decisions: [{ testId: 'TC-LOGIN-001', decision: 'Bug', reason: 'prefix missing', severity: 'Medium', priority: 'P3' }] };
  fs.writeFileSync(path.join(bugsDir, 'triage.json'), JSON.stringify(triage));
  const BB = S('skill/4-BugReportSkill/scripts/build_bug_report.js');
  const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  const doc = BB.buildBugs({ results, resultsFile, suite: JSON.parse(fs.readFileSync(suiteFile, 'utf8')), triage, outDir: bugsDir });
  BB.writeAll(doc, results, bugsDir);
  const bg = P.complete({ 'run-dir': runDir, _: ['complete', 'bugs'] });
  assert.ok(bg.ok, bg.errors.join('; '));

  S('skill/5-ExtentReportSkill/scripts/build_extent_report.js').buildReport({ resultsFile, suiteFile, bugsFile: path.join(bugsDir, 'bugs.json'), outFile: path.join(runDir, 'report', 'report.html') });
  const rp = P.complete({ 'run-dir': runDir, _: ['complete', 'report'] });
  assert.ok(rp.ok, rp.errors.join('; '));

  P.note({ 'run-dir': runDir, text: 'No data created.' });
  P.summary({ 'run-dir': runDir });
  const sm = P.complete({ 'run-dir': runDir, _: ['complete', 'summary'] });
  assert.ok(sm.ok, sm.errors.join('; '));
  const md = fs.readFileSync(path.join(runDir, 'summary', 'run-summary.md'), 'utf8');
  assert.match(md, /SAMPLE RUN/);
  assert.match(md, /TESTER OVERRIDE/);
  assert.match(md, /BUG-001: .*not posted/);
  assert.match(md, /Impacted modules:\*\* 1 cases: Passed 1/);
});

test('the report validator catches a report whose numbers differ from the results', () => {
  const runDir = newRun();
  writeAnalysis(runDir);
  P.complete({ 'run-dir': runDir, _: ['complete', 'analysis'] });
  P.notice({ 'run-dir': runDir });
  P.gate({ 'run-dir': runDir, decision: 'override', by: 'T', why: 'w', words: 'x' });
  P.complete({ 'run-dir': runDir, _: ['complete', 'gate'] });
  const suiteFile = writeSuite(runDir, true);
  const resultsFile = execute(runDir, suiteFile);
  const R = S('skill/5-ExtentReportSkill/scripts/render.js');
  const out = path.join(runDir, 'report', 'report.html');
  S('skill/5-ExtentReportSkill/scripts/build_extent_report.js').buildReport({ resultsFile, suiteFile, outFile: out });
  const html = fs.readFileSync(out, 'utf8');
  const data = R.extractData(html);
  data.summary.Failed = 0; data.summary.Passed = 2;
  fs.writeFileSync(out, R.renderPage(data));
  const st = P.status({ 'run-dir': runDir });
  const r = P.checkStage(runDir, st, 'report');
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /report Failed=0/.test(e)));
});

test('the suite override label must match the gate decision', () => {
  const runDir = newRun();
  writeAnalysis(runDir);
  P.complete({ 'run-dir': runDir, _: ['complete', 'analysis'] });
  P.notice({ 'run-dir': runDir });
  P.gate({ 'run-dir': runDir, decision: 'override', by: 'T', why: 'w', words: 'x' });
  P.complete({ 'run-dir': runDir, _: ['complete', 'gate'] });
  writeSuite(runDir, false);
  const r = P.complete({ 'run-dir': runDir, _: ['complete', 'testcases'] });
  assert.ok(r.errors.some((e) => /suite override=false/.test(e)));
  assert.ok(r.errors.some((e) => /Ready while question Q-01 is Open/.test(e)));
});

test('record-post and jira writes are refused for SAMPLE runs', () => {
  const runDir = newRun();
  assert.throws(() => P.recordPost({ 'run-dir': runDir, what: 'x', target: 'y' }), /SAMPLE/);
  assert.throws(() => J.guardRun(runDir), /SAMPLE/);
});

test('jira toAdf builds headings, lists and paragraphs; adfToText reads them back', () => {
  const adf = J.toAdf('h3. Steps\n1. Open\n2. Click\n- note **bold**\nplain');
  assert.deepStrictEqual(adf.content.map((n) => n.type), ['heading', 'orderedList', 'bulletList', 'paragraph']);
  assert.strictEqual(adf.content[1].content.length, 2);
  assert.match(J.adfToText(adf), /Open/);
});
