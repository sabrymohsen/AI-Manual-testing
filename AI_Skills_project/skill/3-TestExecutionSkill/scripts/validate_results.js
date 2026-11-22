#!/usr/bin/env node
'use strict';
// validate_results.js <results.json> [--suite <suite.json>] [--json]
// Checks that an execution record is complete and honest. Exit 0 = valid, 1 = invalid.
const fs = require('fs');
const path = require('path');
const L = require('./lib');

function validateResults(resultsFile, opts = {}) {
  const errors = [];
  const warnings = [];
  let run;
  try { run = L.readJson(resultsFile); } catch (e) { return { ok: false, errors: [e.message], warnings }; }
  const dir = path.dirname(path.resolve(resultsFile));
  const suitePath = opts.suite || run.suitePath;
  let suite = null;
  try { suite = L.readJson(suitePath); } catch (e) { errors.push(`Cannot read suite ${suitePath}: ${e.message}`); }

  if (run.status !== 'complete') errors.push(`Run status is "${run.status}", not "complete". Run "record_result.js finish".`);
  if (!Array.isArray(run.results)) return { ok: false, errors: [...errors, 'results is not an array'], warnings };
  if (!run.session || run.session === 'default') errors.push('The run has no named browser session (the "default" session is not allowed).');

  const idx = suite ? L.testCaseIndex(suite) : new Map();
  if (suite) {
    for (const tc of suite.testCases || []) {
      if (!run.results.find((r) => r.id === tc.id)) errors.push(`${tc.id} is in the suite but has no result.`);
    }
    if (!!suite.override !== !!run.override) errors.push('Override label differs between the suite and the results.');
    if (!!suite.sample !== !!run.sample) errors.push('SAMPLE label differs between the suite and the results.');
  }

  for (const r of run.results) {
    const tc = idx.get(r.id);
    const where = r.id;
    if (!L.RESULT_STATUSES.includes(r.status)) { errors.push(`${where}: unknown status "${r.status}".`); continue; }
    if (tc && tc.status === 'Blocked' && r.status !== 'Blocked') errors.push(`${where}: Blocked test case has status ${r.status}. Blocked cases are never run.`);
    if (tc && tc.status === 'Blocked' && r.steps.length) errors.push(`${where}: Blocked test case has recorded steps. It must not be run.`);
    if (tc && tc.status !== 'Ready' && ['Passed', 'Failed', 'Flaky'].includes(r.status)) errors.push(`${where}: test case is ${tc.status} but has a ${r.status} result. Only Ready cases run.`);
    if (['Passed', 'Flaky'].includes(r.status)) {
      if (tc && r.steps.length !== tc.steps.length) errors.push(`${where}: ${r.status} with ${r.steps.length}/${tc.steps.length} steps recorded.`);
      if (r.steps.some((s) => s.status !== 'pass')) errors.push(`${where}: ${r.status} but a step did not pass.`);
    }
    if (r.status === 'Failed' && !r.steps.some((s) => s.status === 'fail')) errors.push(`${where}: Failed without a failing step.`);
    if (r.status === 'Failed' && r.steps.some((s) => s.status === 'error')) errors.push(`${where}: Failed but has error steps: that is an Error.`);
    if (r.status === 'Error' && !r.reason) errors.push(`${where}: Error without a reason.`);
    if (r.status === 'Flaky' && !(r.attempts > 1)) errors.push(`${where}: Flaky needs a retry (attempts > 1).`);
    if (['Passed', 'Failed', 'Flaky'].includes(r.status) && !(r.evidence || []).length) errors.push(`${where}: ${r.status} without screenshot evidence.`);
    for (const s of r.steps || []) {
      if (s.status !== 'skip' && !s.actual) errors.push(`${where} step ${s.n}: no actual result recorded.`);
      if (tc && tc.steps[s.n - 1] && s.expected !== (tc.steps[s.n - 1].expected || '')) {
        errors.push(`${where} step ${s.n}: expected result differs from the suite. Never change an expected result.`);
      }
    }
    for (const ev of r.evidence || []) {
      if (!fs.existsSync(path.resolve(dir, ev))) errors.push(`${where}: evidence file missing: ${ev}`);
    }
    if (r.status === 'Not Run') warnings.push(`${where}: Ready but never run.`);
  }

  const s = L.summarize(run.results);
  if (run.summary) {
    for (const k of ['total', ...L.RESULT_STATUSES]) {
      if (run.summary[k] !== s[k]) errors.push(`Summary count ${k}=${run.summary[k]} does not match the results (${s[k]}).`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, summary: s };
}

if (require.main === module) {
  const args = L.parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file) L.fail('Usage: validate_results.js <results.json> [--suite <suite.json>] [--json]');
  const res = validateResults(file, { suite: args.suite });
  if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    process.stdout.write(`${res.ok ? 'VALID' : 'INVALID'}: ${file}\n`);
    for (const e of res.errors) process.stdout.write(`  error: ${e}\n`);
    for (const w of res.warnings) process.stdout.write(`  warning: ${w}\n`);
    if (res.summary) process.stdout.write(`  summary: ${JSON.stringify(res.summary)}\n`);
  }
  process.exit(res.ok ? 0 : 1);
}

module.exports = { validateResults };
