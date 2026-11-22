'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../lib');

test('parseArgs reads flags, values, = form, booleans and repeats', () => {
  const a = L.parseArgs(['start', '--out', 'x', '--headed', '--n=3', '--command', 'a', '--command', 'b', '--actual', '-5 items']);
  assert.deepStrictEqual(a._, ['start']);
  assert.strictEqual(a.out, 'x');
  assert.strictEqual(a.headed, true);
  assert.strictEqual(a.n, '3');
  assert.deepStrictEqual(a.command, ['a', 'b']);
  assert.strictEqual(a.actual, '-5 items');
});

test('summarize counts every status and never folds Flaky into Passed', () => {
  const s = L.summarize([{ id: 'a', status: 'Passed' }, { id: 'b', status: 'Flaky' }, { id: 'c', status: 'Failed' },
    { id: 'd', status: 'Error' }, { id: 'e', status: 'Blocked' }]);
  assert.strictEqual(s.total, 5);
  assert.strictEqual(s.Passed, 1);
  assert.strictEqual(s.Flaky, 1);
  assert.strictEqual(s.Error, 1);
  assert.strictEqual(s.passRate, 66.7);
});

test('summarize rejects an unknown status', () => {
  assert.throws(() => L.summarize([{ id: 'a', status: 'Green' }]), /Unknown result status/);
});

test('passRate is null when nothing reached a decision', () => {
  assert.strictEqual(L.summarize([{ id: 'a', status: 'Blocked' }]).passRate, null);
});

test('summarizeByScope splits Target and Impacted', () => {
  const s = L.summarizeByScope([{ id: 'a', status: 'Passed', scope: 'Target' }, { id: 'b', status: 'Failed', scope: 'Impacted' }]);
  assert.strictEqual(s.Target.Passed, 1);
  assert.strictEqual(s.Impacted.Failed, 1);
});

test('sessionName is unique, prefixed, and refuses "default"', () => {
  const a = L.sessionName('SD-02');
  const b = L.sessionName('SD-02');
  assert.match(a, /^qa-sd-02-\d{8}-\d{6}-[0-9a-f]{4}$/);
  assert.notStrictEqual(a, b);
  assert.throws(() => L.sessionName('default'), /not allowed/);
});

test('hostAllowed accepts the host and its subdomains only', () => {
  assert.ok(L.hostAllowed('https://www.saucedemo.com/inventory.html', ['saucedemo.com']));
  assert.ok(L.hostAllowed('https://www.saucedemo.com/', ['https://www.saucedemo.com']));
  assert.ok(!L.hostAllowed('https://evil-saucedemo.com/', ['saucedemo.com']));
  assert.ok(!L.hostAllowed('not a url', ['saucedemo.com']));
});

test('writeJsonAtomic writes valid JSON and leaves no temp file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lib-'));
  const f = path.join(dir, 'a', 'x.json');
  L.writeJsonAtomic(f, { a: 1 });
  L.writeJsonAtomic(f, { a: 2 });
  assert.deepStrictEqual(L.readJson(f), { a: 2 });
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)), ['x.json']);
});

test('readJson strips a BOM and names the file on bad JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lib-'));
  const f = path.join(dir, 'b.json');
  fs.writeFileSync(f, '﻿{"ok":true}');
  assert.deepStrictEqual(L.readJson(f), { ok: true });
  fs.writeFileSync(f, '{bad');
  assert.throws(() => L.readJson(f), /b\.json/);
});
