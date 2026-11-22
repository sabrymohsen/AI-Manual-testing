#!/usr/bin/env node
'use strict';
// build_user_guide_html.js - builds docs/user-guide.html from docs/USER-GUIDE.md (one source of truth).
// The page renders the Markdown with marked and the diagrams with Mermaid (both pinned, from cdn.jsdelivr.net),
// so it needs an internet connection the first time it is opened.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'USER-GUIDE.md');
const out = path.join(__dirname, 'user-guide.html');
const md = fs.readFileSync(src, 'utf8');
const json = JSON.stringify(md).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Pipeline User Guide</title>
<style>
:root{--bg:#f6f7f9;--fg:#1d2330;--muted:#5b6475;--card:#fff;--line:#e2e6ee;--accent:#1f2a44;--code:#eef1f6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141821;--fg:#e8ebf1;--muted:#9aa3b5;--card:#1c2130;--line:#2b3244;--accent:#9db4ff;--code:#262d3f}}
:root[data-theme="dark"]{--bg:#141821;--fg:#e8ebf1;--muted:#9aa3b5;--card:#1c2130;--line:#2b3244;--accent:#9db4ff;--code:#262d3f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,"Segoe UI",Roboto,sans-serif}
.layout{display:grid;grid-template-columns:260px 1fr;max-width:1240px;margin:0 auto}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:24px 16px;border-right:1px solid var(--line)}
nav a{display:block;color:var(--muted);text-decoration:none;padding:4px 8px;border-radius:6px;font-size:14px}nav a:hover{background:var(--code);color:var(--fg)}
main{padding:24px 32px;min-width:0}
h1{font-size:28px;margin-top:0}h2{margin-top:40px;padding-top:12px;border-top:1px solid var(--line)}
a{color:var(--accent)}code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:13px}
pre{background:var(--code);padding:12px;border-radius:8px;overflow-x:auto}pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{background:var(--code)}
blockquote{margin:12px 0;padding:8px 14px;border-left:4px solid var(--accent);background:var(--card);border-radius:0 8px 8px 0;color:var(--muted)}
.mermaid{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;overflow-x:auto;text-align:center;margin:12px 0}
hr{border:0}
@media (max-width:820px){.layout{grid-template-columns:1fr}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:16px}}
</style></head>
<body><div class="layout"><nav id="toc"></nav><main id="content">Loading the guide...</main></div>
<script id="md" type="application/json">${json}</script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>
(function(){
  var md = JSON.parse(document.getElementById('md').textContent);
  var renderer = new marked.Renderer();
  var baseCode = renderer.code.bind(renderer);
  renderer.code = function(code, lang){
    if (lang === 'mermaid') { var d = document.createElement('div'); d.className = 'mermaid'; d.textContent = code; return d.outerHTML; }
    return baseCode(code, lang);
  };
  var main = document.getElementById('content');
  main.innerHTML = marked.parse(md, { renderer: renderer });
  main.querySelectorAll('a[href="user-guide.html"]').forEach(function(a){ a.removeAttribute('href'); });
  var toc = document.getElementById('toc');
  main.querySelectorAll('h1, h2').forEach(function(h, i){
    h.id = h.id || ('s' + i);
    var a = document.createElement('a'); a.href = '#' + h.id; a.textContent = h.textContent;
    if (h.tagName === 'H1') a.style.fontWeight = '700';
    toc.appendChild(a);
  });
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
  mermaid.run({ querySelector: '.mermaid' });
})();
</script></body></html>
`;
fs.writeFileSync(out, html);
process.stdout.write(`User guide written: ${out}\n`);
