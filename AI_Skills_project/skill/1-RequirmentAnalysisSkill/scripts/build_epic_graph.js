#!/usr/bin/env node
'use strict';
// build_epic_graph.js <epic.md> --impact <ID>-impact.json --out <graph.html> [--story <ID>]
// Draws the epic's dependency graph as one self-contained HTML file (inline SVG, no CDN) and
// colours every story by the impact level the analysis gave it. The target story is outlined.
const fs = require('fs');
const path = require('path');
const U = require('./util');

const LEVEL_COLOR = { Critical: '#d6293e', High: '#f2a93b', Medium: '#eac54f', Low: '#7fb3d5' };

function layout(stories) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const depth = new Map();
  const visiting = new Set();
  function d(id) {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) return 0; // a cycle: draw it, do not loop
    visiting.add(id);
    const s = byId.get(id);
    const v = s && s.dependsOn.length ? 1 + Math.max(...s.dependsOn.filter((x) => byId.has(x)).map(d), -1) : 0;
    visiting.delete(id);
    depth.set(id, Math.max(v, 0));
    return depth.get(id);
  }
  stories.forEach((s) => d(s.id));
  const cols = [];
  for (const s of stories) (cols[depth.get(s.id)] = cols[depth.get(s.id)] || []).push(s);
  const W = 190; const H = 64; const GX = 70; const GY = 26; const PAD = 30;
  const pos = new Map();
  cols.forEach((col, ci) => col.forEach((s, ri) => pos.set(s.id, { x: PAD + ci * (W + GX), y: PAD + ri * (H + GY) })));
  const width = PAD * 2 + cols.length * (W + GX) - GX;
  const height = PAD * 2 + Math.max(...cols.map((c) => c.length)) * (H + GY) - GY;
  return { pos, W, H, width, height };
}

function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [''];
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > max) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
  }
  return lines.slice(0, 2).map((l, i, a) => (i === 1 && words.join(' ').length > a.join(' ').length ? l.slice(0, max - 1) + '…' : l));
}

function buildGraph(epic, impact, storyId) {
  const impactByStory = new Map();
  for (const im of (impact && impact.impacts) || []) {
    const ref = im.storyRef || (String(im.module).match(/[A-Z][A-Z0-9]*-\d+/) || [])[0];
    if (!ref) continue;
    const prev = impactByStory.get(ref);
    if (!prev || im.score > prev.score) impactByStory.set(ref, im);
  }
  const { pos, W, H, width, height } = layout(epic.stories);
  const edges = [];
  for (const s of epic.stories) {
    for (const dep of s.dependsOn) {
      const a = pos.get(dep); const b = pos.get(s.id);
      if (!a || !b) continue;
      const x1 = a.x + W; const y1 = a.y + H / 2; const x2 = b.x; const y2 = b.y + H / 2;
      const mx = (x1 + x2) / 2;
      const hot = dep === storyId || s.id === storyId;
      edges.push(`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 6},${y2}" class="edge${hot ? ' hot' : ''}" marker-end="url(#arrow${hot ? 'Hot' : ''})"/>`);
    }
  }
  const nodes = epic.stories.map((s) => {
    const p = pos.get(s.id);
    const im = impactByStory.get(s.id);
    const isTarget = s.id === storyId;
    const fill = isTarget ? 'var(--target)' : (im ? LEVEL_COLOR[im.level] : 'var(--node)');
    const textCls = isTarget || (im && ['Critical', 'High'].includes(im.level)) ? 'lbl dark' : 'lbl';
    const title = wrap(s.title, 24);
    const tip = `${s.id}: ${s.story}\nAC: ${s.ac}${im ? `\nImpact ${im.id}: ${im.level} (score ${im.score}) - ${im.why || ''}` : ''}${isTarget ? '\nTARGET STORY' : ''}`;
    return `<g class="node${isTarget ? ' target' : ''}"><title>${U.escHtml(tip)}</title>`
      + `<rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="10" fill="${fill}"/>`
      + `<text x="${p.x + 12}" y="${p.y + 22}" class="${textCls} id">${U.escHtml(s.id)}${im ? ` · ${im.level}` : ''}${isTarget ? ' · TARGET' : ''}</text>`
      + title.map((l, i) => `<text x="${p.x + 12}" y="${p.y + 40 + i * 15}" class="${textCls}">${U.escHtml(l)}</text>`).join('')
      + '</g>';
  }).join('\n');

  const rows = [...((impact && impact.impacts) || [])].sort((a, b) => b.score - a.score).map((im) => `<tr><td>${U.escHtml(im.id)}</td><td>${U.escHtml(im.module)}</td>`
    + `<td><span class="pill" style="background:${LEVEL_COLOR[im.level]}">${U.escHtml(im.level)}</span></td><td>${im.likelihood} x ${im.severity} = ${im.score}</td>`
    + `<td>${U.escHtml(im.evidence ? `"${im.evidence}"` : '')}${im.question ? ` ${U.escHtml(im.question)}` : ''}</td><td>${U.escHtml(im.testFocus || '')}</td></tr>`).join('');

  const sample = impact && impact.sample ? '<div class="banner">SAMPLE. Not a real analysis. Never post.</div>' : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Impact Graph ${U.escHtml(storyId || '')}</title>
<style>
:root{--bg:#f7f8fa;--fg:#1d2330;--muted:#5b6475;--node:#dfe4ec;--edge:#9aa4b5;--hot:#d6293e;--target:#2e9e4f;--card:#fff;--line:#e3e7ee}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e8ebf1;--muted:#9aa3b5;--node:#2a3140;--edge:#5d6880;--card:#1a1f2a;--line:#2a3140}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif}
main{max-width:1200px;margin:0 auto;padding:20px 16px}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 16px}
.banner{background:#d6293e;color:#fff;padding:8px 12px;border-radius:8px;margin-bottom:12px;font-weight:600}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
svg{display:block}.edge{fill:none;stroke:var(--edge);stroke-width:1.6}.edge.hot{stroke:var(--hot);stroke-width:2.4}
.lbl{fill:var(--fg);font-size:12px}.lbl.dark{fill:#fff}.lbl.id{font-weight:700}
.node.target rect{stroke:var(--fg);stroke-width:3}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0;color:var(--muted)}.legend span{display:inline-flex;align-items:center;gap:6px}
.sw{width:14px;height:14px;border-radius:4px;display:inline-block}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:16px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.pill{color:#111;padding:2px 8px;border-radius:999px;font-weight:600;font-size:12px}
</style></head><body><main>
${sample}<h1>Impact graph: ${U.escHtml(storyId || '')} in ${U.escHtml(epic.name)}</h1>
<p class="sub">${epic.stories.length} stories. Arrows point from a story to the stories that depend on it. Red arrows touch the target story. Hover a box for its acceptance criteria and impact.</p>
<div class="legend"><span><i class="sw" style="background:var(--target)"></i>Target</span>${Object.entries(LEVEL_COLOR).map(([k, v]) => `<span><i class="sw" style="background:${v}"></i>${k}</span>`).join('')}<span><i class="sw" style="background:var(--node)"></i>Not impacted</span></div>
<div class="wrap"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Epic dependency graph">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--edge)"/></marker>
<marker id="arrowHot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--hot)"/></marker></defs>
${edges.join('\n')}
${nodes}
</svg></div>
<table><thead><tr><th>ID</th><th>Module</th><th>Level</th><th>L x S</th><th>Evidence / question</th><th>Test focus</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No impacts listed.</td></tr>'}</tbody></table>
</main></body></html>
`;
}

if (require.main === module) {
  const args = U.parseArgs(process.argv.slice(2));
  const epicFile = args._[0];
  if (!epicFile || !args.out) { process.stderr.write('Usage: build_epic_graph.js <epic.md> --impact <impact.json> --out <graph.html> [--story <ID>]\n'); process.exit(2); }
  const epic = U.parseEpic(fs.readFileSync(epicFile, 'utf8'));
  if (!epic.stories.length) { process.stderr.write(`No story table found in ${epicFile} (expected | ID | User Story | Acceptance Criteria | Depends On | Status |)\n`); process.exit(1); }
  const impact = args.impact ? U.readJson(args.impact) : null;
  const storyId = args.story || (impact && impact.storyId) || null;
  if (storyId && !epic.stories.some((s) => s.id === storyId)) { process.stderr.write(`Story ${storyId} is not in ${epicFile}\n`); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, buildGraph(epic, impact, storyId), 'utf8');
  process.stdout.write(`Graph written: ${args.out} (${epic.stories.length} stories, target ${storyId || 'none'})\n`);
}

module.exports = { buildGraph };
