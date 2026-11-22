#!/usr/bin/env node
'use strict';
// check_env.js --url <base url> [--json]
// Preflight for a run. Judges playwright-cli by its output, not its exit code alone: on Windows
// with a current Node it may print its version and then crash on exit (a known benign libuv assertion).
// Installs nothing. Exit 0 = ready to execute, 1 = a required check failed.
const { spawnSync } = require('child_process');
const L = require('./lib');

function probe(cmd, args) {
  // One command string (no args array) so Windows can resolve .cmd shims without the DEP0190 warning.
  const r = spawnSync([cmd, ...args].join(' '), { encoding: 'utf8', shell: true, timeout: 60000 });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const m = out.match(/\b(\d+\.\d+\.\d+)\b/);
  const found = !!m && r.status !== null && !/not recognized|not found|ENOENT|could not determine executable|npm ERR|npm error/i.test(out);
  return { found, version: found ? m[1] : null,
    exit: r.status, benignCrash: !!m && r.status !== 0 && /UV_HANDLE_CLOSING|Assertion failed/i.test(out), raw: out.trim().slice(0, 400) };
}

async function checkUrl(url) {
  if (!url) return { ok: false, note: 'no --url given' };
  try { new URL(url); } catch (_) { return { ok: false, note: `not a valid URL: ${url}` }; }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal });
    return { ok: res.status < 500, status: res.status, note: res.status < 400 ? 'reachable' : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, note: `unreachable: ${e.cause && e.cause.code ? e.cause.code : e.message}` };
  } finally { clearTimeout(t); }
}

async function main() {
  const args = L.parseArgs(process.argv.slice(2));
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const checks = {};
  checks.node = { ok: nodeMajor >= 18, version: process.versions.node, required: true };

  let pw = probe('playwright-cli', ['--version']);
  let via = 'playwright-cli';
  if (!pw.found) { pw = probe('npx', ['--no-install', 'playwright-cli', '--version']); via = 'npx playwright-cli'; }
  checks.playwrightCli = { ok: pw.found, version: pw.version, invoke: pw.found ? via : null, required: true,
    note: pw.found ? (pw.benignCrash ? 'version confirmed; known benign exit-crash on this stack' : 'ok')
      : 'not installed. Ask the user before installing. Project-local: npm install -D @playwright/cli && npx playwright-cli install-browser chromium' };

  checks.url = { ...(await checkUrl(args.url)), url: args.url || null, required: true };

  const java = probe('java', ['-version']);
  const mvn = probe('mvn', ['-v']);
  checks.java = { ok: java.found && Number((java.version || '0').split('.')[0]) >= 17, version: java.version, required: false,
    note: 'only for the Java ExtentReports report' };
  checks.maven = { ok: mvn.found, version: mvn.version, required: false, note: 'only for the Java ExtentReports report' };

  const ok = Object.values(checks).every((c) => !c.required || c.ok);
  const res = { ok, checks };
  if (args.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    for (const [k, c] of Object.entries(checks)) {
      process.stdout.write(`${c.ok ? 'OK  ' : (c.required ? 'FAIL' : 'skip')} ${k.padEnd(14)} ${c.version || ''} ${c.note || ''}${c.invoke ? ` (run as: ${c.invoke})` : ''}\n`);
    }
    process.stdout.write(ok ? 'READY to execute\n' : 'NOT READY: fix the FAIL lines first\n');
  }
  process.exit(ok ? 0 : 1);
}

main();
