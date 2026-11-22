#!/usr/bin/env node
'use strict';
// validate_bugs.js <bugs dir>/bugs.json --results <results.json> [--triage <triage.json>] [--json]
// Stage 5 validator: every Failed/Flaky/Error result is triaged, bugs come only from real findings,
// and every bug is complete. Exit 0 = valid.
const fs = require('fs');
const path = require('path');
const { DECISIONS, SEVERITIES, PRIORITIES } = require('./build_bug_report');

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

function validateBugs(bugsFile, opts = {}) {
  const errors = [];
  const warnings = [];
  let doc;
  try { doc = readJson(bugsFile); } catch (e) { return { ok: false, errors: [e.message], warnings }; }
  const dir = path.dirname(path.resolve(bugsFile));
  const results = opts.results ? readJson(opts.results) : null;
  const triagePath = opts.triage || path.join(dir, 'triage.json');
  const triage = fs.existsSync(triagePath) ? readJson(triagePath) : null;
  if (!triage) errors.push('triage.json is missing: every finding needs a recorded decision.');

  if (results) {
    const decided = new Map(((triage && triage.decisions) || []).map((d) => [d.testId, d]));
    for (const r of results.results) {
      if (['Failed', 'Flaky', 'Error'].includes(r.status) && !decided.has(r.id)) errors.push(`${r.id} (${r.status}) has no triage decision.`);
      if (r.status === 'Passed' && r.note && !decided.has(r.id)) warnings.push(`${r.id} passed with a note ("${r.note}"): consider triaging it (console error?).`);
    }
    for (const d of (triage && triage.decisions) || []) {
      const r = results.results.find((x) => x.id === d.testId);
      if (!DECISIONS.includes(d.decision)) errors.push(`${d.testId}: unknown decision "${d.decision}"`);
      if (!d.reason) errors.push(`${d.testId}: decision without a reason`);
      if (!r) { errors.push(`${d.testId}: not in the results`); continue; }
      if (d.decision === 'Bug') {
        const ok = ['Failed', 'Flaky'].includes(r.status) || (r.status === 'Error' && d.productEvidence) || (r.status === 'Passed' && d.source === 'console' && r.note);
        if (!ok) errors.push(`${d.testId}: a Bug from a ${r.status} result. Bugs come from confirmed findings only (Failed/Flaky; Error needs productEvidence; Passed needs a console note).`);
      }
      if (d.decision === 'Duplicate' && !d.duplicateOf) errors.push(`${d.testId}: Duplicate needs duplicateOf`);
    }
  }

  const ids = new Set();
  for (const b of doc.bugs || []) {
    const w = b.id || '(no id)';
    if (!/^BUG-\d{3}$/.test(b.id || '')) errors.push(`${w}: id must look like BUG-001`);
    if (ids.has(b.id)) errors.push(`${w}: duplicate id`);
    ids.add(b.id);
    for (const k of ['title', 'testId', 'storyId', 'expected', 'actual']) if (!b[k]) errors.push(`${w}: ${k} is missing`);
    if (!SEVERITIES.includes(b.severity)) errors.push(`${w}: severity must be ${SEVERITIES.join('/')}`);
    if (!PRIORITIES.includes(b.priority)) errors.push(`${w}: priority must be ${PRIORITIES.join('/')}`);
    if (!(b.stepsToReproduce || []).length) errors.push(`${w}: no steps to reproduce`);
    if (!(b.evidence || []).length) errors.push(`${w}: no evidence`);
    for (const e of b.evidence || []) if (!fs.existsSync(path.resolve(dir, e))) errors.push(`${w}: evidence missing on disk: ${e}`);
    if (b.regression !== (b.scope === 'Impacted')) errors.push(`${w}: an Impacted failure must be marked as a regression (and only those)`);
    if (doc.sample && !(b.labels || []).includes('SAMPLE')) errors.push(`${w}: SAMPLE bug without the SAMPLE label`);
    if (b.jiraKey && b.status === 'Draft') warnings.push(`${w}: has a Jira key but is still Draft`);
    for (const f of [`${b.id}.md`, `${b.id}.jira.txt`]) if (!fs.existsSync(path.join(dir, f))) errors.push(`${w}: ${f} is missing`);
  }
  if (!fs.existsSync(path.join(dir, 'bugs-summary.md'))) errors.push('bugs-summary.md is missing');
  return { ok: errors.length === 0, errors, warnings, count: (doc.bugs || []).length };
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  if (!a._[0]) { process.stderr.write('Usage: validate_bugs.js <bugs.json> --results <results.json> [--triage triage.json] [--json]\n'); process.exit(2); }
  const res = validateBugs(a._[0], { results: a.results, triage: a.triage });
  if (a.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    process.stdout.write(`${res.ok ? 'VALID' : 'INVALID'}: ${a._[0]} (${res.count || 0} bugs)\n`);
    for (const e of res.errors) process.stdout.write(`  error: ${e}\n`);
    for (const w of res.warnings) process.stdout.write(`  warning: ${w}\n`);
  }
  process.exit(res.ok ? 0 : 1);
}

module.exports = { validateBugs };
