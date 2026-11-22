#!/usr/bin/env node
'use strict';
/*
 * record_result.js - the execution agent's recorder. The agent drives playwright-cli itself
 * (no automation code); this script records what happened, step by step, and refuses
 * anything that would make the record dishonest.
 *
 *   start  --out <dir> --suite <suite.json> --base-url <url> [--headed] [--label <name>] [--hosts a.com,b.com]
 *   show   --out <dir> --test <TC-ID> [--json]
 *   begin  --out <dir> --test <TC-ID> [--retry]
 *   step   --out <dir> --test <TC-ID> --n <step no> --status pass|fail|error|skip --actual "<what you saw>"
 *          [--screenshot <path relative to out>] [--command "<playwright-cli command>"]
 *   end    --out <dir> --test <TC-ID> --status Passed|Failed|Error [--reason "..."] [--infra]
 *          [--screenshot <path>] [--note "..."]
 *   note   --out <dir> --test <TC-ID> --text "..."   (append a note, e.g. console errors read after end; never changes a status)
 *   finish --out <dir>
 *   status --out <dir>
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

function resultsPath(out) { return path.join(out, 'results.json'); }
function logPath(out) { return path.join(out, 'execution-log.md'); }

function log(out, line) {
  fs.appendFileSync(logPath(out), `- ${L.nowIso()} ${line}\n`, 'utf8');
}

function load(out) {
  const p = resultsPath(out);
  if (!fs.existsSync(p)) throw new Error(`No run at ${out}. Run "start" first.`);
  return L.readJson(p);
}

function save(out, run) {
  run.summary = L.summarize(run.results);
  run.summaryByScope = L.summarizeByScope(run.results);
  run.updatedAt = L.nowIso();
  L.writeJsonAtomic(resultsPath(out), run);
}

function loadSuite(run) { return L.readJson(run.suitePath); }

function findResult(run, id) {
  const r = run.results.find((x) => x.id === id);
  if (!r) throw new Error(`Test ${id} is not in suite ${run.suiteId}`);
  return r;
}

function start(opts) {
  const { out, suite: suitePath } = opts;
  if (!out || !suitePath || !opts.baseUrl) throw new Error('start needs --out, --suite and --base-url');
  if (fs.existsSync(resultsPath(out))) {
    const prev = L.readJson(resultsPath(out));
    if (prev.status === 'running') throw new Error(`A run is already in progress in ${out}. Finish it or use a new folder.`);
    throw new Error(`${out} already holds a finished run. Re-runs go in a new folder (add -v2).`);
  }
  const suite = L.readJson(suitePath);
  const hosts = opts.hosts ? String(opts.hosts).split(',').map((s) => s.trim()).filter(Boolean)
    : [new URL(opts.baseUrl).hostname];
  if (!L.hostAllowed(opts.baseUrl, hosts)) throw new Error(`Base URL ${opts.baseUrl} is outside the approved hosts ${hosts.join(', ')}`);
  fs.mkdirSync(path.join(out, 'evidence'), { recursive: true });
  const run = {
    schemaVersion: 1,
    suiteId: suite.suiteId,
    storyId: suite.storyId,
    storyTitle: suite.storyTitle,
    epic: suite.epic,
    suitePath: path.resolve(suitePath),
    baseUrl: opts.baseUrl,
    approvedHosts: hosts,
    headed: !!opts.headed,
    session: L.sessionName(opts.label || suite.storyId || 'run'),
    sample: !!suite.sample,
    override: !!suite.override,
    observationDerived: !!suite.observationDerived,
    status: 'running',
    startedAt: L.nowIso(),
    finishedAt: null,
    results: (suite.testCases || []).map((tc) => ({
      id: tc.id,
      title: tc.title,
      scope: tc.scope || 'Target',
      impactRef: tc.impactRef || null,
      priority: tc.priority || null,
      caseStatus: tc.status,
      status: 'Not Run',
      attempts: 0,
      startedAt: null,
      endedAt: null,
      durationMs: null,
      steps: [],
      evidence: [],
      reason: null,
      note: null,
      infra: false,
      history: [],
    })),
  };
  save(out, run);
  fs.writeFileSync(logPath(out), `# Execution log: ${run.suiteId} (${run.storyId})\n\n`
    + `${run.sample ? '> SAMPLE RUN. Not a real result. Never post.\n\n' : ''}`
    + `${run.override ? '> TESTER OVERRIDE. The readiness gate was not met. See gate/.\n\n' : ''}`
    + `- Base URL: ${run.baseUrl}\n- Approved hosts: ${hosts.join(', ')}\n- Session: \`${run.session}\`\n- Mode: ${run.headed ? 'headed' : 'headless'}\n\n## Events\n`, 'utf8');
  log(out, `START session=${run.session}`);
  return run;
}

function show(opts) {
  const run = load(opts.out);
  const suite = loadSuite(run);
  const tc = L.testCaseIndex(suite).get(opts.test);
  if (!tc) throw new Error(`Test ${opts.test} is not in suite ${run.suiteId}`);
  return { session: run.session, baseUrl: run.baseUrl, testCase: tc, runnable: tc.status === 'Ready' };
}

function begin(opts) {
  const run = load(opts.out);
  const suite = loadSuite(run);
  const tc = L.testCaseIndex(suite).get(opts.test);
  if (!tc) throw new Error(`Test ${opts.test} is not in suite ${run.suiteId}`);
  if (run.status !== 'running') throw new Error('This run is finished.');
  if (tc.status !== 'Ready') throw new Error(`${tc.id} is ${tc.status}, not Ready. Only Ready test cases are run.`);
  const r = findResult(run, tc.id);
  if (r.status === 'Running') throw new Error(`${tc.id} is already running. End it first.`);
  if (r.attempts > 0) {
    if (!opts.retry) throw new Error(`${tc.id} already ran (${r.status}). Use --retry only after an infrastructure Error.`);
    if (r.attempts >= 2) throw new Error(`${tc.id} already used its single retry.`);
    if (!(r.status === 'Error' && r.infra)) throw new Error(`${tc.id} may be retried only after an Error ended with --infra. A product failure is never retried.`);
    r.history.push({ attempt: r.attempts, status: r.status, reason: r.reason, steps: r.steps, endedAt: r.endedAt });
    r.steps = [];
    r.reason = null;
    r.infra = false;
  }
  r.attempts += 1;
  r.status = 'Running';
  r.startedAt = L.nowIso();
  r.endedAt = null;
  save(opts.out, run);
  log(opts.out, `BEGIN ${tc.id} attempt=${r.attempts}`);
  return r;
}

function evidencePath(out, rel) {
  if (!rel) return null;
  const abs = path.resolve(out, rel);
  if (!fs.existsSync(abs)) throw new Error(`Screenshot not found: ${abs}. Take it with: playwright-cli -s=<session> screenshot --filename=<path>`);
  return path.relative(path.resolve(out), abs).split(path.sep).join('/');
}

function step(opts) {
  const run = load(opts.out);
  const r = findResult(run, opts.test);
  if (r.status !== 'Running') throw new Error(`${opts.test} is not running. Run "begin" first.`);
  const suite = loadSuite(run);
  const tc = L.testCaseIndex(suite).get(opts.test);
  const n = Number(opts.n);
  if (!Number.isInteger(n) || n < 1 || n > tc.steps.length) throw new Error(`--n must be 1..${tc.steps.length} for ${tc.id}`);
  if (!L.STEP_STATUSES.includes(opts.status)) throw new Error(`--status must be one of ${L.STEP_STATUSES.join(', ')}`);
  if (opts.status !== 'skip' && (!opts.actual || opts.actual === true)) throw new Error('--actual is required: record what you actually saw.');
  if (r.steps.some((s) => s.n === n)) throw new Error(`Step ${n} of ${tc.id} is already recorded.`);
  const def = tc.steps[n - 1];
  const shot = evidencePath(opts.out, opts.screenshot);
  const rec = {
    n,
    action: def.action,
    expected: def.expected || '',
    actual: opts.actual === true ? '' : (opts.actual || ''),
    status: opts.status,
    screenshot: shot,
    commands: [].concat(opts.command || []).filter((c) => c !== true),
    at: L.nowIso(),
  };
  r.steps.push(rec);
  r.steps.sort((a, b) => a.n - b.n);
  if (shot && !r.evidence.includes(shot)) r.evidence.push(shot);
  save(opts.out, run);
  log(opts.out, `STEP ${tc.id}#${n} ${opts.status}: ${rec.actual}`);
  return rec;
}

function end(opts) {
  const run = load(opts.out);
  const r = findResult(run, opts.test);
  if (r.status !== 'Running') throw new Error(`${opts.test} is not running.`);
  const suite = loadSuite(run);
  const tc = L.testCaseIndex(suite).get(opts.test);
  const status = opts.status;
  if (!L.END_STATUSES.includes(status)) throw new Error(`--status must be one of ${L.END_STATUSES.join(', ')}`);
  const shot = evidencePath(opts.out, opts.screenshot);
  if (shot && !r.evidence.includes(shot)) r.evidence.push(shot);
  const recorded = new Set(r.steps.map((s) => s.n));
  const missing = tc.steps.map((_, i) => i + 1).filter((n) => !recorded.has(n));
  const failedSteps = r.steps.filter((s) => s.status === 'fail');
  const errorSteps = r.steps.filter((s) => s.status === 'error');
  if (status === 'Passed') {
    if (missing.length) throw new Error(`Cannot pass ${tc.id}: steps ${missing.join(', ')} are not recorded.`);
    const notPass = r.steps.filter((s) => s.status !== 'pass');
    if (notPass.length) throw new Error(`Cannot pass ${tc.id}: steps ${notPass.map((s) => `${s.n}=${s.status}`).join(', ')} did not pass.`);
    if (!r.evidence.length) throw new Error(`Cannot pass ${tc.id} without a screenshot. Every test needs evidence.`);
  }
  if (status === 'Failed') {
    if (!failedSteps.length) throw new Error(`Cannot fail ${tc.id}: no step is recorded as "fail". Failed means an assertion did not hold.`);
    if (errorSteps.length) throw new Error(`${tc.id} has error steps (${errorSteps.map((s) => s.n).join(', ')}): the test could not run as designed, so it is an Error, not a Failure.`);
    if (!r.evidence.length) throw new Error(`Cannot fail ${tc.id} without a screenshot of the failure.`);
  }
  if (status === 'Error' && (!opts.reason || opts.reason === true)) throw new Error('An Error needs --reason: say why the test could not run as designed.');
  r.endedAt = L.nowIso();
  r.durationMs = new Date(r.endedAt) - new Date(r.startedAt);
  r.reason = opts.reason && opts.reason !== true ? opts.reason : null;
  r.note = opts.note && opts.note !== true ? opts.note : r.note;
  r.infra = status === 'Error' && !!opts.infra;
  // A pass that needed the single infrastructure retry is Flaky: shown, never folded into Passed.
  r.status = (status === 'Passed' && r.attempts > 1) ? 'Flaky' : status;
  save(opts.out, run);
  log(opts.out, `END ${tc.id} ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
  return r;
}

function note(opts) {
  const run = load(opts.out);
  const r = findResult(run, opts.test);
  if (!opts.text || opts.text === true) throw new Error('--text is required');
  r.note = r.note ? `${r.note} | ${opts.text}` : opts.text;
  save(opts.out, run);
  log(opts.out, `NOTE ${r.id}: ${opts.text}`);
  return r;
}

function finish(opts) {
  const run = load(opts.out);
  if (run.status !== 'running') throw new Error('This run is already finished.');
  const suite = loadSuite(run);
  const idx = L.testCaseIndex(suite);
  for (const r of run.results) {
    const tc = idx.get(r.id);
    if (r.status === 'Running') {
      r.status = 'Error';
      r.reason = 'Test was begun but never ended (steps not recorded).';
      r.endedAt = L.nowIso();
    } else if (r.status === 'Not Run' && tc.status === 'Blocked') {
      r.status = 'Blocked';
      r.reason = tc.blockedReason || 'Blocked in the suite';
    } else if (r.status === 'Not Run' && tc.status !== 'Ready') {
      r.status = 'Skipped';
      r.reason = `Test case status is ${tc.status}, not Ready`;
    }
  }
  run.status = 'complete';
  run.finishedAt = L.nowIso();
  save(opts.out, run);
  const s = run.summary;
  log(opts.out, `FINISH total=${s.total} passed=${s.Passed} failed=${s.Failed} error=${s.Error} flaky=${s.Flaky} blocked=${s.Blocked} skipped=${s.Skipped} notRun=${s['Not Run']}`);
  fs.appendFileSync(logPath(opts.out), `\n## Reminder\nClose the browser session: \`playwright-cli -s=${run.session} close\`\n`, 'utf8');
  return run;
}

function status(opts) {
  const run = load(opts.out);
  return { status: run.status, session: run.session, summary: run.summary,
    results: run.results.map((r) => ({ id: r.id, scope: r.scope, status: r.status, steps: r.steps.length })) };
}

function camel(opts) {
  const o = { ...opts };
  if (o['base-url']) o.baseUrl = o['base-url'];
  return o;
}

const COMMANDS = { start, show, begin, step, end, note, finish, status };

if (require.main === module) {
  const args = L.parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!COMMANDS[cmd]) L.fail(`Usage: record_result.js <${Object.keys(COMMANDS).join('|')}> --out <dir> ...`);
  if (!args.out) L.fail('--out <run dir> is required');
  try {
    const res = COMMANDS[cmd](camel(args));
    if (cmd === 'show' && !args.json) {
      const tc = res.testCase;
      const lines = [`${tc.id}  ${tc.title}`, `scope=${tc.scope} priority=${tc.priority} status=${tc.status}${res.runnable ? '' : '  (NOT RUNNABLE)'}`,
        `session: ${res.session}   base url: ${res.baseUrl}`];
      if (tc.preconditions && tc.preconditions.length) lines.push('Preconditions:', ...tc.preconditions.map((p) => `  - ${p}`));
      if (tc.testData && Object.keys(tc.testData).length) lines.push(`Test data: ${JSON.stringify(tc.testData)}`);
      lines.push('Steps:', ...tc.steps.map((s, i) => `  ${i + 1}. ${s.action}${s.expected ? `\n     expect: ${s.expected}` : ''}`));
      lines.push(`Expected result: ${tc.expectedResult || '(see steps)'}`);
      process.stdout.write(lines.join('\n') + '\n');
    } else if (cmd === 'start') {
      process.stdout.write(JSON.stringify({ ok: true, session: res.session, results: resultsPath(args.out) }) + '\n');
    } else if (cmd === 'finish') {
      process.stdout.write(JSON.stringify({ ok: true, summary: res.summary, close: `playwright-cli -s=${res.session} close` }) + '\n');
    } else {
      process.stdout.write(JSON.stringify({ ok: true, ...(cmd === 'status' ? res : { id: res.id || args.test, status: res.status }) }) + '\n');
    }
  } catch (e) { L.fail(e.message); }
}

module.exports = { start, show, begin, step, end, note, finish, status, resultsPath };
