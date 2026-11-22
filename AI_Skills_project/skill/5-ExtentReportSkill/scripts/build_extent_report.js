#!/usr/bin/env node
'use strict';
// build_extent_report.js --results <results.json> --suite <suite.json> [--bugs <bugs.json>] --out <report.html> [--title "..."] [--link-images]
// Builds the self-contained Extent-style HTML report. Screenshots are embedded (base64) so the single file
// can be opened or shared anywhere; --link-images keeps them as relative links instead (smaller file).
const fs = require('fs');
const path = require('path');
const R = require('./render');

const MAX_EMBED_TOTAL = 12 * 1024 * 1024;

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

function buildReport({ resultsFile, suiteFile, bugsFile, outFile, title, linkImages }) {
  const results = R.readJson(resultsFile);
  if (results.status !== 'complete') throw new Error(`The run is "${results.status}". Build the report from a finished, validated run (use the live dashboard while it runs).`);
  const suite = R.readJson(suiteFile);
  const bugs = bugsFile && fs.existsSync(bugsFile) ? R.readJson(bugsFile) : null;
  const resultsDir = path.dirname(path.resolve(resultsFile));
  const outDir = path.dirname(path.resolve(outFile));
  let embedded = 0;
  const cache = new Map();
  const evidenceSrc = (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    const abs = path.join(resultsDir, rel);
    let src = path.relative(outDir, abs).split(path.sep).join('/');
    if (!linkImages && fs.existsSync(abs)) {
      const size = fs.statSync(abs).size;
      if (embedded + size <= MAX_EMBED_TOTAL) {
        const ext = path.extname(abs).slice(1).toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
        src = `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
        embedded += size;
      }
    }
    cache.set(rel, src);
    return src;
  };
  const data = R.buildData({ results, suite, bugs, title, evidenceSrc });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, R.renderPage(data), 'utf8');
  return { data, embeddedBytes: embedded };
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.results || !a.suite || !a.out) {
    process.stderr.write('Usage: build_extent_report.js --results <results.json> --suite <suite.json> [--bugs bugs.json] --out <report.html> [--title "..."] [--link-images]\n'); process.exit(2);
  }
  try {
    const { data, embeddedBytes } = buildReport({ resultsFile: a.results, suiteFile: a.suite, bugsFile: a.bugs, outFile: a.out, title: a.title === true ? null : a.title, linkImages: !!a['link-images'] });
    const s = data.summary;
    process.stdout.write(`Report written: ${a.out}\n  total ${s.total}: passed ${s.Passed}, failed ${s.Failed}, error ${s.Error}, flaky ${s.Flaky}, blocked ${s.Blocked}, skipped ${s.Skipped}, not run ${s['Not Run']}; bugs ${data.bugs.length}; images embedded ${(embeddedBytes / 1024).toFixed(0)} KB\n`);
  } catch (e) { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(1); }
}

module.exports = { buildReport };
