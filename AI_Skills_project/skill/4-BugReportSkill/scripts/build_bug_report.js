#!/usr/bin/env node
'use strict';
// build_bug_report.js --results <results.json> --suite <suite.json> --triage <triage.json> --out <bugs dir>
// Turns the triage decisions into bug reports. Only "Bug" decisions become bugs; the rest are listed in
// bugs-summary.md with their reason. Writes bugs.json, BUG-xxx.md, BUG-xxx.jira.txt, bugs-summary.md.
// Everything is a Draft: nothing is posted. Posting goes through the orchestrator's jira.js after approval.
const fs = require('fs');
const path = require('path');

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

const DECISIONS = ['Bug', 'Duplicate', 'NotABug', 'RequirementIssue', 'TestIssue', 'Environment'];
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

function buildBugs({ results, resultsFile, suite, triage, outDir }) {
  const tcIdx = new Map(suite.testCases.map((t) => [t.id, t]));
  const resIdx = new Map(results.results.map((r) => [r.id, r]));
  const resultsDir = path.dirname(path.resolve(resultsFile));
  const bugs = [];
  const others = [];
  let n = 0;
  for (const d of triage.decisions || []) {
    const r = resIdx.get(d.testId);
    const tc = tcIdx.get(d.testId);
    if (!r || !tc) throw new Error(`Triage names ${d.testId}, which is not in the results/suite`);
    if (!DECISIONS.includes(d.decision)) throw new Error(`${d.testId}: decision must be one of ${DECISIONS.join(', ')}`);
    if (d.decision !== 'Bug') { others.push({ ...d, status: r.status }); continue; }
    n += 1;
    const id = `BUG-${String(n).padStart(3, '0')}`;
    const failing = r.steps.find((s) => s.status === 'fail') || r.steps[r.steps.length - 1] || {};
    const upTo = failing.n || tc.steps.length;
    const evidence = (r.evidence || []).map((e) => path.relative(path.resolve(outDir), path.join(resultsDir, e)).split(path.sep).join('/'));
    const labels = ['qa-pipeline', suite.storyId];
    if (tc.scope === 'Impacted') labels.push('regression');
    if (r.status === 'Flaky') labels.push('intermittent');
    if (suite.sample) labels.push('SAMPLE');
    if (suite.override) labels.push('tester-override');
    if (suite.observationDerived && tc.expectedSource === 'observation') labels.push('observation-derived');
    bugs.push({
      id,
      title: d.title || `${tc.title}: ${failing.actual || 'unexpected result'}`.slice(0, 120),
      status: 'Draft',
      storyId: suite.storyId,
      testId: tc.id,
      scope: tc.scope,
      regression: tc.scope === 'Impacted',
      impactRef: tc.impactRef || null,
      resultStatus: r.status,
      severity: d.severity,
      priority: d.priority,
      component: d.component || null,
      environment: { baseUrl: results.baseUrl, tool: 'playwright-cli', session: results.session, headed: results.headed, executedAt: r.endedAt },
      preconditions: tc.preconditions || [],
      testData: tc.testData || {},
      stepsToReproduce: tc.steps.slice(0, upTo).map((s) => s.action),
      expected: failing.expected || tc.expectedResult,
      actual: failing.actual || r.reason || '',
      consoleNote: r.note || null,
      evidence,
      reason: d.reason,
      questionRef: tc.questionRef || [],
      labels,
      jiraKey: null,
    });
  }
  return { storyId: suite.storyId, suiteId: suite.suiteId, sample: !!suite.sample, override: !!suite.override, createdAt: new Date().toISOString(), bugs, notBugs: others,
    observations: (triage.observations || []).map((o) => ({ testId: o.testId || null, text: o.text, followUp: o.followUp || null })) };
}

function bugMd(b, doc) {
  const out = [];
  if (doc.sample) out.push('> SAMPLE. Not a real bug. Never post.', '');
  if (doc.override) out.push('> Found under a TESTER OVERRIDE of the readiness gate.', '');
  out.push(`# ${b.id} ${b.title}`, '', '| Field | Value |', '|---|---|',
    `| Status | ${b.status} (not posted) |`, `| Story | ${b.storyId} |`, `| Test case | ${b.testId} (${b.scope}${b.impactRef ? `, ${b.impactRef}` : ''}) |`,
    `| Type | ${b.regression ? 'Regression in an impacted module' : 'Defect in the story under test'}${b.resultStatus === 'Flaky' ? ', intermittent' : ''} |`,
    `| Severity | ${b.severity} |`, `| Priority | ${b.priority} |`, `| Environment | ${b.environment.baseUrl}, playwright-cli, ${b.environment.headed ? 'headed' : 'headless'} |`,
    `| Labels | ${b.labels.join(', ')} |`, '');
  if (b.preconditions.length) out.push('## Preconditions', ...b.preconditions.map((p) => `- ${p}`), '');
  if (Object.keys(b.testData).length) out.push('## Test data', ...Object.entries(b.testData).map(([k, v]) => `- ${k}: \`${v}\``), '');
  out.push('## Steps to reproduce', ...b.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`), '',
    '## Expected', b.expected, '', '## Actual', b.actual, '');
  if (b.consoleNote) out.push('## Console / notes', b.consoleNote, '');
  if (b.evidence.length) out.push('## Evidence', ...b.evidence.map((e) => `- ![${path.basename(e)}](${e})`), '');
  out.push('## Triage', b.reason || '-', '');
  if (b.questionRef.length) out.push(`Related questions: ${b.questionRef.join(', ')}`, '');
  return out.join('\n');
}

function bugJira(b, doc) {
  const out = [];
  if (doc.sample) out.push('SAMPLE. Not a real bug. Never post.', '');
  out.push(`Summary: [${b.storyId}] ${b.title}`, `Issue type: Bug    Priority: ${b.priority}    Severity: ${b.severity}`, `Labels: ${b.labels.join(' ')}`, '',
    'h3. Environment', `${b.environment.baseUrl} - playwright-cli (${b.environment.headed ? 'headed' : 'headless'})`, '');
  if (b.preconditions.length) out.push('h3. Preconditions', ...b.preconditions.map((p) => `* ${p}`), '');
  out.push('h3. Steps to reproduce', ...b.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`), '', 'h3. Expected', b.expected, '', 'h3. Actual', b.actual, '');
  if (b.evidence.length) out.push('h3. Attachments', ...b.evidence.map((e) => `* ${path.basename(e)}`), '');
  out.push(`Found by test case ${b.testId} (${b.scope}). Linked story: ${b.storyId}.`);
  return out.join('\n') + '\n';
}

function summaryMd(doc, results) {
  const out = [`# Bug triage: ${doc.storyId}`, ''];
  if (doc.sample) out.push('> SAMPLE. Never post.', '');
  if (doc.override) out.push('> TESTER OVERRIDE. The readiness gate was not met. Never post.', '');
  out.push(`Suite ${doc.suiteId}. Results: ${Object.entries(results.summary).filter(([k, v]) => typeof v === 'number' && v && k !== 'passRate').map(([k, v]) => `${k} ${v}`).join(', ')}.`, '',
    `**${doc.bugs.length} bug${doc.bugs.length === 1 ? '' : 's'} drafted. Nothing posted.**`, '');
  if (doc.bugs.length) {
    out.push('| Bug | Title | Test | Scope | Severity | Priority |', '|---|---|---|---|---|---|');
    for (const b of doc.bugs) out.push(`| [${b.id}](${b.id}.md) | ${b.title} | ${b.testId} | ${b.regression ? 'Impacted (regression)' : 'Target'} | ${b.severity} | ${b.priority} |`);
    out.push('');
  }
  if (doc.notBugs.length) {
    out.push('## Not filed as bugs', '', '| Test | Result | Decision | Reason |', '|---|---|---|---|');
    for (const d of doc.notBugs) out.push(`| ${d.testId} | ${d.status} | ${d.decision}${d.duplicateOf ? ` of ${d.duplicateOf}` : ''} | ${d.reason} |`);
    out.push('');
  }
  if ((doc.observations || []).length) {
    out.push('## Observations for follow-up (not bugs: no recorded result checks them)', '');
    for (const o of doc.observations) out.push(`- ${o.testId ? `${o.testId}: ` : ''}${o.text}${o.followUp ? ` Follow-up: ${o.followUp}` : ''}`);
    out.push('');
  }
  return out.join('\n');
}

function writeAll(doc, results, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'bugs.json'), JSON.stringify(doc, null, 2) + '\n');
  for (const b of doc.bugs) {
    fs.writeFileSync(path.join(outDir, `${b.id}.md`), bugMd(b, doc));
    fs.writeFileSync(path.join(outDir, `${b.id}.jira.txt`), bugJira(b, doc));
  }
  fs.writeFileSync(path.join(outDir, 'bugs-summary.md'), summaryMd(doc, results));
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.results || !a.suite || !a.triage || !a.out) {
    process.stderr.write('Usage: build_bug_report.js --results <results.json> --suite <suite.json> --triage <triage.json> --out <bugs dir>\n'); process.exit(2);
  }
  try {
    const results = readJson(a.results);
    const doc = buildBugs({ results, resultsFile: a.results, suite: readJson(a.suite), triage: readJson(a.triage), outDir: a.out });
    writeAll(doc, results, a.out);
    process.stdout.write(`${doc.bugs.length} bug draft(s) written to ${a.out} (nothing posted). Not bugs: ${doc.notBugs.length}.\n`);
  } catch (e) { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(1); }
}

module.exports = { buildBugs, writeAll, DECISIONS, SEVERITIES, PRIORITIES };
