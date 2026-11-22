#!/usr/bin/env node
'use strict';
/*
 * pipeline.js - the orchestrator's state keeper and referee. It trusts validators, not "done".
 *
 *   init      --out-root test-output --story <ID> --story-title "<title>" --epic "<epic name>" [--epic-file <md>]
 *             [--base-url <url>] [--scope <n>] [--headed] [--dashboard] [--hosts a,b] [--sample] [--date YYYY-MM-DD]
 *   configure --run-dir <dir> [--base-url] [--scope] [--headed true|false] [--dashboard true|false] [--hosts]
 *   status    --run-dir <dir> [--json]
 *   start     <stage> --run-dir <dir>
 *   complete  <stage> --run-dir <dir>         (runs the stage validator; Done only if it passes)
 *   check     <stage|all> --run-dir <dir>      (validators only, no state change)
 *   notice    --run-dir <dir>                  (drafts gate/blocking-notice.md; never sent)
 *   gate      --run-dir <dir> --decision ready|override|wait [--by "<name>"] [--why "<reason>"] [--words "<user's own words>"]
 *   note      --run-dir <dir> --text "<data left behind, flaky notes, ...>"
 *   summary   --run-dir <dir>                  (drafts summary/run-summary.md)
 *   record-post --run-dir <dir> --what "<bug BUG-001>" --target "<Jira PROJ-12>"   (used by jira.js)
 *
 * Stages: analysis, gate, testcases, execution, bugs, report, summary
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const STAGES = ['analysis', 'gate', 'testcases', 'execution', 'bugs', 'report', 'summary'];
const SUBDIRS = { analysis: 'analysis', gate: 'gate', testcases: 'testcases', execution: 'execution', bugs: 'bugs', report: 'report', summary: 'summary' };
const AGENTS = { analysis: 'requirements-analyst', gate: 'orchestrator + user', testcases: 'test-designer', execution: 'qc-execution', bugs: 'bug-reporter', report: 'report-builder', summary: 'orchestrator' };

const skill = (p) => require(path.join(ROOT, p));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || /^--[a-zA-Z]/.test(next)) out[a.slice(2)] = true; else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const nowIso = () => new Date().toISOString();
const bool = (v) => v === true || v === 'true' || v === 'yes';

function slug(s) { return String(s).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function statePath(dir) { return path.join(dir, 'pipeline-state.json'); }
function load(dir) {
  if (!dir) throw new Error('--run-dir is required');
  if (!fs.existsSync(statePath(dir))) throw new Error(`No pipeline-state.json in ${dir}. Run "init" first.`);
  return readJson(statePath(dir));
}
function save(dir, st) {
  st.updatedAt = nowIso();
  const tmp = statePath(dir) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2) + '\n');
  fs.renameSync(tmp, statePath(dir));
}
function files(dir, st) {
  const id = st.story.id;
  return {
    analysis: path.join(dir, 'analysis'),
    questions: path.join(dir, 'analysis', `${id}-questions.json`),
    impact: path.join(dir, 'analysis', `${id}-impact.json`),
    result: path.join(dir, 'analysis', `${id}-result.md`),
    notice: path.join(dir, 'gate', 'blocking-notice.md'),
    gateRecord: path.join(dir, 'gate', 'gate-record.md'),
    suite: path.join(dir, 'testcases', `${id}-testcases.json`),
    suiteMd: path.join(dir, 'testcases', `${id}-testcases.md`),
    suiteCsv: path.join(dir, 'testcases', `${id}-testcases.csv`),
    results: path.join(dir, 'execution', 'run', 'results.json'),
    automation: path.join(dir, 'execution', `${id}-automation.json`),
    bugs: path.join(dir, 'bugs', 'bugs.json'),
    report: path.join(dir, 'report', 'report.html'),
    summary: path.join(dir, 'summary', 'run-summary.md'),
  };
}

// ---------- init / configure ----------
function init(a) {
  for (const k of ['out-root', 'story', 'story-title', 'epic']) if (!a[k] || a[k] === true) throw new Error(`init needs --${k}`);
  const date = a.date || new Date().toISOString().slice(0, 10);
  const base = `${slug(a.story)}_${slug(a['story-title'])}_${slug(a.epic)}_${date}`;
  let dir = path.resolve(a['out-root'], base);
  for (let v = 2; fs.existsSync(dir); v++) dir = path.resolve(a['out-root'], `${base}-v${v}`);
  for (const s of Object.values(SUBDIRS)) fs.mkdirSync(path.join(dir, s), { recursive: true });
  const st = {
    schemaVersion: 1,
    runId: path.basename(dir),
    createdAt: nowIso(),
    sample: bool(a.sample),
    story: { id: a.story, title: a['story-title'] },
    epic: { name: a.epic, file: a['epic-file'] && a['epic-file'] !== true ? a['epic-file'] : null },
    config: {
      baseUrl: a['base-url'] && a['base-url'] !== true ? a['base-url'] : null,
      approvedHosts: a.hosts ? String(a.hosts).split(',').map((h) => h.trim()) : null,
      scope: a.scope ? Number(a.scope) : null,
      headed: bool(a.headed),
      dashboard: bool(a.dashboard),
    },
    stages: Object.fromEntries(STAGES.map((s) => [s, { status: 'Pending', agent: AGENTS[s], startedAt: null, completedAt: null, errors: [] }])),
    gate: { decision: null, conditions: null, by: null, why: null, words: null, at: null, noticeShownFirst: false },
    posted: [],
    notes: [],
  };
  if (st.config.baseUrl && !st.config.approvedHosts) st.config.approvedHosts = [new URL(st.config.baseUrl).hostname];
  save(dir, st);
  return { runDir: dir, state: st };
}

function configure(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  if (a['base-url']) { st.config.baseUrl = a['base-url']; if (!a.hosts) st.config.approvedHosts = [new URL(a['base-url']).hostname]; }
  if (a.hosts) st.config.approvedHosts = String(a.hosts).split(',').map((h) => h.trim());
  if (a.scope) st.config.scope = Number(a.scope);
  if (a.headed !== undefined) st.config.headed = bool(a.headed);
  if (a.dashboard !== undefined) st.config.dashboard = bool(a.dashboard);
  save(dir, st);
  return st.config;
}

// ---------- gate ----------
function gateConditions(dir, st) {
  const f = files(dir, st);
  if (!fs.existsSync(f.questions)) return null;
  const q = readJson(f.questions);
  const open = (q.questions || []).filter((x) => x.status !== 'Answered');
  return {
    allAnswered: open.length === 0,
    requirementClear: q.clarity === 'Clear',
    jiraUpdated: q.jiraUpdated === true,
    emailUpdated: q.emailUpdated === true,
    openQuestions: open.map((x) => ({ id: x.id, priority: x.priority, question: x.question })),
  };
}
const gateMet = (c) => c && c.allAnswered && c.requirementClear && c.jiraUpdated && c.emailUpdated;

function notice(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  if (st.stages.analysis.status !== 'Done') throw new Error('Stage 1 (analysis) must be Done before the blocking notice is drafted.');
  const c = gateConditions(dir, st);
  const f = files(dir, st);
  const mark = (ok) => (ok ? 'Met' : '**Not met**');
  const lines = ['<!-- DRAFT. Not sent. Shown to the user together with the analysis, before any gate question. -->'];
  if (st.sample) lines.push('> SAMPLE. Never send.', '');
  lines.push(`# Blocking notice: ${st.story.id} ${st.story.title}`, '',
    `Test design for **${st.story.id}** is blocked until the readiness gate is met.`, '',
    '| Gate condition | State |', '|---|---|',
    `| 1. All requirement questions answered | ${mark(c.allAnswered)}${c.allAnswered ? '' : ` (${c.openQuestions.length} open)`} |`,
    `| 2. Requirement clear | ${mark(c.requirementClear)} |`,
    `| 3. Jira updated with the answers | ${mark(c.jiraUpdated)} |`,
    `| 4. Stakeholder email updated | ${mark(c.emailUpdated)} |`, '');
  if (c.openQuestions.length) {
    lines.push('## Open questions', '');
    for (const q of c.openQuestions) lines.push(`- **${q.id}** [${q.priority || 'Medium'}] ${q.question}`);
    lines.push('');
  }
  lines.push('## What this means', '',
    '- No test cases are designed or run for this story until the conditions are met, or the tester records an override.',
    '- An override is the tester\'s decision, in their own words, with who and why recorded. Every suite, result, report and bug from an override carries a "Tester override" label and is never posted.', '',
    `Analysis: \`analysis/${path.basename(f.result)}\`. Email draft and Jira comment draft are in \`analysis/\` (not sent, not posted).`, '');
  fs.writeFileSync(f.notice, lines.join('\n'));
  st.gate.conditions = c;
  st.gate.noticeDraftedAt = nowIso();
  save(dir, st);
  return { notice: f.notice, conditions: c, met: gateMet(c) };
}

function gate(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  const decision = String(a.decision || '').toLowerCase();
  if (!['ready', 'override', 'wait'].includes(decision)) throw new Error('--decision must be ready, override or wait');
  if (st.stages.analysis.status !== 'Done') throw new Error('The gate is decided after stage 1 is Done and the user has seen the analysis.');
  const f = files(dir, st);
  const c = gateConditions(dir, st);
  st.gate.conditions = c;
  if (decision === 'ready') {
    if (!gateMet(c)) throw new Error(`The gate is not met (${Object.entries(c).filter(([k, v]) => typeof v === 'boolean' && !v).map(([k]) => k).join(', ')}). Only "override" (the user's decision) or "wait" are possible.`);
    st.gate = { ...st.gate, decision: 'Ready', by: a.by && a.by !== true ? a.by : 'conditions met', at: nowIso() };
  } else if (decision === 'override') {
    if (!fs.existsSync(f.notice)) throw new Error('Draft the blocking notice first ("notice") and show it to the user with the analysis. An override is never asked before that.');
    for (const k of ['by', 'why', 'words']) if (!a[k] || a[k] === true) throw new Error(`An override needs --${k}: who decided, why, and the user's own words.`);
    if (gateMet(c)) throw new Error('The gate is met: use --decision ready, not an override.');
    st.gate = { ...st.gate, decision: 'Override', by: a.by, why: a.why, words: a.words, at: nowIso(), noticeShownFirst: true };
  } else {
    st.gate = { ...st.gate, decision: 'Wait', by: a.by && a.by !== true ? a.by : null, why: a.why && a.why !== true ? a.why : null, at: nowIso() };
  }
  const rec = [`# Gate record: ${st.story.id}`, '', `- Decision: **${st.gate.decision}**`, `- At: ${st.gate.at}`, `- By: ${st.gate.by || '-'}`];
  if (st.gate.why) rec.push(`- Why: ${st.gate.why}`);
  if (st.gate.words) rec.push(`- User's words: "${st.gate.words}"`);
  rec.push('', '| Condition | Met |', '|---|---|', ...['allAnswered', 'requirementClear', 'jiraUpdated', 'emailUpdated'].map((k) => `| ${k} | ${c[k] ? 'yes' : 'no'} |`));
  if (st.gate.decision === 'Override') rec.push('', '> TESTER OVERRIDE. Everything produced after this point is labelled and never posted.');
  fs.writeFileSync(f.gateRecord, rec.join('\n') + '\n');
  st.stages.gate.status = st.gate.decision === 'Wait' ? 'Waiting' : 'InProgress';
  save(dir, st);
  return st.gate;
}

// ---------- validators ----------
function checkStage(dir, st, stage) {
  const f = files(dir, st);
  const errors = [];
  const req = (file, label) => { if (!fs.existsSync(file)) errors.push(`missing ${label || path.relative(dir, file)}`); return fs.existsSync(file); };
  switch (stage) {
    case 'analysis': {
      const r = skill('skill/1-RequirmentAnalysisSkill/scripts/validate_analysis.js').validateAnalysis(f.analysis, st.story.id);
      errors.push(...r.errors);
      if (fs.existsSync(f.questions) && !!readJson(f.questions).sample !== !!st.sample) errors.push('SAMPLE label differs between the run and the questions file');
      break;
    }
    case 'gate': {
      if (!['Ready', 'Override'].includes(st.gate.decision)) errors.push(`gate decision is ${st.gate.decision || 'not recorded'}; it must be Ready or Override to continue`);
      if (st.gate.decision === 'Override') {
        req(f.notice, 'gate/blocking-notice.md');
        if (!st.gate.by || !st.gate.why || !st.gate.words) errors.push('override without who/why/the user\'s words');
      }
      req(f.gateRecord, 'gate/gate-record.md');
      break;
    }
    case 'testcases': {
      if (!req(f.suite)) break;
      req(f.suiteMd); req(f.suiteCsv);
      const suite = readJson(f.suite);
      const r = skill('skill/2-TestCaseCreationSkill/scripts/validate_testcases.js').validateSuite(suite, {
        impact: fs.existsSync(f.impact) ? readJson(f.impact) : null, questions: fs.existsSync(f.questions) ? readJson(f.questions) : null });
      errors.push(...r.errors);
      if (!fs.existsSync(f.impact)) errors.push('impact file missing: impacted coverage cannot be checked');
      if (!!suite.override !== (st.gate.decision === 'Override')) errors.push(`suite override=${!!suite.override} but the gate decision is ${st.gate.decision}`);
      if (!!suite.sample !== !!st.sample) errors.push('SAMPLE label differs between the run and the suite');
      if (st.config.scope && suite.testCases.length > st.config.scope) errors.push(`${suite.testCases.length} cases exceed the agreed scope of ${st.config.scope}`);
      if (st.config.baseUrl && suite.baseUrl !== st.config.baseUrl) errors.push(`suite baseUrl ${suite.baseUrl} differs from the agreed ${st.config.baseUrl}`);
      break;
    }
    case 'execution': {
      if (!req(f.results, 'execution/run/results.json')) break;
      const r = skill('skill/3-TestExecutionSkill/scripts/validate_results.js').validateResults(f.results, { suite: f.suite });
      errors.push(...r.errors);
      if (req(f.automation)) {
        const au = readJson(f.automation);
        if (au.automationCode !== false) errors.push('automation.json must state automationCode: false (the agent drives playwright-cli, no code)');
        if (au.tool !== 'playwright-cli') errors.push('automation.json tool must be playwright-cli');
      }
      const res = readJson(f.results);
      const lib = skill('skill/3-TestExecutionSkill/scripts/lib.js');
      if (st.config.approvedHosts && !lib.hostAllowed(res.baseUrl, st.config.approvedHosts)) errors.push(`run base URL ${res.baseUrl} is outside the approved hosts`);
      break;
    }
    case 'bugs': {
      if (!req(f.bugs, 'bugs/bugs.json')) break;
      const r = skill('skill/4-BugReportSkill/scripts/validate_bugs.js').validateBugs(f.bugs, { results: f.results });
      errors.push(...r.errors);
      break;
    }
    case 'report': {
      if (!req(f.report, 'report/report.html')) break;
      const data = skill('skill/5-ExtentReportSkill/scripts/render.js').extractData(fs.readFileSync(f.report, 'utf8'));
      if (!data) { errors.push('report.html has no embedded report data'); break; }
      if (fs.existsSync(f.results)) {
        const res = readJson(f.results);
        for (const k of ['total', 'Passed', 'Failed', 'Error', 'Flaky', 'Blocked', 'Skipped', 'Not Run']) {
          if ((data.summary[k] || 0) !== (res.summary[k] || 0)) errors.push(`report ${k}=${data.summary[k]} but results ${k}=${res.summary[k]}`);
        }
        if (data.sample !== !!res.sample || data.override !== !!res.override) errors.push('report banners (SAMPLE/override) differ from the results');
      }
      if (fs.existsSync(f.bugs) && data.bugs.length !== (readJson(f.bugs).bugs || []).length) errors.push('report bug count differs from bugs.json');
      break;
    }
    case 'summary': {
      if (!req(f.summary, 'summary/run-summary.md')) break;
      const md = fs.readFileSync(f.summary, 'utf8');
      if (!/^## Not posted or sent/m.test(md)) errors.push('run-summary.md has no "## Not posted or sent" section');
      if (st.sample && !/SAMPLE/.test(md)) errors.push('SAMPLE run summary is not labelled SAMPLE');
      if (st.gate.decision === 'Override' && !/TESTER OVERRIDE/.test(md)) errors.push('override run summary is not labelled TESTER OVERRIDE');
      break;
    }
    default: throw new Error(`Unknown stage "${stage}". Stages: ${STAGES.join(', ')}`);
  }
  return { stage, ok: errors.length === 0, errors };
}

function start(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  const stage = a._[1];
  const i = STAGES.indexOf(stage);
  if (i < 0) throw new Error(`Unknown stage "${stage}". Stages: ${STAGES.join(', ')}`);
  for (const prev of STAGES.slice(0, i)) {
    if (st.stages[prev].status !== 'Done') throw new Error(`Cannot start ${stage}: ${prev} is ${st.stages[prev].status}, not Done.`);
  }
  if (stage === 'execution' && !st.config.baseUrl) throw new Error('No base URL agreed with the user (configure --base-url).');
  st.stages[stage].status = 'InProgress';
  st.stages[stage].startedAt = nowIso();
  save(dir, st);
  return st.stages[stage];
}

function complete(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  const stage = a._[1];
  const i = STAGES.indexOf(stage);
  if (i < 0) throw new Error(`Unknown stage "${stage}"`);
  for (const prev of STAGES.slice(0, i)) {
    if (st.stages[prev].status !== 'Done') throw new Error(`Cannot complete ${stage}: ${prev} is ${st.stages[prev].status}, not Done.`);
  }
  const r = checkStage(dir, st, stage);
  st.stages[stage].errors = r.errors;
  st.stages[stage].status = r.ok ? 'Done' : 'Failed';
  if (r.ok) st.stages[stage].completedAt = nowIso();
  save(dir, st);
  return r;
}

function check(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  const which = a._[1] === 'all' || !a._[1] ? STAGES : [a._[1]];
  return which.map((s) => checkStage(dir, st, s));
}

function note(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  if (!a.text || a.text === true) throw new Error('--text is required');
  st.notes.push({ at: nowIso(), text: a.text });
  save(dir, st);
  return st.notes;
}

function recordPost(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  if (st.sample) throw new Error('SAMPLE runs are never posted.');
  if (st.gate.decision === 'Override') throw new Error('Tester-override runs are never posted.');
  st.posted.push({ at: nowIso(), what: a.what, target: a.target, approvedBy: a['approved-by'] || null });
  save(dir, st);
  return st.posted;
}

// ---------- summary ----------
function summary(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  const f = files(dir, st);
  const results = fs.existsSync(f.results) ? readJson(f.results) : null;
  const bugs = fs.existsSync(f.bugs) ? readJson(f.bugs) : null;
  const suite = fs.existsSync(f.suite) ? readJson(f.suite) : null;
  const q = fs.existsSync(f.questions) ? readJson(f.questions) : null;
  const L = [`# Run summary: ${st.story.id} ${st.story.title}`, ''];
  if (st.sample) L.push('> SAMPLE RUN. Not a real result. Never post.', '');
  if (st.gate.decision === 'Override') L.push(`> **TESTER OVERRIDE.** The readiness gate was not met. Decided by ${st.gate.by}: "${st.gate.words}". Why: ${st.gate.why}.`, '');
  if (suite && suite.observationDerived) L.push('> **Observation-derived** expected results in this suite: a pass means "behaves as observed", not "correct".', '');
  L.push(`- Run folder: \`${st.runId}\``, `- Epic: ${st.epic.name}`, `- Base URL: ${st.config.baseUrl || '-'} (approved hosts: ${(st.config.approvedHosts || []).join(', ') || '-'})`,
    `- Execution: Playwright agent-cli (\`playwright-cli\`), ${st.config.headed ? 'headed' : 'headless'}, no automation code${results ? `, session \`${results.session}\`` : ''}`, '');
  L.push('## Stages', '', '| # | Stage | Agent | Status | Validator |', '|---|---|---|---|---|');
  STAGES.forEach((s, i) => L.push(`| ${i + 1} | ${s} | ${st.stages[s].agent} | ${s === 'summary' ? 'this file' : st.stages[s].status} | ${st.stages[s].errors && st.stages[s].errors.length ? st.stages[s].errors.length + ' error(s)' : (st.stages[s].status === 'Done' ? 'passed' : '-')} |`));
  L.push('', '## Readiness gate', '', `Decision: **${st.gate.decision || 'not decided'}**${st.gate.by ? ` by ${st.gate.by}` : ''}.`);
  if (q) L.push(`Questions: ${q.questions.length} total, ${q.questions.filter((x) => x.status === 'Open').length} still open. Clarity: ${q.clarity}.`);
  L.push('');
  if (results) {
    const fmt = (s) => `${s.total} cases: ${['Passed', 'Failed', 'Error', 'Flaky', 'Blocked', 'Skipped', 'Not Run'].filter((k) => s[k]).map((k) => `${k} ${s[k]}`).join(', ')}`;
    L.push('## Results', '', `- **All:** ${fmt(results.summary)}${results.summary.passRate != null ? ` (pass rate ${results.summary.passRate}% of decided tests)` : ''}`);
    for (const [scope, s] of Object.entries(results.summaryByScope || {})) L.push(`- **${scope === 'Target' ? 'Story (Target)' : 'Impacted modules'}:** ${fmt(s)}`);
    L.push('');
    const issues = results.results.filter((r) => ['Failed', 'Error', 'Flaky', 'Blocked'].includes(r.status));
    if (issues.length) {
      L.push('| Test | Scope | Status | Detail |', '|---|---|---|---|');
      for (const r of issues) {
        const fs1 = (r.steps || []).find((s) => s.status === 'fail' || s.status === 'error');
        L.push(`| ${r.id} ${r.title} | ${r.scope}${r.impactRef ? ` ${r.impactRef}` : ''} | ${r.status} | ${(r.reason || (fs1 && fs1.actual) || '').replace(/\|/g, '/')} |`);
      }
      L.push('');
    }
    L.push('Failed = an assertion did not hold. Error = the test could not run as designed. Both are reported as they are.', '');
  }
  if (bugs) {
    L.push('## Bugs', '', `${bugs.bugs.length} drafted${bugs.bugs.length ? ':' : '.'}`);
    for (const b of bugs.bugs) L.push(`- ${b.id} [${b.severity}/${b.priority}] ${b.title}${b.regression ? ' (regression)' : ''}${b.jiraKey ? ` - posted as ${b.jiraKey}` : ''}`);
    if ((bugs.notBugs || []).length) L.push('', `Not filed as bugs: ${bugs.notBugs.map((d) => `${d.testId} (${d.decision})`).join(', ')}.`);
    L.push('');
  }
  if (st.notes.length) { L.push('## Notes, data left behind, cleanup', ''); for (const n of st.notes) L.push(`- ${n.text}`); L.push(''); }
  L.push('## Not posted or sent', '');
  const posted = st.posted.map((p) => p.what);
  const drafts = [
    [`analysis/${st.story.id}-email-draft.md`, 'stakeholder email'],
    [`analysis/${st.story.id}-jira-comment.md`, 'Jira comment with the questions'],
    ['gate/blocking-notice.md', 'blocking notice'],
  ];
  for (const [p, label] of drafts) if (fs.existsSync(path.join(dir, p)) && !posted.some((x) => x && x.includes(label))) L.push(`- ${label}: \`${p}\` (draft, not sent)`);
  for (const b of (bugs && bugs.bugs) || []) if (!b.jiraKey) L.push(`- ${b.id}: \`bugs/${b.id}.md\`, Jira text \`bugs/${b.id}.jira.txt\` (not posted)`);
  L.push('- Reports stay local: `report/report.html`');
  if (st.posted.length) { L.push('', '## Posted (with the user\'s approval)', ''); for (const p of st.posted) L.push(`- ${p.at}: ${p.what} -> ${p.target}${p.approvedBy ? ` (approved by ${p.approvedBy})` : ''}`); }
  if (st.sample || st.gate.decision === 'Override') L.push('', `Nothing from this run may be posted: it is ${st.sample ? 'a SAMPLE run' : 'a TESTER OVERRIDE run'}.`);
  fs.writeFileSync(f.summary, L.join('\n') + '\n');
  return { summary: f.summary };
}

function status(a) {
  const dir = a['run-dir'];
  const st = load(dir);
  return st;
}

function printStatus(st) {
  const lines = [`Run ${st.runId}${st.sample ? '  [SAMPLE]' : ''}${st.gate.decision === 'Override' ? '  [TESTER OVERRIDE]' : ''}`,
    `Story ${st.story.id} ${st.story.title} | Epic ${st.epic.name} | URL ${st.config.baseUrl || '-'} | scope ${st.config.scope || '-'} | ${st.config.headed ? 'headed' : 'headless'} | dashboard ${st.config.dashboard ? 'yes' : 'no'}`, ''];
  STAGES.forEach((s, i) => {
    const x = st.stages[s];
    lines.push(`${i + 1}. ${s.padEnd(10)} ${x.status.padEnd(11)} ${x.agent}${x.errors && x.errors.length ? `\n     ${x.errors.slice(0, 5).join('\n     ')}` : ''}`);
  });
  lines.push('', `Gate: ${st.gate.decision || 'not decided'}${st.gate.by ? ` (by ${st.gate.by})` : ''}`, `Posted: ${st.posted.length ? st.posted.map((p) => p.what).join(', ') : 'nothing'}`);
  return lines.join('\n');
}

const COMMANDS = { init, configure, status, start, complete, check, notice, gate, note, summary, 'record-post': recordPost };

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0];
  if (!COMMANDS[cmd]) { process.stderr.write(`Usage: pipeline.js <${Object.keys(COMMANDS).join('|')}> ...\n`); process.exit(2); }
  try {
    const res = COMMANDS[cmd](a);
    if (a.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    else if (cmd === 'status') process.stdout.write(printStatus(res) + '\n');
    else if (cmd === 'init') process.stdout.write(`Run folder: ${res.runDir}\n`);
    else if (cmd === 'complete') {
      process.stdout.write(`${res.ok ? 'DONE' : 'FAILED'}: ${res.stage}\n${res.errors.map((e) => `  error: ${e}`).join('\n')}${res.errors.length ? '\n' : ''}`);
      process.exit(res.ok ? 0 : 1);
    } else if (cmd === 'check') {
      for (const r of res) process.stdout.write(`${r.ok ? 'OK  ' : 'FAIL'} ${r.stage}${r.errors.map((e) => `\n     ${e}`).join('')}\n`);
      process.exit(res.every((r) => r.ok) ? 0 : 1);
    } else process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  } catch (e) { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(1); }
}

module.exports = { init, configure, status, start, complete, check, notice, gate, note, summary, recordPost, checkStage, gateConditions, STAGES, files };
