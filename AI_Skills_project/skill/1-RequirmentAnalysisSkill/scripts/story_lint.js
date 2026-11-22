#!/usr/bin/env node
'use strict';
// story_lint.js <story.md> [--json]
// A first, mechanical pass over a user story. It finds structure gaps and wording that cannot be
// tested. It does NOT decide whether the story is clear: the analyst does, and every finding
// becomes a gap (G-xx) or a question (Q-xx), never an assumption.
const fs = require('fs');
const U = require('./util');

const VAGUE = ['fast', 'quick', 'quickly', 'easy', 'easily', 'user-friendly', 'intuitive', 'clear', 'clearly', 'appropriate',
  'properly', 'correctly', 'nice', 'simple', 'efficient', 'robust', 'seamless', 'etc', 'and so on', 'as needed', 'if possible',
  'should be able', 'some', 'several', 'many', 'few', 'normal', 'reasonable', 'secure', 'better'];

function lintStory(text) {
  const findings = [];
  const add = (severity, rule, message, line) => findings.push({ severity, rule, message, line: line || null });
  const lines = text.split(/\r?\n/);
  const idLine = lines.find((l) => /^#\s+/.test(l)) || '';
  const id = (idLine.match(/([A-Z][A-Z0-9]*-\d+)/) || [])[1] || null;
  if (!id) add('error', 'story-id', 'No story id in the title (expected "# <ID> <title>", e.g. "# SD-02 Clear login errors").');

  const flat = text.replace(/\*\*/g, '');
  if (!/\bAs an?\b/i.test(flat)) add('error', 'role', 'No "As a <role>" part.');
  if (!/\bI want\b/i.test(flat)) add('error', 'goal', 'No "I want <goal>" part.');
  if (!/\bso that\b/i.test(flat)) add('warning', 'benefit', 'No "so that <benefit>" part: the value of the story is unstated.');

  const acStart = lines.findIndex((l) => /^#{1,6}\s*Acceptance Criteria/i.test(l));
  const acs = [];
  if (acStart < 0) add('error', 'ac-section', 'No "## Acceptance Criteria" section.');
  else {
    for (let i = acStart + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) {
      const m = lines[i].match(/^\s*(?:[-*]|\d+[.)])\s+(.+)/);
      if (m) acs.push({ id: `AC-${acs.length + 1}`, text: m[1].trim(), line: i + 1 });
    }
    if (!acs.length) add('error', 'ac-empty', 'The Acceptance Criteria section has no bullet items.');
  }

  for (const ac of acs) {
    const low = ` ${ac.text.toLowerCase()} `;
    for (const w of VAGUE) {
      if (new RegExp(`[^a-z]${w.replace(/[-.]/g, '\\$&')}[^a-z]`).test(low)) add('warning', 'vague', `${ac.id} uses "${w}": not measurable as written.`, ac.line);
    }
    if (!/->|→|=>|\bthen\b|\bshows?\b|\bopens?\b|\bdisplays?\b|\breturns?\b|"|“/i.test(ac.text)) {
      add('warning', 'no-outcome', `${ac.id} has no observable outcome (no quoted message, "shows", "->", ...).`, ac.line);
    }
    const quotes = ac.text.match(/["“][^"”]+["”]/g) || [];
    if (/message|error|text/i.test(ac.text) && !quotes.length) add('warning', 'no-exact-text', `${ac.id} mentions a message but gives no exact text.`, ac.line);
    if (/\b(or|and\/or)\b/i.test(ac.text) && !quotes.length) add('info', 'alternatives', `${ac.id} contains "or": check whether both outcomes are allowed.`, ac.line);
  }

  // Inconsistent message prefixes across ACs, e.g. one has "Epic sadface: " and the others do not.
  const msgs = acs.flatMap((a) => (a.text.match(/["“]([^"”]+)["”]/g) || []).map((q) => q.slice(1, -1)));
  const prefixes = msgs.map((m) => (m.match(/^([^:]{2,30}):\s/) || [])[1] || null);
  if (prefixes.some(Boolean) && prefixes.some((p) => !p)) {
    add('warning', 'inconsistent-text', `Expected messages are inconsistent: some carry a prefix (${[...new Set(prefixes.filter(Boolean))].join(', ')}) and some do not. Ask which wording is exact.`);
  }

  lines.forEach((l, i) => {
    if (/<[^>]*(name|tbd|todo)[^>]*>|\bTBD\b|\bTODO\b|\?\?\?/i.test(l)) add('warning', 'placeholder', `Placeholder left in: "${l.trim()}"`, i + 1);
  });
  if (!/Depends On|Linked tickets/i.test(text)) add('info', 'links', 'No linked tickets / dependencies listed: the impact analysis has less to go on.');
  if (!/https?:\/\//.test(text)) add('info', 'no-url', 'No application URL in the story. Ask for it before execution.');

  return { id, acceptanceCriteria: acs.map(({ id: i, text: t }) => ({ id: i, text: t })), findings,
    counts: { error: findings.filter((f) => f.severity === 'error').length, warning: findings.filter((f) => f.severity === 'warning').length,
      info: findings.filter((f) => f.severity === 'info').length } };
}

if (require.main === module) {
  const args = U.parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file) { process.stderr.write('Usage: story_lint.js <story.md> [--json]\n'); process.exit(2); }
  const res = lintStory(fs.readFileSync(file, 'utf8'));
  if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    process.stdout.write(`Story ${res.id || '(no id)'}: ${res.acceptanceCriteria.length} acceptance criteria, ${res.counts.error} errors, ${res.counts.warning} warnings, ${res.counts.info} notes\n`);
    for (const a of res.acceptanceCriteria) process.stdout.write(`  ${a.id}: ${a.text}\n`);
    for (const f of res.findings) process.stdout.write(`  [${f.severity}] ${f.rule}${f.line ? ` (line ${f.line})` : ''}: ${f.message}\n`);
    process.stdout.write('Every finding becomes a gap or a question. The lint never decides that a story is clear.\n');
  }
  process.exit(res.counts.error ? 1 : 0);
}

module.exports = { lintStory };
