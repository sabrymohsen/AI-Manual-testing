'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildBugs, writeAll } = require('../build_bug_report');
const { validateBugs } = require('../validate_bugs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-bugs-'));
  const run = path.join(dir, 'execution', 'run');
  fs.mkdirSync(path.join(run, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(run, 'evidence', 'f.png'), 'png');
  const suite = { suiteId: 'TS-X-001', storyId: 'SD-02', sample: true, testCases: [
    { id: 'TC-X-001', title: 'Empty password', scope: 'Target', steps: [{ action: 'Open', expected: '' }, { action: 'Click Login', expected: 'Password is required' }], expectedResult: 'Password is required' },
    { id: 'TC-X-002', title: 'Login works', scope: 'Impacted', impactRef: 'IM-01', steps: [{ action: 'Log in', expected: 'Products' }], expectedResult: 'Products' },
    { id: 'TC-X-003', title: 'Blocked one', scope: 'Target', steps: [{ action: 'x', expected: 'y' }], expectedResult: 'y' }] };
  const results = { baseUrl: 'https://www.saucedemo.com', session: 's', headed: false, summary: { total: 3, Failed: 2, Blocked: 1 }, results: [
    { id: 'TC-X-001', status: 'Failed', steps: [{ n: 1, status: 'pass', actual: 'ok' }, { n: 2, status: 'fail', expected: 'Password is required', actual: 'Epic sadface: Password is required' }], evidence: ['evidence/f.png'] },
    { id: 'TC-X-002', status: 'Failed', steps: [{ n: 1, status: 'fail', expected: 'Products', actual: 'Login page' }], evidence: ['evidence/f.png'] },
    { id: 'TC-X-003', status: 'Blocked', steps: [], evidence: [] }] };
  const rf = path.join(run, 'results.json');
  fs.writeFileSync(rf, JSON.stringify(results));
  return { dir, rf, results, suite, bugsDir: path.join(dir, 'bugs') };
}

test('only Bug decisions become bugs; an Impacted failure is a regression; evidence paths resolve from bugs/', () => {
  const f = fixture();
  const triage = { decisions: [
    { testId: 'TC-X-001', decision: 'RequirementIssue', reason: 'prefix question Q-01' },
    { testId: 'TC-X-002', decision: 'Bug', reason: 'valid login broken', severity: 'Critical', priority: 'P1', title: 'Valid login fails' }] };
  fs.mkdirSync(f.bugsDir, { recursive: true });
  fs.writeFileSync(path.join(f.bugsDir, 'triage.json'), JSON.stringify(triage));
  const doc = buildBugs({ results: f.results, resultsFile: f.rf, suite: f.suite, triage, outDir: f.bugsDir });
  writeAll(doc, f.results, f.bugsDir);
  assert.strictEqual(doc.bugs.length, 1);
  assert.strictEqual(doc.bugs[0].id, 'BUG-001');
  assert.ok(doc.bugs[0].regression);
  assert.ok(doc.bugs[0].labels.includes('regression') && doc.bugs[0].labels.includes('SAMPLE'));
  assert.strictEqual(doc.bugs[0].evidence[0], '../execution/run/evidence/f.png');
  const v = validateBugs(path.join(f.bugsDir, 'bugs.json'), { results: f.rf });
  assert.ok(v.ok, v.errors.join('; '));
});

test('steps to reproduce stop at the failing step; expected and actual are the step values', () => {
  const f = fixture();
  const triage = { decisions: [{ testId: 'TC-X-001', decision: 'Bug', reason: 'r', severity: 'Medium', priority: 'P3' }, { testId: 'TC-X-002', decision: 'Environment', reason: 'site down' }] };
  const b = buildBugs({ results: f.results, resultsFile: f.rf, suite: f.suite, triage, outDir: f.bugsDir }).bugs[0];
  assert.deepStrictEqual(b.stepsToReproduce, ['Open', 'Click Login']);
  assert.strictEqual(b.expected, 'Password is required');
  assert.strictEqual(b.actual, 'Epic sadface: Password is required');
});

test('an untriaged Failed result and a Bug from a Blocked result are both rejected', () => {
  const f = fixture();
  const triage = { decisions: [{ testId: 'TC-X-003', decision: 'Bug', reason: 'r', severity: 'Low', priority: 'P4' }] };
  fs.mkdirSync(f.bugsDir, { recursive: true });
  fs.writeFileSync(path.join(f.bugsDir, 'triage.json'), JSON.stringify(triage));
  writeAll(buildBugs({ results: f.results, resultsFile: f.rf, suite: f.suite, triage, outDir: f.bugsDir }), f.results, f.bugsDir);
  const v = validateBugs(path.join(f.bugsDir, 'bugs.json'), { results: f.rf });
  assert.ok(!v.ok);
  assert.ok(v.errors.some((e) => /TC-X-001 \(Failed\) has no triage decision/.test(e)));
  assert.ok(v.errors.some((e) => /a Bug from a Blocked result/.test(e)));
});

test('triage naming an unknown test fails loudly', () => {
  const f = fixture();
  assert.throws(() => buildBugs({ results: f.results, resultsFile: f.rf, suite: f.suite, triage: { decisions: [{ testId: 'TC-NOPE-1', decision: 'Bug' }] }, outDir: f.bugsDir }), /not in the results/);
});

test('zero findings give an empty, valid bug list', () => {
  const f = fixture();
  f.results.results = f.results.results.map((r) => ({ ...r, status: r.status === 'Failed' ? 'Passed' : r.status }));
  fs.writeFileSync(f.rf, JSON.stringify(f.results));
  fs.mkdirSync(f.bugsDir, { recursive: true });
  fs.writeFileSync(path.join(f.bugsDir, 'triage.json'), JSON.stringify({ decisions: [] }));
  writeAll(buildBugs({ results: f.results, resultsFile: f.rf, suite: f.suite, triage: { decisions: [] }, outDir: f.bugsDir }), f.results, f.bugsDir);
  assert.ok(validateBugs(path.join(f.bugsDir, 'bugs.json'), { results: f.rf }).ok);
});

test('observations and the override banner reach bugs-summary.md, never as bugs', () => {
  const f = fixture();
  f.suite.override = true;
  const triage = { decisions: [{ testId: 'TC-X-001', decision: 'RequirementIssue', reason: 'Q-01' }, { testId: 'TC-X-002', decision: 'Environment', reason: 'down' }],
    observations: [{ testId: 'TC-X-002', text: 'cookie set after rejected login', followUp: 'open /inventory.html directly' }] };
  fs.mkdirSync(f.bugsDir, { recursive: true });
  const doc = buildBugs({ results: f.results, resultsFile: f.rf, suite: f.suite, triage, outDir: f.bugsDir });
  writeAll(doc, f.results, f.bugsDir);
  assert.strictEqual(doc.bugs.length, 0);
  const md = fs.readFileSync(path.join(f.bugsDir, 'bugs-summary.md'), 'utf8');
  assert.match(md, /TESTER OVERRIDE/);
  assert.match(md, /Observations for follow-up[\s\S]*TC-X-002: cookie set after rejected login Follow-up: open \/inventory\.html directly/);
});
