#!/usr/bin/env node
'use strict';
// serve_report.js <folder> [--port 8787]
// Serves a report folder on http://127.0.0.1:<port>/ (local only, read-only). Useful for the Java
// ExtentReports output, which loads its assets over http.
const fs = require('fs');
const path = require('path');
const http = require('http');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const argv = process.argv.slice(2);
const root = path.resolve(argv.find((x) => !x.startsWith('--')) || '.');
const pi = argv.indexOf('--port');
const port = Number(pi > -1 ? argv[pi + 1] : 8787);
if (!fs.existsSync(root)) { process.stderr.write(`No such folder: ${root}\n`); process.exit(1); }

http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel.endsWith('/')) rel += fs.existsSync(path.join(root, rel, 'report.html')) ? 'report.html' : 'index.html';
  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => process.stdout.write(`Serving ${root} on http://127.0.0.1:${port}/  (Ctrl+C to stop)\n`))
  .on('error', (e) => { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(1); });
