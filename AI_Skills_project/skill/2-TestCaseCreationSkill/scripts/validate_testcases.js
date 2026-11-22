#!/usr/bin/env node
'use strict';
// validate_testcases.js <suite.json> [--impact <ID>-impact.json] [--questions <ID>-questions.json] [--json]
// Stage 3 validator. A suite is valid only when every case is well formed, every acceptance
// criterion has a Target case, and every Critical/High impact has an Impacted case.
const fs = require('fs');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true; else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

const CASE_STATUSES = ['Ready', 'Blocked', 'Draft'];
const SCOPES = ['Target', 'Impacted'];
const PRIORITIES = ['P1', 'P2', 'P3'];
const TYPES = ['Positive', 'Negative', 'Boundary', 'Regression', 'Usability', 'Security', 'Accessibility', 'Performance'];

function validateSuite(suite, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!/^TS-[A-Z0-9]+-\d{3}$/.test(suite.suiteId || '')) errors.push('suiteId must look like TS-<AREA>-<nnn>');
  for (const k of ['storyId', 'storyTitle', 'baseUrl']) if (!suite[k]) errors.push(`${k} is missing`);
  if (suite.override && !suite.overrideNote) errors.push('override is true but overrideNote (who, why, when) is missing');
  if (!Array.isArray(suite.testCases) || !suite.testCases.length) return { ok: false, errors: [...errors, 'testCases must be a non-empty array'], warnings };

  const openQ = new Set(((opts.questions && opts.questions.questions) || []).filter((q) => q.status === 'Open').map((q) => q.id));
  const allQ = new Set(((opts.questions && opts.questions.questions) || []).map((q) => q.id));
  const ids = new Set();
  for (const tc of suite.testCases) {
    const w = tc.id || '(no id)';
    if (!/^TC-[A-Z0-9]+-\d{3}$/.test(tc.id || '')) errors.push(`${w}: id must look like TC-<AREA>-<nnn>`);
    if (ids.has(tc.id)) errors.push(`${w}: duplicate id`);
    ids.add(tc.id);
    if (!tc.title) errors.push(`${w}: title is missing`);
    if (!SCOPES.includes(tc.scope)) errors.push(`${w}: scope must be Target or Impacted`);
    if (!CASE_STATUSES.includes(tc.status)) errors.push(`${w}: status must be Ready, Blocked or Draft`);
    if (!PRIORITIES.includes(tc.priority)) errors.push(`${w}: priority must be P1, P2 or P3`);
    if (tc.type && !TYPES.includes(tc.type)) warnings.push(`${w}: type "${tc.type}" is not one of ${TYPES.join(', ')}`);
    if (tc.scope === 'Impacted' && !tc.impactRef) errors.push(`${w}: an Impacted case needs impactRef (IM-xx)`);
    if (tc.scope === 'Target' && !(tc.acRef || []).length) errors.push(`${w}: a Target case needs acRef (AC-x)`);
    if (tc.status === 'Blocked' && !tc.blockedReason) errors.push(`${w}: Blocked needs blockedReason`);
    if (!Array.isArray(tc.steps) || !tc.steps.length) errors.push(`${w}: steps are missing`);
    else tc.steps.forEach((s, i) => {
      if (!s.action) errors.push(`${w} step ${i + 1}: action is missing`);
      if (s.expected === undefined) errors.push(`${w} step ${i + 1}: expected is missing (use "" for a pure action)`);
    });
    if (tc.steps && tc.steps.length && !tc.steps[tc.steps.length - 1].expected) errors.push(`${w}: the last step must have an expected result`);
    if (!tc.expectedResult) errors.push(`${w}: expectedResult is missing`);
    for (const q of tc.questionRef || []) {
      if (opts.questions && !allQ.has(q)) errors.push(`${w}: questionRef ${q} is not in the questions file`);
      if (openQ.has(q) && tc.status === 'Ready' && !suite.override) {
        errors.push(`${w}: Ready while question ${q} is Open. Block it, or the user records an override at the gate.`);
      }
    }
    if (tc.expectedSource === 'observation' && !suite.observationDerived) errors.push(`${w}: expected result comes from observation but the suite is not labelled observationDerived`);
    const text = JSON.stringify(tc.testData || {});
    if (/\b\d{13,19}\b/.test(text) && !/4111111111111111|4242424242424242|0000/.test(text)) warnings.push(`${w}: test data contains a long number. Use fake card data only.`);
  }

  const acs = suite.acceptanceCriteria || [];
  if (!acs.length) warnings.push('No acceptanceCriteria listed in the suite: AC coverage cannot be checked.');
  for (const ac of acs) {
    if (!suite.testCases.some((tc) => tc.scope === 'Target' && (tc.acRef || []).includes(ac.id))) errors.push(`${ac.id} has no Target test case`);
  }

  const coverage = [];
  if (opts.impact) {
    const imIds = new Set((opts.impact.impacts || []).map((i) => i.id));
    for (const tc of suite.testCases) if (tc.impactRef && !imIds.has(tc.impactRef)) errors.push(`${tc.id}: impactRef ${tc.impactRef} is not in the impact file`);
    for (const im of opts.impact.impacts || []) {
      const cases = suite.testCases.filter((tc) => tc.scope === 'Impacted' && tc.impactRef === im.id).map((tc) => tc.id);
      coverage.push({ impact: im.id, level: im.level, cases });
      if (['Critical', 'High'].includes(im.level) && !cases.length) errors.push(`${im.id} (${im.level}) has no Impacted test case. Every Critical and High impact needs one.`);
    }
  } else warnings.push('No --impact file given: impacted-module coverage was not checked.');

  const counts = { total: suite.testCases.length };
  for (const s of CASE_STATUSES) counts[s] = suite.testCases.filter((t) => t.status === s).length;
  for (const s of SCOPES) counts[s] = suite.testCases.filter((t) => t.scope === s).length;
  return { ok: errors.length === 0, errors, warnings, counts, coverage };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0]) { process.stderr.write('Usage: validate_testcases.js <suite.json> [--impact impact.json] [--questions questions.json] [--json]\n'); process.exit(2); }
  let res;
  try {
    res = validateSuite(readJson(args._[0]), { impact: args.impact ? readJson(args.impact) : null, questions: args.questions ? readJson(args.questions) : null });
  } catch (e) { res = { ok: false, errors: [e.message], warnings: [] }; }
  if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    process.stdout.write(`${res.ok ? 'VALID' : 'INVALID'}: ${args._[0]}${res.counts ? `  ${JSON.stringify(res.counts)}` : ''}\n`);
    for (const c of res.coverage || []) process.stdout.write(`  ${c.impact} ${c.level}: ${c.cases.join(', ') || 'no case'}\n`);
    for (const e of res.errors) process.stdout.write(`  error: ${e}\n`);
    for (const w of res.warnings) process.stdout.write(`  warning: ${w}\n`);
  }
  process.exit(res.ok ? 0 : 1);
}

module.exports = { validateSuite };
