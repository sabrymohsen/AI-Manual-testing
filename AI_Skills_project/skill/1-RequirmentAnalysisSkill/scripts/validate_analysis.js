#!/usr/bin/env node
'use strict';
// validate_analysis.js <analysis dir> --story <ID> [--epic <EPIC>] [--json]
// Stage 1 validator. Checks that the analysis folder holds every required output and that the
// questions and impact files are consistent. Exit 0 = valid.
const fs = require('fs');
const path = require('path');
const U = require('./util');
const { checkImpact } = require('./build_impact');

const Q_STATUSES = ['Open', 'Answered'];

function checkQuestions(q) {
  const errors = [];
  if (!q.storyId) errors.push('questions: storyId is missing');
  if (!['Clear', 'Unclear'].includes(q.clarity)) errors.push('questions: clarity must be "Clear" or "Unclear"');
  for (const k of ['jiraUpdated', 'emailUpdated']) if (typeof q[k] !== 'boolean') errors.push(`questions: ${k} must be true or false`);
  if (!Array.isArray(q.questions)) return [...errors, 'questions: "questions" must be an array'];
  const ids = new Set();
  for (const x of q.questions) {
    const w = x.id || '(no id)';
    if (!/^Q-\d{2,}$/.test(x.id || '')) errors.push(`questions: ${w} id must look like Q-01`);
    if (ids.has(x.id)) errors.push(`questions: ${w} duplicate id`);
    ids.add(x.id);
    if (!x.question) errors.push(`questions: ${w} has no question text`);
    if (!Q_STATUSES.includes(x.status)) errors.push(`questions: ${w} status must be Open or Answered`);
    if (x.status === 'Answered' && (!x.answer || !x.answeredBy)) errors.push(`questions: ${w} is Answered but has no answer or answeredBy. Never assume an answer.`);
  }
  if (q.clarity === 'Clear' && q.questions.some((x) => x.status === 'Open')) errors.push('questions: clarity is "Clear" but questions are still Open');
  for (const g of q.gaps || []) if (!/^G-\d{2,}$/.test(g.id || '')) errors.push(`questions: gap id "${g.id}" must look like G-01`);
  return errors;
}

function validateAnalysis(dir, storyId) {
  const errors = [];
  const warnings = [];
  const f = (suffix) => path.join(dir, `${storyId}${suffix}`);
  const required = ['-result.md', '-questions.json', '-impact.json', '-email-draft.md', '-jira-comment.md'];
  for (const s of required) if (!fs.existsSync(f(s))) errors.push(`missing ${path.basename(f(s))}`);
  const graphs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(`-${storyId}-graph.html`)) : [];
  if (!graphs.length) errors.push(`missing the impact graph <EPIC>-${storyId}-graph.html`);
  let q = null;
  if (fs.existsSync(f('-questions.json'))) {
    try { q = U.readJson(f('-questions.json')); errors.push(...checkQuestions(q)); } catch (e) { errors.push(e.message); }
  }
  if (fs.existsSync(f('-impact.json'))) {
    try {
      const im = U.readJson(f('-impact.json'));
      const r = checkImpact(im, { questions: q });
      errors.push(...r.errors.map((e) => `impact: ${e}`));
      warnings.push(...r.warnings.map((w) => `impact: ${w}`));
    } catch (e) { errors.push(e.message); }
  }
  if (fs.existsSync(f('-result.md'))) {
    const md = fs.readFileSync(f('-result.md'), 'utf8');
    for (const h of ['Acceptance criteria', 'Gaps', 'Questions', 'Impact', 'Readiness']) {
      if (!new RegExp(`^#{1,3}\\s.*${h}`, 'im').test(md)) errors.push(`${storyId}-result.md has no "${h}" section`);
    }
    if (q && q.sample && !/SAMPLE/.test(md)) errors.push('The analysis is SAMPLE but the result file is not labelled SAMPLE');
  }
  return { ok: errors.length === 0, errors, warnings, questions: q ? { total: q.questions.length, open: q.questions.filter((x) => x.status === 'Open').length } : null };
}

if (require.main === module) {
  const args = U.parseArgs(process.argv.slice(2));
  if (!args._[0] || !args.story) { process.stderr.write('Usage: validate_analysis.js <analysis dir> --story <ID> [--json]\n'); process.exit(2); }
  const res = validateAnalysis(args._[0], args.story);
  if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    process.stdout.write(`${res.ok ? 'VALID' : 'INVALID'}: analysis for ${args.story}\n`);
    for (const e of res.errors) process.stdout.write(`  error: ${e}\n`);
    for (const w of res.warnings) process.stdout.write(`  warning: ${w}\n`);
  }
  process.exit(res.ok ? 0 : 1);
}

module.exports = { validateAnalysis, checkQuestions };
