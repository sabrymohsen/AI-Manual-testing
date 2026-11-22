'use strict';
// Shared helpers for the requirement analysis scripts. Plain Node 18+, no dependencies.
const fs = require('fs');

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

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try { return JSON.parse(raw); } catch (e) { throw new Error(`Invalid JSON in ${file}: ${e.message}`); }
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripMd(s) { return String(s || '').replace(/\*\*|`/g, '').trim(); }

// Reads an epic file: a heading "# EPIC <n>: <name>", a "Website" line, and a table
// | ID | User Story | Acceptance Criteria | Depends On | Status |
function parseEpic(text) {
  const lines = text.split(/\r?\n/);
  const head = lines.find((l) => /^#\s+/.test(l)) || '';
  const m = head.match(/^#\s+(?:EPIC\s*\d+\s*[:\-]\s*)?(.+)$/i);
  const name = m ? stripMd(m[1]) : 'Epic';
  const site = (text.match(/\*\*Website:\*\*\s*(\S+)/i) || text.match(/Website:\s*(\S+)/i) || [])[1] || null;
  const stories = [];
  let cols = null;
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) { cols = cols && line.trim() === '' ? null : cols; continue; }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (!cols) {
      const lower = cells.map((c) => c.toLowerCase());
      if (lower.includes('id') && lower.some((c) => c.startsWith('depends'))) cols = lower;
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const get = (name) => cells[cols.findIndex((c) => c.startsWith(name))] || '';
    const id = stripMd(get('id'));
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(id)) continue;
    const deps = stripMd(get('depends')).split(/[,;]/).map((d) => d.trim()).filter((d) => /^[A-Z][A-Z0-9]*-\d+$/.test(d));
    const storyText = stripMd(get('user story'));
    const want = (storyText.match(/I want (?:to )?(.+?)(?: so that|[.,]|$)/i) || [])[1];
    stories.push({ id, story: storyText, title: want ? want.trim() : storyText.slice(0, 40), ac: stripMd(get('acceptance')), dependsOn: deps, status: get('status') });
  }
  return { name, site, stories };
}

module.exports = { parseArgs, readJson, escHtml, stripMd, parseEpic };
