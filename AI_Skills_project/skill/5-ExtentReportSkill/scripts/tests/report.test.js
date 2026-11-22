'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const R = require('../render');
const { buildReport } = require('../build_extent_report');
const { startServer } = require('../live_dashboard');

function fixture(status = 'complete') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-rep-'));
  const run = path.join(dir, 'execution', 'run');
  fs.mkdirSync(path.join(run, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(run, 'evidence', 's.png'), Buffer.from([137, 80, 78, 71]));
  const suite = { suiteId: 'TS-X-001', storyId: 'SD-02', storyTitle: 'Login errors', sample: true, override: true, overrideNote: 'T: demo', testCases: [
    { id: 'TC-X-001', title: 'A </script><b>x', scope: 'Target', acRef: ['AC-1'], status: 'Ready', steps: [{ action: 'a', expected: 'b' }], expectedResult: 'b' },
    { id: 'TC-X-002', title: 'B', scope: 'Impacted', impactRef: 'IM-01', status: 'Ready', steps: [{ action: 'a', expected: 'b' }], expectedResult: 'b' },
    { id: 'TC-X-003', title: 'C', scope: 'Target', acRef: ['AC-1'], status: 'Blocked', blockedReason: 'Q-02', steps: [{ action: 'a', expected: 'b' }], expectedResult: 'b' }] };
  const results = { status, storyId: 'SD-02', storyTitle: 'Login errors', suiteId: 'TS-X-001', sample: true, override: true, baseUrl: 'https://www.saucedemo.com', session: 'qa-x', headed: false,
    results: [
      { id: 'TC-X-001', title: 'A </script><b>x', scope: 'Target', status: 'Flaky', attempts: 2, steps: [{ n: 1, action: 'a', expected: 'b', actual: 'b', status: 'pass', screenshot: 'evidence/s.png' }], evidence: ['evidence/s.png'] },
      { id: 'TC-X-002', title: 'B', scope: 'Impacted', status: 'Failed', steps: [{ n: 1, action: 'a', expected: 'b', actual: 'c', status: 'fail' }], evidence: ['evidence/s.png'] },
      { id: 'TC-X-003', title: 'C', scope: 'Target', status: 'Blocked', steps: [], evidence: [], reason: 'Q-02' }] };
  const sf = path.join(dir, 'suite.json'); const rf = path.join(run, 'results.json');
  fs.writeFileSync(sf, JSON.stringify(suite)); fs.writeFileSync(rf, JSON.stringify(results));
  return { dir, sf, rf, run };
}

test('the report keeps every status separate and never folds Flaky into Passed', () => {
  const f = fixture();
  const out = path.join(f.dir, 'report', 'report.html');
  const { data } = buildReport({ resultsFile: f.rf, suiteFile: f.sf, outFile: out });
  assert.strictEqual(data.summary.Flaky, 1);
  assert.strictEqual(data.summary.Passed, 0);
  assert.strictEqual(data.summary.Failed, 1);
  assert.strictEqual(data.summary.Blocked, 1);
  assert.strictEqual(data.summary.passRate, 50);
  assert.strictEqual(data.byScope.Impacted.Failed, 1);
});

test('the report is one file: screenshots embedded, no external scripts, data recoverable', () => {
  const f = fixture();
  const out = path.join(f.dir, 'report', 'report.html');
  buildReport({ resultsFile: f.rf, suiteFile: f.sf, outFile: out });
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /<script src=/);
  const data = R.extractData(html);
  assert.strictEqual(data.summary.total, 3);
  assert.ok(data.sample && data.override);
});

test('data containing </script> cannot break out of the data block', () => {
  const f = fixture();
  const out = path.join(f.dir, 'report.html');
  buildReport({ resultsFile: f.rf, suiteFile: f.sf, outFile: out });
  const html = fs.readFileSync(out, 'utf8');
  assert.strictEqual(R.extractData(html).results[0].title, 'A </script><b>x');
  assert.doesNotMatch(html.split('<script id="report-data"')[1].split('</script>')[0], /<\/script>|<b>/);
});

test('--link-images keeps relative links instead of embedding', () => {
  const f = fixture();
  const out = path.join(f.dir, 'report', 'report.html');
  buildReport({ resultsFile: f.rf, suiteFile: f.sf, outFile: out, linkImages: true });
  assert.match(fs.readFileSync(out, 'utf8'), /\.\.\/execution\/run\/evidence\/s\.png/);
});

test('the report refuses an unfinished run', () => {
  const f = fixture('running');
  assert.throws(() => buildReport({ resultsFile: f.rf, suiteFile: f.sf, outFile: path.join(f.dir, 'r.html') }), /Build the report from a finished/);
});

test('the live dashboard serves the page, live data and evidence on 127.0.0.1 only', async () => {
  const f = fixture('running');
  const server = startServer({ suiteFile: f.sf, runDir: f.run, port: 0 });
  await new Promise((r) => server.on('listening', r));
  const { address, port } = server.address();
  assert.strictEqual(address, '127.0.0.1');
  const get = (p) => new Promise((res, rej) => http.get(`http://127.0.0.1:${port}${p}`, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
  assert.match((await get('/')).body, /__LIVE__=true/);
  const data = JSON.parse((await get('/data')).body);
  assert.strictEqual(data.runStatus, 'running');
  assert.strictEqual(data.results[0].steps[0].screenshot, 'evidence/s.png');
  assert.strictEqual((await get('/evidence/s.png')).status, 200);
  assert.strictEqual((await get('/evidence/..%2F..%2Fsuite.json')).status, 404);
  server.close();
});
