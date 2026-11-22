#!/usr/bin/env node
'use strict';
// live_dashboard.js --suite <suite.json> --run-dir <execution/run> [--port 8790] [--open] [--exit-when-done]
// Serves a live view of a running execution on http://127.0.0.1:<port>/ (local only). The page
// re-reads results.json every 2 seconds. Before "start" it shows the suite with every case Not Run.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const R = require('./render');

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

function liveData(suiteFile, runDir) {
  const suite = R.readJson(suiteFile);
  const rf = path.join(runDir, 'results.json');
  let results = null;
  try { if (fs.existsSync(rf)) results = R.readJson(rf); } catch (_) { /* mid-write: next poll */ }
  const bf = path.join(runDir, '..', '..', 'bugs', 'bugs.json');
  const bugs = fs.existsSync(bf) ? R.readJson(bf) : null;
  return R.buildData({ results, suite, bugs, title: `LIVE ${suite.storyId} ${suite.storyTitle}`, evidenceSrc: (rel) => `evidence/${path.basename(rel)}` });
}

function startServer({ suiteFile, runDir, port }) {
  const evidenceDir = path.resolve(runDir, 'evidence');
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    try {
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(R.renderPage(null, { live: true }));
      }
      if (url === '/data') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(JSON.stringify(liveData(suiteFile, runDir)));
      }
      if (url.startsWith('/evidence/')) {
        const file = path.resolve(evidenceDir, path.basename(url));
        if (file.startsWith(evidenceDir) && fs.existsSync(file)) {
          res.writeHead(200, { 'content-type': file.endsWith('.png') ? 'image/png' : 'application/octet-stream' });
          return fs.createReadStream(file).pipe(res);
        }
      }
      res.writeHead(404); res.end('not found');
    } catch (e) { res.writeHead(500); res.end(String(e.message)); }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.suite || !a['run-dir']) { process.stderr.write('Usage: live_dashboard.js --suite <suite.json> --run-dir <execution/run> [--port 8790] [--open] [--exit-when-done]\n'); process.exit(2); }
  const port = Number(a.port || 8790);
  const server = startServer({ suiteFile: a.suite, runDir: a['run-dir'], port });
  server.on('error', (e) => { process.stderr.write(`ERROR: ${e.code === 'EADDRINUSE' ? `port ${port} is in use; pass --port <other>` : e.message}\n`); process.exit(1); });
  server.on('listening', () => {
    const url = `http://127.0.0.1:${port}/`;
    process.stdout.write(`Live dashboard: ${url}\n`);
    if (a.open) openBrowser(url);
  });
  if (a['exit-when-done']) {
    const t = setInterval(() => {
      try {
        const rf = path.join(a['run-dir'], 'results.json');
        if (fs.existsSync(rf) && R.readJson(rf).status === 'complete') {
          clearInterval(t);
          process.stdout.write('Run complete. Dashboard stops in 60 s.\n');
          setTimeout(() => { server.close(); process.exit(0); }, 60000);
        }
      } catch (_) { /* retry */ }
    }, 3000);
  }
}

module.exports = { startServer, liveData };
