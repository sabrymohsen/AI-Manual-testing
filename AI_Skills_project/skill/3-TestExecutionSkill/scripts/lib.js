'use strict';
// Shared helpers for the test execution scripts. Plain Node 18+, no dependencies.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Result statuses. Each one means something different and none is ever folded into another:
//   Passed  - every step ran and every assertion held
//   Failed  - the test ran as designed and an assertion did NOT hold (a product finding)
//   Error   - the test could NOT run as designed (tool, environment, recording problem)
//   Flaky   - failed on infrastructure, passed only on its single retry (unstable, not a pass)
//   Blocked - the test case was Blocked in the suite and was never run
//   Skipped - the test case was not Ready (Draft) or was de-scoped, never run
//   Not Run - Ready, planned, but never attempted in this run
const RESULT_STATUSES = ['Passed', 'Failed', 'Error', 'Flaky', 'Blocked', 'Skipped', 'Not Run'];
// Running exists only while a run is in progress (the live dashboard shows it); a finished run has none.
const LIVE_STATUSES = [...RESULT_STATUSES, 'Running'];
const STEP_STATUSES = ['pass', 'fail', 'error', 'skip'];
const END_STATUSES = ['Passed', 'Failed', 'Error'];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    let key; let val;
    const eq = a.indexOf('=');
    if (eq > -1) { key = a.slice(2, eq); val = a.slice(eq + 1); } else {
      key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || /^--[a-zA-Z]/.test(next)) val = true; else { val = next; i++; }
    }
    if (key in out) out[key] = [].concat(out[key], val); else out[key] = val;
  }
  return out;
}

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try { return JSON.parse(raw); } catch (e) { throw new Error(`Invalid JSON in ${file}: ${e.message}`); }
}

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// Write to a temp file, then rename over the target, so a reader (the live dashboard) never sees half a file.
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      // Windows: the target may be open by a reader for a moment.
      if (attempt >= 10 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) {
        try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        throw e;
      }
      sleepSync(50);
    }
  }
}

function nowIso() { return new Date().toISOString(); }

function emptySummary() {
  const s = { total: 0 };
  for (const st of LIVE_STATUSES) s[st] = 0;
  return s;
}

function summarize(results) {
  const s = emptySummary();
  for (const r of results || []) {
    s.total++;
    if (!(r.status in s)) throw new Error(`Unknown result status "${r.status}" on ${r.id}`);
    s[r.status]++;
  }
  // Pass rate counts only tests that reached a pass/fail decision. Flaky is shown, never hidden.
  const decided = s.Passed + s.Flaky + s.Failed;
  s.passRate = decided ? Math.round(((s.Passed + s.Flaky) / decided) * 1000) / 10 : null;
  return s;
}

function summarizeByScope(results) {
  const out = {};
  for (const r of results || []) {
    const scope = r.scope || 'Target';
    (out[scope] = out[scope] || []).push(r);
  }
  const res = {};
  for (const [k, v] of Object.entries(out)) res[k] = summarize(v);
  return res;
}

function sessionName(label) {
  const clean = String(label || 'run').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'run';
  if (clean === 'default') throw new Error('The session label "default" is not allowed');
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `qa-${clean}-${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

// A URL is allowed when its host equals an approved host or is a subdomain of one.
function hostAllowed(url, approvedHosts) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return false; }
  return (approvedHosts || []).some((h) => {
    const a = String(h).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return host === a || host.endsWith('.' + a);
  });
}

function testCaseIndex(suite) {
  const map = new Map();
  for (const tc of suite.testCases || []) map.set(tc.id, tc);
  return map;
}

function fail(msg, code = 1) {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(code);
}

module.exports = {
  RESULT_STATUSES, LIVE_STATUSES, STEP_STATUSES, END_STATUSES,
  parseArgs, readJson, writeJsonAtomic, nowIso, emptySummary, summarize, summarizeByScope,
  sessionName, hostAllowed, testCaseIndex, fail,
};
