'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateSuite } = require('../validate_testcases');
const { toCsv, toMarkdown } = require('../build_testcases');

const base = () => ({
  suiteId: 'TS-LOGIN-001', storyId: 'SD-02', storyTitle: 't', baseUrl: 'https://www.saucedemo.com', override: false,
  acceptanceCriteria: [{ id: 'AC-1', text: 'x' }],
  testCases: [
    { id: 'TC-LOGIN-001', title: 'a', scope: 'Target', acRef: ['AC-1'], priority: 'P1', status: 'Ready', steps: [{ action: 'do', expected: 'see' }], expectedResult: 'see' },
    { id: 'TC-LOGIN-002', title: 'b', scope: 'Impacted', impactRef: 'IM-01', priority: 'P1', status: 'Ready', steps: [{ action: 'do', expected: 'see' }], expectedResult: 'see' },
  ],
});
const impact = { impacts: [{ id: 'IM-01', level: 'Critical' }, { id: 'IM-02', level: 'High' }, { id: 'IM-03', level: 'Low' }] };

test('every Critical/High impact needs an Impacted case; Low does not', () => {
  const r = validateSuite(base(), { impact });
  assert.ok(!r.ok);
  assert.deepStrictEqual(r.errors, ['IM-02 (High) has no Impacted test case. Every Critical and High impact needs one.']);
});

test('every AC needs a Target case', () => {
  const s = base();
  s.acceptanceCriteria.push({ id: 'AC-2', text: 'y' });
  assert.ok(validateSuite(s, {}).errors.includes('AC-2 has no Target test case'));
});

test('a Ready case on an Open question is refused without an override, allowed with one', () => {
  const s = base();
  s.testCases[0].questionRef = ['Q-01'];
  const questions = { questions: [{ id: 'Q-01', status: 'Open' }] };
  assert.ok(validateSuite(s, { questions }).errors.some((e) => /Ready while question Q-01 is Open/.test(e)));
  s.override = true; s.overrideNote = 'T, today: demo';
  assert.ok(!validateSuite(s, { questions }).errors.some((e) => /Q-01/.test(e)));
});

test('Blocked needs a reason; ids and the last expected result are checked', () => {
  const s = base();
  s.testCases[0].status = 'Blocked';
  s.testCases[1].id = 'TC-1';
  s.testCases[1].steps = [{ action: 'do', expected: '' }];
  const e = validateSuite(s, {}).errors;
  assert.ok(e.some((x) => /Blocked needs blockedReason/.test(x)));
  assert.ok(e.some((x) => /TC-<AREA>-<nnn>/.test(x)));
  assert.ok(e.some((x) => /last step must have an expected/.test(x)));
});

test('CSV quotes commas and quotes; Markdown carries the override banner', () => {
  const s = base();
  s.testCases[0].steps[0].expected = 'He said "hi", then left';
  assert.match(toCsv(s), /"He said ""hi"", then left"/);
  s.override = true; s.overrideNote = 'by T';
  assert.match(toMarkdown(s), /TESTER OVERRIDE/);
});
