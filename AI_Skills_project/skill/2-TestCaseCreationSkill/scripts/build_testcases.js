#!/usr/bin/env node
'use strict';
// build_testcases.js <suite.json> [--md <out.md>] [--csv <out.csv>]
// Renders the suite for people: a readable Markdown document and a CSV (Excel / Jira / Xray import).
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

function toMarkdown(s) {
  const out = [`# Test cases: ${s.storyId} ${s.storyTitle}`, ''];
  if (s.sample) out.push('> SAMPLE. Not a real suite. Never post.', '');
  if (s.override) out.push(`> **TESTER OVERRIDE.** The readiness gate was not met. ${s.overrideNote || ''}`, '');
  if (s.observationDerived) out.push('> **Observation-derived.** Some expected results come from what the site showed, not from a confirmed requirement. A pass means "behaves as observed", not "correct".', '');
  const n = (st) => s.testCases.filter((t) => t.status === st).length;
  out.push(`- Suite: \`${s.suiteId}\`  Epic: ${s.epic || '-'}  Base URL: ${s.baseUrl}`,
    `- Cases: ${s.testCases.length} (Target ${s.testCases.filter((t) => t.scope === 'Target').length}, Impacted ${s.testCases.filter((t) => t.scope === 'Impacted').length}). Ready ${n('Ready')}, Blocked ${n('Blocked')}, Draft ${n('Draft')}`, '');
  out.push('| ID | Title | Scope | Ref | Type | Priority | Status |', '|---|---|---|---|---|---|---|');
  for (const t of s.testCases) out.push(`| ${t.id} | ${t.title} | ${t.scope} | ${t.scope === 'Impacted' ? t.impactRef : (t.acRef || []).join(', ')} | ${t.type || '-'} | ${t.priority} | ${t.status} |`);
  out.push('');
  for (const t of s.testCases) {
    out.push(`## ${t.id} ${t.title}`, '');
    out.push(`- Scope: **${t.scope}**${t.impactRef ? ` (${t.impactRef})` : ''}${(t.acRef || []).length ? `  AC: ${t.acRef.join(', ')}` : ''}`);
    out.push(`- Type: ${t.type || '-'}  Technique: ${t.technique || '-'}  Priority: ${t.priority}  Status: **${t.status}**`);
    if (t.status === 'Blocked') out.push(`- Blocked: ${t.blockedReason}`);
    if ((t.questionRef || []).length) out.push(`- Questions: ${t.questionRef.join(', ')}`);
    if ((t.preconditions || []).length) out.push(`- Preconditions: ${t.preconditions.join('; ')}`);
    if (t.testData && Object.keys(t.testData).length) out.push(`- Test data: ${Object.entries(t.testData).map(([k, v]) => `${k} = \`${v}\``).join(', ')}`);
    out.push('', '| # | Action | Expected |', '|---|---|---|');
    t.steps.forEach((st, i) => out.push(`| ${i + 1} | ${st.action} | ${st.expected || ''} |`));
    out.push('', `**Expected result:** ${t.expectedResult}${t.expectedSource === 'observation' ? ' _(observation-derived)_' : ''}`, '');
  }
  return out.join('\n');
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(s) {
  const head = ['Suite', 'Test ID', 'Title', 'Story', 'Scope', 'Ref', 'Type', 'Priority', 'Status', 'Blocked reason', 'Preconditions', 'Test data', 'Step', 'Action', 'Expected', 'Expected result', 'Labels'];
  const rows = [head];
  const labels = [s.sample ? 'SAMPLE' : '', s.override ? 'tester-override' : '', s.observationDerived ? 'observation-derived' : ''].filter(Boolean).join(' ');
  for (const t of s.testCases) {
    t.steps.forEach((st, i) => rows.push([s.suiteId, t.id, t.title, s.storyId, t.scope, t.impactRef || (t.acRef || []).join(' '), t.type || '', t.priority, t.status,
      t.blockedReason || '', (t.preconditions || []).join('; '), JSON.stringify(t.testData || {}), i + 1, st.action, st.expected || '', i === 0 ? t.expectedResult : '', labels]));
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0]) { process.stderr.write('Usage: build_testcases.js <suite.json> [--md out.md] [--csv out.csv]\n'); process.exit(2); }
  const suite = JSON.parse(fs.readFileSync(args._[0], 'utf8').replace(/^﻿/, ''));
  if (args.md) { fs.writeFileSync(args.md, toMarkdown(suite) + '\n'); process.stdout.write(`Markdown: ${args.md}\n`); }
  if (args.csv) { fs.writeFileSync(args.csv, toCsv(suite)); process.stdout.write(`CSV: ${args.csv}\n`); }
  if (!args.md && !args.csv) process.stdout.write(toMarkdown(suite) + '\n');
}

module.exports = { toMarkdown, toCsv };
