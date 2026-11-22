'use strict';
// render.js - one renderer for both the static Extent report and the live dashboard.
// The page draws itself from a JSON data block; the live dashboard re-fetches that data every 2 s.
const fs = require('fs');
const path = require('path');

const STATUS_COLORS = {
  Passed: '#2e9e4f', Failed: '#d6293e', Error: '#b83280', Flaky: '#eac54f',
  Blocked: '#f2a93b', Skipped: '#8b5cf6', 'Not Run': '#9aa3b5', Running: '#4d9de0',
};
const ORDER = ['Passed', 'Failed', 'Error', 'Flaky', 'Blocked', 'Skipped', 'Not Run', 'Running'];

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); }

function counts(results) {
  const c = { total: results.length };
  for (const s of ORDER) c[s] = 0;
  for (const r of results) c[r.status] = (c[r.status] || 0) + 1;
  const decided = c.Passed + c.Flaky + c.Failed;
  c.passRate = decided ? Math.round(((c.Passed + c.Flaky) / decided) * 1000) / 10 : null;
  return c;
}

// Build the report data from the execution record (or from the suite alone, before the run starts).
function buildData({ results, suite, bugs, title, evidenceSrc }) {
  const tcIdx = new Map(((suite && suite.testCases) || []).map((t) => [t.id, t]));
  const rows = results ? results.results : ((suite && suite.testCases) || []).map((t) => ({
    id: t.id, title: t.title, scope: t.scope, impactRef: t.impactRef, priority: t.priority,
    status: t.status === 'Blocked' ? 'Blocked' : (t.status === 'Ready' ? 'Not Run' : 'Skipped'), steps: [], evidence: [], reason: t.blockedReason || null,
  }));
  const bugByTest = new Map(((bugs && bugs.bugs) || []).map((b) => [b.testId, b]));
  const out = rows.map((r) => {
    const tc = tcIdx.get(r.id) || {};
    return {
      id: r.id, title: r.title || tc.title, scope: r.scope || tc.scope || 'Target', impactRef: r.impactRef || tc.impactRef || null,
      acRef: tc.acRef || [], priority: r.priority || tc.priority, status: r.status, durationMs: r.durationMs || null,
      attempts: r.attempts || 0, reason: r.reason || null, note: r.note || null, expectedResult: tc.expectedResult || null,
      observation: tc.expectedSource === 'observation',
      bug: bugByTest.has(r.id) ? { id: bugByTest.get(r.id).id, severity: bugByTest.get(r.id).severity } : null,
      steps: (r.steps && r.steps.length ? r.steps : (tc.steps || []).map((s, i) => ({ n: i + 1, action: s.action, expected: s.expected, status: null }))).map((s) => ({
        n: s.n, action: s.action, expected: s.expected, actual: s.actual || null, status: s.status || null,
        screenshot: s.screenshot ? evidenceSrc(s.screenshot) : null, commands: s.commands || [],
      })),
      evidence: (r.evidence || []).map((e) => ({ name: path.basename(e), src: evidenceSrc(e) })),
    };
  });
  const byScope = {};
  for (const scope of ['Target', 'Impacted']) {
    const list = out.filter((r) => r.scope === scope);
    if (list.length) byScope[scope] = counts(list);
  }
  const src = results || suite || {};
  return {
    title: title || `${src.storyId || ''} ${src.storyTitle || ''} - Test Report`.trim(),
    generatedAt: new Date().toISOString(),
    story: { id: src.storyId, title: src.storyTitle, epic: src.epic },
    suiteId: src.suiteId,
    baseUrl: results ? results.baseUrl : (suite && suite.baseUrl),
    session: results ? results.session : null,
    headed: results ? results.headed : null,
    runStatus: results ? results.status : 'not started',
    startedAt: results ? results.startedAt : null,
    finishedAt: results ? results.finishedAt : null,
    sample: !!src.sample, override: !!src.override, overrideNote: suite ? suite.overrideNote : null,
    observationDerived: !!src.observationDerived,
    summary: counts(out), byScope,
    results: out,
    bugs: ((bugs && bugs.bugs) || []).map((b) => ({ id: b.id, title: b.title, severity: b.severity, priority: b.priority, testId: b.testId, regression: b.regression, status: b.status })),
  };
}

const CSS = `
:root{--bg:#f4f6f9;--panel:#ffffff;--fg:#1d2330;--muted:#5b6475;--line:#e2e6ee;--chip:#eef1f6}
:root[data-theme="dark"]{--bg:#141821;--panel:#1c2130;--fg:#e8ebf1;--muted:#9aa3b5;--line:#2b3244;--chip:#262d3f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141821;--panel:#1c2130;--fg:#e8ebf1;--muted:#9aa3b5;--line:#2b3244;--chip:#262d3f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,"Segoe UI",Roboto,sans-serif}
header{background:#1f2a44;color:#fff;padding:18px 16px}header .in,main{max-width:1180px;margin:0 auto}
header h1{margin:0;font-size:20px}header .meta{opacity:.8;font-size:13px;margin-top:4px;word-break:break-word}
main{padding:16px}
.banner{padding:10px 14px;border-radius:10px;margin-bottom:10px;font-weight:600}
.b-sample{background:#d6293e;color:#fff}.b-override{background:#f2a93b;color:#1d2330}.b-obs{background:#4d9de0;color:#fff}.b-live{background:#2e9e4f;color:#fff}
.grid{display:grid;grid-template-columns:260px 1fr;gap:16px}@media (max-width:760px){.grid{grid-template-columns:1fr}}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.panel h2{margin:0 0 12px;font-size:15px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.card{background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--c);border-radius:10px;padding:10px 12px}
.card b{display:block;font-size:22px}.card span{color:var(--muted);font-size:12px}
.donut{display:flex;justify-content:center}.legend{margin-top:10px;font-size:13px}.legend div{display:flex;justify-content:space-between;gap:8px}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.scope{margin-top:14px}.bar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--chip);margin:4px 0 10px}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 10px}.filters button{border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}
.filters button.on{background:#1f2a44;color:#fff;border-color:#1f2a44}
.tc{background:var(--panel);border:1px solid var(--line);border-radius:12px;margin-bottom:10px;overflow:hidden}
.tc summary{list-style:none;cursor:pointer;padding:12px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.tc summary::-webkit-details-marker{display:none}
.pill{color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700}.pill.light{color:#1d2330}
.chip{background:var(--chip);border-radius:6px;padding:1px 8px;font-size:12px;color:var(--muted)}
.tc .t{font-weight:600;flex:1 1 240px}.body{padding:0 14px 14px;border-top:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
td.st{white-space:nowrap;font-weight:700}.tbl{overflow-x:auto}
.shot{max-width:100%;max-height:340px;border:1px solid var(--line);border-radius:8px;margin-top:6px;display:block}
.note{color:var(--muted);margin:8px 0}code{font-size:12px;background:var(--chip);padding:1px 5px;border-radius:4px;word-break:break-all}
footer{color:var(--muted);font-size:12px;text-align:center;padding:20px}
.theme{float:right;background:transparent;color:#fff;border:1px solid #fff6;border-radius:8px;padding:4px 10px;cursor:pointer}
@media print{header{background:#fff;color:#000}.filters,.theme{display:none}details{display:block}details>.body{display:block}}
`;

// Runs in the browser. Builds the page from window.__DATA__ with DOM APIs (textContent, never innerHTML for data).
const CLIENT = `
(function(){
var C=${JSON.stringify(STATUS_COLORS)},O=${JSON.stringify(ORDER)},LIGHT={Flaky:1,Blocked:1};
var filter='All',open={};
function el(t,a,k){var e=document.createElement(t);if(a)for(var x in a){if(x==='text')e.textContent=a[x];else if(x==='style')e.style.cssText=a[x];else e.setAttribute(x,a[x]);}
 (k||[]).forEach(function(c){if(c)e.appendChild(typeof c==='string'?document.createTextNode(c):c);});return e;}
function pill(s){return el('span',{class:'pill'+(LIGHT[s]?' light':''),style:'background:'+(C[s]||'#888'),text:s});}
function dur(ms){if(ms==null)return'';return ms<1000?ms+' ms':(ms/1000).toFixed(1)+' s';}
function donut(sm){var NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 120 120');svg.setAttribute('width','170');svg.setAttribute('height','170');
 var r=46,c=2*Math.PI*r,off=0,tot=sm.total||1;O.forEach(function(s){var v=sm[s]||0;if(!v)return;var p=document.createElementNS(NS,'circle');p.setAttribute('cx',60);p.setAttribute('cy',60);p.setAttribute('r',r);p.setAttribute('fill','none');
 p.setAttribute('stroke',C[s]);p.setAttribute('stroke-width',16);p.setAttribute('stroke-dasharray',(v/tot*c)+' '+c);p.setAttribute('stroke-dashoffset',-off);p.setAttribute('transform','rotate(-90 60 60)');
 var tt=document.createElementNS(NS,'title');tt.textContent=s+': '+v;p.appendChild(tt);svg.appendChild(p);off+=v/tot*c;});
 var t=document.createElementNS(NS,'text');t.setAttribute('x',60);t.setAttribute('y',58);t.setAttribute('text-anchor','middle');t.setAttribute('font-size','20');t.setAttribute('font-weight','700');t.setAttribute('fill','currentColor');t.textContent=sm.total;svg.appendChild(t);
 var u=document.createElementNS(NS,'text');u.setAttribute('x',60);u.setAttribute('y',76);u.setAttribute('text-anchor','middle');u.setAttribute('font-size','10');u.setAttribute('fill','currentColor');u.textContent='test cases';svg.appendChild(u);return svg;}
function bar(sm){var b=el('div',{class:'bar'});O.forEach(function(s){if(sm[s])b.appendChild(el('div',{title:s+': '+sm[s],style:'background:'+C[s]+';width:'+(sm[s]/sm.total*100)+'%'}));});return b;}
function render(D){
 var root=document.getElementById('app');root.textContent='';
 document.getElementById('h-title').textContent=D.title;
 document.getElementById('h-meta').textContent=[D.story.epic,D.suiteId,D.baseUrl,D.session?('session '+D.session):null,D.headed===null?null:(D.headed?'headed':'headless'),'run: '+D.runStatus,D.finishedAt?('finished '+new Date(D.finishedAt).toLocaleString()):null].filter(Boolean).join('  |  ');
 if(D.sample)root.appendChild(el('div',{class:'banner b-sample',text:'SAMPLE RUN. Not a real result. Never post.'}));
 if(D.override)root.appendChild(el('div',{class:'banner b-override',text:'TESTER OVERRIDE: the readiness gate was not met. '+(D.overrideNote||'')}));
 if(D.observationDerived)root.appendChild(el('div',{class:'banner b-obs',text:'Observation-derived expected results: a pass means "behaves as observed", not "correct".'}));
 if(window.__LIVE__)root.appendChild(el('div',{class:'banner b-live',text:D.runStatus==='running'?'LIVE: refreshing every 2 seconds':'Run '+D.runStatus+'. Live view stopped refreshing.'}));
 var sm=D.summary,grid=el('div',{class:'grid'}),left=el('div',{class:'panel'}),right=el('div',{class:'panel'});
 left.appendChild(el('h2',{text:'Status'}));left.appendChild(el('div',{class:'donut'},[donut(sm)]));
 var lg=el('div',{class:'legend'});O.forEach(function(s){if(sm[s])lg.appendChild(el('div',null,[el('span',null,[el('i',{class:'sw',style:'background:'+C[s]}),s]),el('b',{text:String(sm[s])})]));});left.appendChild(lg);
 var sc=el('div',{class:'scope'});Object.keys(D.byScope).forEach(function(k){var s=D.byScope[k];sc.appendChild(el('div',{text:(k==='Target'?'Story (Target)':'Impacted modules')+': '+s.total}));sc.appendChild(bar(s));});left.appendChild(sc);
 right.appendChild(el('h2',{text:'Summary'}));var cards=el('div',{class:'cards'});
 cards.appendChild(el('div',{class:'card',style:'--c:#1f2a44'},[el('b',{text:String(sm.total)}),el('span',{text:'Total'})]));
 cards.appendChild(el('div',{class:'card',style:'--c:#2e9e4f'},[el('b',{text:sm.passRate==null?'-':sm.passRate+'%'}),el('span',{text:'Pass rate (decided)'})]));
 O.forEach(function(s){if(sm[s]||['Passed','Failed','Error'].indexOf(s)>-1)cards.appendChild(el('div',{class:'card',style:'--c:'+C[s]},[el('b',{text:String(sm[s]||0)}),el('span',{text:s})]));});
 cards.appendChild(el('div',{class:'card',style:'--c:#d6293e'},[el('b',{text:String(D.bugs.length)}),el('span',{text:'Bugs drafted'})]));
 right.appendChild(cards);
 right.appendChild(el('p',{class:'note',text:'Failed = an assertion did not hold. Error = the test could not run as designed. Flaky = passed only on its single retry. Blocked/Skipped cases were never run. Pass rate counts only Passed, Flaky and Failed.'}));
 if(D.bugs.length){var bt=el('table',null,[el('thead',null,[el('tr',null,['Bug','Title','Test','Severity','Type'].map(function(h){return el('th',{text:h});}))])]),bb=el('tbody');
  D.bugs.forEach(function(b){bb.appendChild(el('tr',null,[el('td',{text:b.id}),el('td',{text:b.title}),el('td',{text:b.testId}),el('td',{text:b.severity+' / '+b.priority}),el('td',{text:b.regression?'Regression':'Story defect'})]));});
  bt.appendChild(bb);right.appendChild(el('h2',{text:'Bugs (drafts, not posted)',style:'margin-top:14px'}));right.appendChild(el('div',{class:'tbl'},[bt]));}
 grid.appendChild(left);grid.appendChild(right);root.appendChild(grid);
 var f=el('div',{class:'filters'});['All','Issues'].concat(O).concat(['Target','Impacted']).forEach(function(k){
  var n=k==='All'?sm.total:k==='Issues'?D.results.filter(function(r){return['Failed','Error','Flaky'].indexOf(r.status)>-1;}).length:(sm[k]!==undefined?sm[k]:D.results.filter(function(r){return r.scope===k;}).length);
  if(!n&&k!=='All')return;var b=el('button',{class:filter===k?'on':'',text:k+' ('+n+')'});b.onclick=function(){filter=k;render(D);};f.appendChild(b);});root.appendChild(f);
 D.results.filter(function(r){return filter==='All'||r.status===filter||r.scope===filter||(filter==='Issues'&&['Failed','Error','Flaky'].indexOf(r.status)>-1);}).forEach(function(r){
  var d=el('details',{class:'tc'});if(open[r.id])d.setAttribute('open','');d.ontoggle=function(){open[r.id]=d.open;};
  var passN=r.steps.filter(function(s){return s.status==='pass';}).length;
  d.appendChild(el('summary',null,[pill(r.status),el('span',{class:'t',text:r.id+'  '+r.title}),el('span',{class:'chip',text:r.scope==='Impacted'?'Impacted '+(r.impactRef||''):'Target '+(r.acRef||[]).join(',')}),
   r.priority?el('span',{class:'chip',text:r.priority}):null,el('span',{class:'chip',text:passN+'/'+r.steps.length+' steps'}),r.durationMs!=null?el('span',{class:'chip',text:dur(r.durationMs)}):null,
   r.attempts>1?el('span',{class:'chip',text:'attempts '+r.attempts}):null,r.bug?el('span',{class:'chip',text:r.bug.id+' '+r.bug.severity}):null,r.observation?el('span',{class:'chip',text:'observation-derived'}):null]));
  var body=el('div',{class:'body'});
  if(r.reason)body.appendChild(el('p',{class:'note',text:'Reason: '+r.reason}));
  if(r.note)body.appendChild(el('p',{class:'note',text:'Note: '+r.note}));
  if(r.expectedResult)body.appendChild(el('p',{class:'note',text:'Expected result: '+r.expectedResult}));
  var t=el('table',null,[el('thead',null,[el('tr',null,['#','Action','Expected','Actual','Status'].map(function(h){return el('th',{text:h});}))])]),tb=el('tbody');
  r.steps.forEach(function(s){var a=el('td',null,[s.actual||'']);if(s.commands&&s.commands.length)s.commands.forEach(function(c){a.appendChild(el('div',null,[el('code',{text:c})]));});
   if(s.screenshot)a.appendChild(el('a',{href:s.screenshot,target:'_blank'},[el('img',{class:'shot',src:s.screenshot,alt:'Step '+s.n+' screenshot',loading:'lazy'})]));
   tb.appendChild(el('tr',null,[el('td',{text:String(s.n)}),el('td',{text:s.action}),el('td',{text:s.expected||''}),a,el('td',{class:'st',style:'color:'+(s.status==='pass'?C.Passed:s.status==='fail'?C.Failed:s.status==='error'?C.Error:'inherit'),text:s.status||'-'})]));});
  t.appendChild(tb);body.appendChild(el('div',{class:'tbl'},[t]));
  var stepShots={};r.steps.forEach(function(s){if(s.screenshot)stepShots[s.screenshot]=1;});
  r.evidence.filter(function(e){return!stepShots[e.src];}).forEach(function(e){body.appendChild(el('a',{href:e.src,target:'_blank'},[el('img',{class:'shot',src:e.src,alt:e.name,loading:'lazy'})]));});
  d.appendChild(body);root.appendChild(d);});
 document.getElementById('f-gen').textContent='Generated '+new Date(D.generatedAt).toLocaleString()+' by the QA pipeline (5-ExtentReportSkill). Driven with the Playwright agent-cli; no automation code.';
}
window.__render=render;
var tb=document.getElementById('theme');tb.onclick=function(){var h=document.documentElement,cur=h.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');h.setAttribute('data-theme',cur==='dark'?'light':'dark');};
if(window.__LIVE__){var poll=function(){fetch('data',{cache:'no-store'}).then(function(r){return r.json();}).then(function(D){render(D);if(D.runStatus!=='complete')setTimeout(poll,2000);}).catch(function(){setTimeout(poll,4000);});};poll();}
else render(JSON.parse(document.getElementById('report-data').textContent));
})();
`;

function renderPage(data, { live = false } = {}) {
  const json = data ? JSON.stringify(data).replace(/</g, '\\u003c') : 'null';
  const title = data ? data.title : 'Live test dashboard';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${String(title).replace(/[<&]/g, '')}</title><style>${CSS}</style></head>
<body><header><div class="in"><button class="theme" id="theme" type="button">Theme</button><h1 id="h-title"></h1><div class="meta" id="h-meta"></div></div></header>
<main id="app"></main><footer id="f-gen"></footer>
<script id="report-data" type="application/json">${json}</script>
<script>window.__LIVE__=${live ? 'true' : 'false'};</script>
<script>${CLIENT}</script></body></html>
`;
}

// Reads the data block back out of a report (used by the pipeline validator and the tests).
function extractData(html) {
  const m = html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

module.exports = { buildData, renderPage, extractData, readJson, STATUS_COLORS, ORDER, counts };
