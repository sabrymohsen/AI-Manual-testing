'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../record_result');
const { validateResults } = require('../validate_results');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-rec-'));
  const suite = {
    suiteId: 'TS-LOGIN-001', storyId: 'SD-02', storyTitle: 'Clear login errors', epic: 'SauceDemo', sample: true,
    testCases: [
      { id: 'TC-LOGIN-001', title: 'Empty username', scope: 'Target', status: 'Ready', priority: 'P1',
        steps: [{ action: 'Open login page', expected: 'Login form shows' }, { action: 'Click Login', expected: 'Username is required' }] },
      { id: 'TC-LOGIN-002', title: 'Login still works', scope: 'Impacted', impactRef: 'IM-01', status: 'Ready', priority: 'P1',
        steps: [{ action: 'Log in as standard_user', expected: 'Products page' }] },
      { id: 'TC-LOGIN-003', title: 'Needs account', scope: 'Target', status: 'Blocked', blockedReason: 'Q-02 open', priority: 'P2',
        steps: [{ action: 'x', expected: 'y' }] },
    ],
  };
  const suitePath = path.join(dir, 'suite.json');
  fs.writeFileSync(suitePath, JSON.stringify(suite));
  const out = path.join(dir, 'run');
  R.start({ out, suite: suitePath, baseUrl: 'https://www.saucedemo.com' });
  fs.writeFileSync(path.join(out, 'evidence', 'shot.png'), 'png');
  return { dir, out, suitePath };
}

test('start creates a running record with a named session and refuses a second start', () => {
  const { out, suitePath } = fixture();
  const run = JSON.parse(fs.readFileSync(R.resultsPath(out), 'utf8'));
  assert.strictEqual(run.status, 'running');
  assert.match(run.session, /^qa-sd-02-/);
  assert.throws(() => R.start({ out, suite: suitePath, baseUrl: 'https://www.saucedemo.com' }), /already in progress/);
});

test('start refuses a base URL outside the approved hosts', () => {
  const { dir, suitePath } = fixture();
  assert.throws(() => R.start({ out: path.join(dir, 'r2'), suite: suitePath, baseUrl: 'https://example.com', hosts: 'saucedemo.com' }), /outside the approved hosts/);
});

test('a Blocked test case cannot be begun', () => {
  const { out } = fixture();
  assert.throws(() => R.begin({ out, test: 'TC-LOGIN-003' }), /not Ready/);
});

test('Passed needs every step passed and a screenshot', () => {
  const { out } = fixture();
  R.begin({ out, test: 'TC-LOGIN-001' });
  R.step({ out, test: 'TC-LOGIN-001', n: 1, status: 'pass', actual: 'Form shown' });
  assert.throws(() => R.end({ out, test: 'TC-LOGIN-001', status: 'Passed' }), /not recorded/);
  R.step({ out, test: 'TC-LOGIN-001', n: 2, status: 'pass', actual: 'Epic sadface: Username is required' });
  assert.throws(() => R.end({ out, test: 'TC-LOGIN-001', status: 'Passed' }), /screenshot/);
  const r = R.end({ out, test: 'TC-LOGIN-001', status: 'Passed', screenshot: 'evidence/shot.png' });
  assert.strictEqual(r.status, 'Passed');
});

test('a step needs the actual result and a real screenshot file', () => {
  const { out } = fixture();
  R.begin({ out, test: 'TC-LOGIN-001' });
  assert.throws(() => R.step({ out, test: 'TC-LOGIN-001', n: 1, status: 'pass' }), /--actual is required/);
  assert.throws(() => R.step({ out, test: 'TC-LOGIN-001', n: 1, status: 'pass', actual: 'x', screenshot: 'evidence/nope.png' }), /not found/);
});

test('Failed needs a failing step; error steps make it an Error, not a Failure', () => {
  const { out } = fixture();
  R.begin({ out, test: 'TC-LOGIN-001' });
  R.step({ out, test: 'TC-LOGIN-001', n: 1, status: 'error', actual: 'snapshot returned no page' });
  assert.throws(() => R.end({ out, test: 'TC-LOGIN-001', status: 'Failed', screenshot: 'evidence/shot.png' }), /no step is recorded as "fail"/);
  assert.throws(() => R.end({ out, test: 'TC-LOGIN-001', status: 'Error' }), /--reason/);
  assert.strictEqual(R.end({ out, test: 'TC-LOGIN-001', status: 'Error', reason: 'driver crash' }).status, 'Error');
});

test('a product failure is never retried; an infra Error gets one retry and a pass becomes Flaky', () => {
  const { out } = fixture();
  R.begin({ out, test: 'TC-LOGIN-002' });
  R.step({ out, test: 'TC-LOGIN-002', n: 1, status: 'error', actual: 'net::ERR_CONNECTION_RESET' });
  R.end({ out, test: 'TC-LOGIN-002', status: 'Error', reason: 'connection reset', infra: true });
  R.begin({ out, test: 'TC-LOGIN-002', retry: true });
  R.step({ out, test: 'TC-LOGIN-002', n: 1, status: 'pass', actual: 'Products', screenshot: 'evidence/shot.png' });
  assert.strictEqual(R.end({ out, test: 'TC-LOGIN-002', status: 'Passed' }).status, 'Flaky');
  assert.throws(() => R.begin({ out, test: 'TC-LOGIN-002', retry: true }), /single retry/);

  R.begin({ out, test: 'TC-LOGIN-001' });
  R.step({ out, test: 'TC-LOGIN-001', n: 1, status: 'pass', actual: 'ok' });
  R.step({ out, test: 'TC-LOGIN-001', n: 2, status: 'fail', actual: 'No message', screenshot: 'evidence/shot.png' });
  R.end({ out, test: 'TC-LOGIN-001', status: 'Failed' });
  assert.throws(() => R.begin({ out, test: 'TC-LOGIN-001', retry: true }), /never retried/);
});

test('finish marks Blocked and Not Run honestly and the record validates', () => {
  const { out } = fixture();
  R.begin({ out, test: 'TC-LOGIN-001' });
  R.step({ out, test: 'TC-LOGIN-001', n: 1, status: 'pass', actual: 'ok' });
  R.step({ out, test: 'TC-LOGIN-001', n: 2, status: 'pass', actual: 'ok', screenshot: 'evidence/shot.png' });
  R.end({ out, test: 'TC-LOGIN-001', status: 'Passed' });
  const run = R.finish({ out });
  assert.strictEqual(run.results.find((r) => r.id === 'TC-LOGIN-003').status, 'Blocked');
  assert.strictEqual(run.results.find((r) => r.id === 'TC-LOGIN-002').status, 'Not Run');
  const v = validateResults(R.resultsPath(out));
  assert.ok(v.ok, v.errors.join('; '));
  assert.strictEqual(v.warnings.length, 1);
});

test('a test begun but never ended becomes an Error at finish', () => {
  const { out } = fixture();
  R.begin({ out, test: 'TC-LOGIN-002' });
  const run = R.finish({ out });
  const r = run.results.find((x) => x.id === 'TC-LOGIN-002');
  assert.strictEqual(r.status, 'Error');
  assert.match(r.reason, /never ended/);
});

test('the validator catches a changed expected result and a tampered summary', () => {
  const { out } = fixture();
  R.begin({ out, test: 'TC-LOGIN-001' });
  R.step({ out, test: 'TC-LOGIN-001', n: 1, status: 'pass', actual: 'ok' });
  R.step({ out, test: 'TC-LOGIN-001', n: 2, status: 'pass', actual: 'ok', screenshot: 'evidence/shot.png' });
  R.end({ out, test: 'TC-LOGIN-001', status: 'Passed' });
  R.finish({ out });
  const run = JSON.parse(fs.readFileSync(R.resultsPath(out), 'utf8'));
  run.results[0].steps[1].expected = 'whatever the page said';
  run.summary.Passed = 3;
  fs.writeFileSync(R.resultsPath(out), JSON.stringify(run));
  const v = validateResults(R.resultsPath(out));
  assert.ok(!v.ok);
  assert.ok(v.errors.some((e) => /Never change an expected result/.test(e)));
  assert.ok(v.errors.some((e) => /Summary count Passed/.test(e)));
});

test('note appends to a result without changing its status, also after finish', () => {
  const { out } = fixture();
  R.begin({ out, test: 'TC-LOGIN-002' });
  R.step({ out, test: 'TC-LOGIN-002', n: 1, status: 'pass', actual: 'Products', screenshot: 'evidence/shot.png' });
  R.end({ out, test: 'TC-LOGIN-002', status: 'Passed', note: 'console: 0 errors' });
  R.finish({ out });
  const r = R.note({ out, test: 'TC-LOGIN-002', text: 'console: 2 third-party 401s' });
  assert.strictEqual(r.status, 'Passed');
  assert.strictEqual(r.note, 'console: 0 errors | console: 2 third-party 401s');
  assert.throws(() => R.note({ out, test: 'TC-LOGIN-002' }), /--text is required/);
});
