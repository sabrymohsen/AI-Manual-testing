#!/usr/bin/env node
'use strict';
// build_jira_comment.js <ID>-questions.json [--out <ID>-jira-comment.md] [--impact <ID>-impact.json]
// Drafts the Jira comment for the story: open questions, answered ones, and the top impacts.
// It is a DRAFT. Posting goes only through the orchestrator's jira.js, after the user approves.
const fs = require('fs');
const U = require('./util');

function buildJiraComment(q, impact) {
  const open = (q.questions || []).filter((x) => x.status !== 'Answered');
  const answered = (q.questions || []).filter((x) => x.status === 'Answered');
  const out = [];
  if (q.sample) out.push('SAMPLE. Not a real comment. Never post.', '');
  out.push(`QA requirement analysis for ${q.storyId}${q.storyTitle ? ` ${q.storyTitle}` : ''}`, '');
  out.push(`Clarity: ${q.clarity || 'Unclear'}. Open questions: ${open.length}. Answered: ${answered.length}.`, '');
  if (open.length) {
    out.push('Open questions (test design for the affected cases is on hold):');
    for (const x of open) out.push(`- ${x.id} [${x.priority || 'Medium'}] ${x.question}${x.askTo ? ` (for ${x.askTo})` : ''}`);
    out.push('');
  }
  if (answered.length) {
    out.push('Answered:');
    for (const x of answered) out.push(`- ${x.id} ${x.question} -> ${x.answer} (${x.answeredBy || 'unknown'})`);
    out.push('');
  }
  const top = ((impact && impact.impacts) || []).filter((i) => ['Critical', 'High'].includes(i.level));
  if (top.length) {
    out.push('Impacted areas that will be regression tested:');
    for (const i of top) out.push(`- ${i.id} ${i.module}: ${i.level}`);
    out.push('');
  }
  out.push('Please answer under each question id.');
  return out.join('\n') + '\n';
}

if (require.main === module) {
  const args = U.parseArgs(process.argv.slice(2));
  if (!args._[0]) { process.stderr.write('Usage: build_jira_comment.js <questions.json> [--out file] [--impact impact.json]\n'); process.exit(2); }
  const text = buildJiraComment(U.readJson(args._[0]), args.impact ? U.readJson(args.impact) : null);
  if (args.out) { fs.writeFileSync(args.out, text); process.stdout.write(`Jira comment DRAFT written: ${args.out} (not posted)\n`); } else process.stdout.write(text);
}

module.exports = { buildJiraComment };
