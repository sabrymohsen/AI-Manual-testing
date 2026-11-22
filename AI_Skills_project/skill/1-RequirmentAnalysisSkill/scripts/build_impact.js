#!/usr/bin/env node
'use strict';
// build_impact.js <ID>-impact.json --check [--md <out.md>] [--questions <ID>-questions.json] [--fix]
// Validates the impact analysis and renders the impact matrix.
// Score = Likelihood (1-3) x Severity (1-3). Level: 9 Critical, 6 High, 3-4 Medium, 1-2 Low.
// Every impact needs an evidence quote OR a question id: an impact is never invented.
const fs = require('fs');
const U = require('./util');

const RELATIONS = ['depends-on', 'downstream', 'shared-component', 'shared-data', 'same-page', 'regression-area'];

function levelFor(score) {
  if (score >= 9) return 'Critical';
  if (score >= 6) return 'High';
  if (score >= 3) return 'Medium';
  return 'Low';
}

function checkImpact(doc, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: ['impact file is not an object'], warnings };
  if (!doc.storyId) errors.push('storyId is missing');
  if (!Array.isArray(doc.impacts)) return { ok: false, errors: [...errors, 'impacts must be an array'], warnings };
  const qIds = opts.questions ? new Set((opts.questions.questions || []).map((q) => q.id)) : null;
  const seen = new Set();
  for (const [i, im] of doc.impacts.entries()) {
    const w = im.id || `impacts[${i}]`;
    if (!/^IM-\d{2,}$/.test(im.id || '')) errors.push(`${w}: id must look like IM-01`);
    if (seen.has(im.id)) errors.push(`${w}: duplicate id`);
    seen.add(im.id);
    if (!im.module) errors.push(`${w}: module is missing`);
    if (im.relation && !RELATIONS.includes(im.relation)) warnings.push(`${w}: relation "${im.relation}" is not one of ${RELATIONS.join(', ')}`);
    for (const k of ['likelihood', 'severity']) {
      if (![1, 2, 3].includes(im[k])) errors.push(`${w}: ${k} must be 1, 2 or 3`);
    }
    const score = (im.likelihood || 0) * (im.severity || 0);
    if (opts.fix) { im.score = score; im.level = levelFor(score); }
    if (im.score !== score) errors.push(`${w}: score ${im.score} is not likelihood x severity (${score})`);
    if (im.level !== levelFor(score)) errors.push(`${w}: level "${im.level}" does not match score ${score} (${levelFor(score)})`);
    if (!im.evidence && !im.question) errors.push(`${w}: needs an evidence quote or a question id. Never invent an impact.`);
    if (im.question && qIds && !qIds.has(im.question)) errors.push(`${w}: question ${im.question} is not in the questions file`);
    if (!im.why) warnings.push(`${w}: no "why" explanation`);
    if (!im.testFocus) warnings.push(`${w}: no "testFocus" hint for test design`);
  }
  if (!doc.impacts.length) warnings.push('No impacts listed. If the story truly touches nothing else, say so in "noImpactReason".');
  if (!doc.impacts.length && !doc.noImpactReason) errors.push('An empty impact list needs "noImpactReason".');
  const byLevel = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const im of doc.impacts) if (byLevel[im.level] !== undefined) byLevel[im.level]++;
  return { ok: errors.length === 0, errors, warnings, byLevel };
}

function renderMatrix(doc) {
  const rows = [...doc.impacts].sort((a, b) => b.score - a.score);
  const out = [`# Impact analysis: ${doc.storyId}${doc.storyTitle ? ` ${doc.storyTitle}` : ''}`, ''];
  if (doc.sample) out.push('> SAMPLE. Not a real analysis. Never post.', '');
  out.push(`Epic: ${doc.epic || '-'}  `, 'Score = Likelihood x Severity (1-3 each). 9 Critical, 6 High, 3-4 Medium, 1-2 Low.',
    'Every Critical and High impact must get at least one test case with scope "Impacted".', '',
    '| ID | Module | Relation | L | S | Score | Level | Evidence / Question | Test focus |', '|---|---|---|---|---|---|---|---|---|');
  for (const im of rows) {
    const ev = im.evidence ? `"${im.evidence}"` : '';
    const q = im.question ? `${ev ? ' / ' : ''}${im.question}` : '';
    out.push(`| ${im.id} | ${im.module} | ${im.relation || '-'} | ${im.likelihood} | ${im.severity} | ${im.score} | **${im.level}** | ${ev}${q} | ${im.testFocus || '-'} |`);
  }
  if (!rows.length) out.push(`| - | none | - | - | - | - | - | ${doc.noImpactReason || ''} | - |`);
  return out.join('\n') + '\n';
}

if (require.main === module) {
  const args = U.parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file) { process.stderr.write('Usage: build_impact.js <impact.json> --check [--md out.md] [--questions q.json] [--fix]\n'); process.exit(2); }
  const doc = U.readJson(file);
  const questions = args.questions ? U.readJson(args.questions) : null;
  const res = checkImpact(doc, { questions, fix: !!args.fix });
  if (args.fix) fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  process.stdout.write(`${res.ok ? 'VALID' : 'INVALID'}: ${file}  (Critical ${res.byLevel ? res.byLevel.Critical : 0}, High ${res.byLevel ? res.byLevel.High : 0}, Medium ${res.byLevel ? res.byLevel.Medium : 0}, Low ${res.byLevel ? res.byLevel.Low : 0})\n`);
  for (const e of res.errors) process.stdout.write(`  error: ${e}\n`);
  for (const w of res.warnings) process.stdout.write(`  warning: ${w}\n`);
  if (args.md && res.ok) { fs.writeFileSync(args.md, renderMatrix(doc)); process.stdout.write(`  matrix written: ${args.md}\n`); }
  process.exit(res.ok ? 0 : 1);
}

module.exports = { checkImpact, renderMatrix, levelFor, RELATIONS };
