#!/usr/bin/env node
'use strict';
// build_email.js <ID>-questions.json --story "<ID> <title>" [--out <ID>-email-draft.md] [--to "PO name"] [--from "QA"]
// Drafts the stakeholder email from the open questions. It is a DRAFT: this script sends nothing.
const fs = require('fs');
const U = require('./util');

function buildEmail(q, opts = {}) {
  const story = opts.story || `${q.storyId} ${q.storyTitle || ''}`.trim();
  const open = (q.questions || []).filter((x) => x.status !== 'Answered');
  const answered = (q.questions || []).filter((x) => x.status === 'Answered');
  const byPri = (p) => open.filter((x) => (x.priority || 'Medium') === p);
  const lines = [
    '<!-- DRAFT. Not sent. Only the user sends this, from their own mail client. -->',
    q.sample ? '> SAMPLE. Not a real request. Never send.\n' : '',
    `**To:** ${opts.to || '<PO / BA>'}`,
    `**Subject:** [QA] ${open.length} question${open.length === 1 ? '' : 's'} on ${story} before test design`,
    '',
    `Hello ${opts.to || 'team'},`,
    '',
    `While analysing **${story}** for testing I found points the story does not answer. Test design for the affected cases is on hold until they are clarified, so a short answer to each one helps.`,
    '',
  ];
  for (const pri of ['High', 'Medium', 'Low']) {
    const list = byPri(pri);
    if (!list.length) continue;
    lines.push(`### ${pri} priority`, '');
    for (const x of list) {
      lines.push(`**${x.id}.** ${x.question}`);
      if (x.why) lines.push(`  _Why it matters:_ ${x.why}`);
      if (x.options && x.options.length) lines.push(`  _Possible answers:_ ${x.options.join(' / ')}`);
      lines.push('');
    }
  }
  if (!open.length) lines.push('All questions are answered. Thank you. This note only confirms the answers below.', '');
  if (answered.length) {
    lines.push('### Already answered (please correct if wrong)', '');
    for (const x of answered) lines.push(`- **${x.id}** ${x.question} → ${x.answer} _(${x.answeredBy || 'unknown'})_`);
    lines.push('');
  }
  lines.push('You can reply inline under each question id.', '', 'Thank you,', opts.from || '<QA name>');
  return lines.filter((l, i) => !(l === '' && i === 1)).join('\n') + '\n';
}

if (require.main === module) {
  const args = U.parseArgs(process.argv.slice(2));
  if (!args._[0]) { process.stderr.write('Usage: build_email.js <questions.json> --story "<ID> <title>" [--out file] [--to name] [--from name]\n'); process.exit(2); }
  const md = buildEmail(U.readJson(args._[0]), args);
  if (args.out) { fs.writeFileSync(args.out, md); process.stdout.write(`Email DRAFT written: ${args.out} (not sent)\n`); } else process.stdout.write(md);
}

module.exports = { buildEmail };
