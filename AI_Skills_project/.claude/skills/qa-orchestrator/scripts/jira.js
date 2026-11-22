#!/usr/bin/env node
'use strict';
/*
 * jira.js - the only way anything reaches Jira Cloud. REST v3 over built-in fetch, no dependencies.
 * Credentials come from the project .env (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY);
 * the token is sent only in the Authorization header and never printed.
 *
 * Reads (run when the user asks):
 *   read        --key <KEY> [--out test-input/<ID>-story.md]
 * Writes (DRY RUN unless --execute; --execute only after the user approved the exact plan shown):
 *   comment     --key <KEY> --file <comment.md> --run-dir <run> [--execute --approved-by "<name>"]
 *   create-bug  --id BUG-001 --run-dir <run> [--project <KEY>] [--link <STORY-KEY>] [--execute --approved-by "<name>"]
 *
 * Refuses every write for SAMPLE runs and tester-override runs.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const next = argv[i + 1];
    if (next === undefined || /^--[a-zA-Z]/.test(next)) out[a.slice(2)] = true; else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

function loadEnv(file = path.join(ROOT, '.env')) {
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  for (const k of ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY']) if (process.env[k]) env[k] = process.env[k];
  return env;
}

function config(needWrite) {
  const env = loadEnv();
  const missing = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Jira is not configured: set ${missing.join(', ')} in .env (see .env.example).`);
  const base = env.JIRA_BASE_URL.replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+\.atlassian\.net$/.test(base) && needWrite) process.stderr.write(`note: ${base} is not an *.atlassian.net site\n`);
  return { base, auth: 'Basic ' + Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString('base64'), project: env.JIRA_PROJECT_KEY || null };
}

async function call(cfg, method, route, body, extraHeaders = {}) {
  const res = await fetch(cfg.base + route, {
    method,
    headers: { Authorization: cfg.auth, Accept: 'application/json', ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* not json */ }
  if (!res.ok) throw new Error(`Jira ${method} ${route} -> HTTP ${res.status}: ${(json && (json.errorMessages || []).concat(Object.values(json.errors || {})).join('; ')) || text.slice(0, 300)}`);
  return json;
}

// ---- Markdown/plain text -> Atlassian Document Format (headings, bullets, numbered lists, paragraphs, bold) ----
function inline(text) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) });
    parts.push(m[1] ? { type: 'text', text: m[1], marks: [{ type: 'strong' }] } : { type: 'text', text: m[2], marks: [{ type: 'code' }] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts.length ? parts : [{ type: 'text', text: ' ' }];
}
function toAdf(md) {
  const content = [];
  let list = null;
  const flush = () => { if (list) { content.push(list); list = null; } };
  for (const raw of String(md).split(/\r?\n/)) {
    const line = raw.replace(/<!--.*?-->/g, '').trimEnd();
    if (!line.trim()) { flush(); continue; }
    let m;
    if ((m = line.match(/^(?:#{1,6}|h([1-6])\.)\s+(.*)/))) { flush(); content.push({ type: 'heading', attrs: { level: Math.min(Number(m[1] || (line.match(/^#+/) || ['###'])[0].length), 6) }, content: inline(m[2]) }); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      const type = /^\s*[-*]\s/.test(line) ? 'bulletList' : 'orderedList';
      if (!list || list.type !== type) { flush(); list = { type, content: [] }; }
      list.content.push({ type: 'listItem', content: [{ type: 'paragraph', content: inline(m[1]) }] });
      continue;
    }
    flush();
    if (/^\|/.test(line) && /^\|[\s|:-]+\|$/.test(line)) continue;
    content.push({ type: 'paragraph', content: inline(line.replace(/^>\s?/, '')) });
  }
  flush();
  return { type: 'doc', version: 1, content };
}
function adfToText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  const inner = (node.content || []).map(adfToText).join(node.type === 'doc' ? '\n\n' : '');
  if (node.type === 'listItem') return `- ${inner}\n`;
  if (node.type === 'heading') return `${'#'.repeat(node.attrs && node.attrs.level ? node.attrs.level + 1 : 3)} ${inner}`;
  if (node.type === 'hardBreak') return '\n';
  return inner;
}

function guardRun(runDir) {
  if (!runDir) throw new Error('--run-dir is required for writes (to check the labels and record the post).');
  const st = readJson(path.join(runDir, 'pipeline-state.json'));
  if (st.sample) throw new Error('Refused: this is a SAMPLE run. SAMPLE work is never posted.');
  if (st.gate && st.gate.decision === 'Override') throw new Error('Refused: this run is a TESTER OVERRIDE. Override work is never posted.');
  return st;
}

function recordPost(runDir, what, target, approvedBy) {
  require('./pipeline').recordPost({ 'run-dir': runDir, what, target, 'approved-by': approvedBy });
}

async function read(a) {
  const cfg = config(false);
  if (!a.key) throw new Error('--key is required');
  const issue = await call(cfg, 'GET', `/rest/api/3/issue/${encodeURIComponent(a.key)}?fields=summary,description,issuetype,status,labels,issuelinks,parent`);
  const f = issue.fields;
  const links = (f.issuelinks || []).map((l) => (l.outwardIssue ? `${l.type.outward} ${l.outwardIssue.key}` : `${l.type.inward} ${l.inwardIssue.key}`));
  const md = [`# ${issue.key} ${f.summary}`, '', `<!-- Read from Jira ${cfg.base}/browse/${issue.key} on ${new Date().toISOString().slice(0, 10)}. Wording kept as in Jira. -->`, '',
    adfToText(f.description).trim() || '(no description in Jira)', '', '## Context (optional)',
    `- Jira: ${issue.key} (${f.issuetype && f.issuetype.name}, status ${f.status && f.status.name})`,
    `- Epic / parent: ${f.parent ? `${f.parent.key} ${f.parent.fields && f.parent.fields.summary}` : '-'}`,
    `- Linked tickets: ${links.join('; ') || '-'}`, `- Labels: ${(f.labels || []).join(', ') || '-'}`, ''].join('\n');
  if (a.out) { fs.writeFileSync(a.out, md); return { written: a.out, key: issue.key }; }
  return { key: issue.key, markdown: md };
}

async function comment(a) {
  if (!a.key || !a.file) throw new Error('comment needs --key and --file');
  const st = guardRun(a['run-dir']);
  const text = fs.readFileSync(a.file, 'utf8');
  if (/SAMPLE/.test(text.split('\n')[0] || '')) throw new Error('Refused: the comment file is labelled SAMPLE.');
  const plan = { method: 'POST', route: `/rest/api/3/issue/${a.key}/comment`, body: { body: toAdf(text) } };
  if (!a.execute) return { dryRun: true, nothingWritten: true, plan, preview: text };
  if (!a['approved-by'] || a['approved-by'] === true) throw new Error('--execute needs --approved-by "<name of the user who approved this plan>"');
  const cfg = config(true);
  const res = await call(cfg, plan.method, plan.route, plan.body);
  recordPost(a['run-dir'], `Jira comment on ${a.key} (${path.basename(a.file)})`, `${cfg.base}/browse/${a.key}`, a['approved-by']);
  if (/questions|jira-comment/.test(a.file)) {
    const qf = path.join(a['run-dir'], 'analysis', `${st.story.id}-questions.json`);
    if (fs.existsSync(qf)) process.stderr.write(`note: set "jiraUpdated": true in ${qf} only once the ANSWERS are in Jira, not the questions.\n`);
  }
  return { posted: true, id: res.id, url: `${cfg.base}/browse/${a.key}` };
}

async function createBug(a) {
  if (!a.id) throw new Error('create-bug needs --id BUG-xxx');
  guardRun(a['run-dir']);
  const bugsFile = path.join(a['run-dir'], 'bugs', 'bugs.json');
  const doc = readJson(bugsFile);
  if (doc.sample || doc.override) throw new Error('Refused: the bug list is SAMPLE or tester-override.');
  const bug = doc.bugs.find((b) => b.id === a.id);
  if (!bug) throw new Error(`${a.id} is not in ${bugsFile}`);
  if (bug.jiraKey) throw new Error(`${a.id} is already posted as ${bug.jiraKey}.`);
  const env = loadEnv();
  const project = a.project || env.JIRA_PROJECT_KEY;
  if (!project) throw new Error('No Jira project: pass --project or set JIRA_PROJECT_KEY in .env');
  const jiraText = fs.readFileSync(path.join(a['run-dir'], 'bugs', `${bug.id}.jira.txt`), 'utf8');
  const description = jiraText.split(/\r?\n/).filter((l) => !/^(Summary|Issue type|Labels):/.test(l)).join('\n');
  const priorityName = { P1: 'Highest', P2: 'High', P3: 'Medium', P4: 'Low' }[bug.priority];
  const fields = { project: { key: project }, issuetype: { name: 'Bug' }, summary: `[${bug.storyId}] ${bug.title}`.slice(0, 250),
    description: toAdf(description), labels: bug.labels.map((l) => l.replace(/\s+/g, '-')) };
  if (priorityName && !a['no-priority']) fields.priority = { name: priorityName };
  const attachments = bug.evidence.map((e) => path.resolve(a['run-dir'], 'bugs', e)).filter((p) => fs.existsSync(p));
  const plan = [{ method: 'POST', route: '/rest/api/3/issue', body: { fields } },
    ...attachments.map((p) => ({ method: 'POST', route: '/rest/api/3/issue/<new key>/attachments', file: path.relative(ROOT, p) })),
    ...(a.link ? [{ method: 'POST', route: '/rest/api/3/issueLink', body: { type: { name: 'Relates' }, inwardIssue: { key: '<new key>' }, outwardIssue: { key: a.link } } }] : [])];
  if (!a.execute) return { dryRun: true, nothingWritten: true, plan, note: 'Show this plan to the user. Run again with --execute --approved-by "<name>" only after they approve it.' };
  if (!a['approved-by'] || a['approved-by'] === true) throw new Error('--execute needs --approved-by "<name of the user who approved this plan>"');
  const cfg = config(true);
  const ledger = [];
  try {
    const created = await call(cfg, 'POST', '/rest/api/3/issue', { fields });
    ledger.push(`created ${created.key}`);
    for (const p of attachments) {
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(p)]), path.basename(p));
      await call(cfg, 'POST', `/rest/api/3/issue/${created.key}/attachments`, form, { 'X-Atlassian-Token': 'no-check' });
      ledger.push(`attached ${path.basename(p)}`);
    }
    if (a.link) { await call(cfg, 'POST', '/rest/api/3/issueLink', { type: { name: 'Relates' }, inwardIssue: { key: created.key }, outwardIssue: { key: a.link } }); ledger.push(`linked to ${a.link}`); }
    bug.jiraKey = created.key;
    bug.status = 'Posted';
    fs.writeFileSync(bugsFile, JSON.stringify(doc, null, 2) + '\n');
    recordPost(a['run-dir'], `bug ${bug.id}`, `${cfg.base}/browse/${created.key}`, a['approved-by']);
    return { posted: true, key: created.key, url: `${cfg.base}/browse/${created.key}`, ledger };
  } catch (e) {
    throw new Error(`${e.message}\nWhat landed before the failure: ${ledger.join(', ') || 'nothing'}. No retry, no cleanup: tell the user.`);
  }
}

const COMMANDS = { read, comment, 'create-bug': createBug };

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0];
  if (!COMMANDS[cmd]) { process.stderr.write(`Usage: jira.js <${Object.keys(COMMANDS).join('|')}> ... (writes are dry runs unless --execute)\n`); process.exit(2); }
  COMMANDS[cmd](a).then((res) => process.stdout.write(JSON.stringify(res, null, 2) + '\n'))
    .catch((e) => { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(1); });
}

module.exports = { toAdf, adfToText, loadEnv, guardRun };
