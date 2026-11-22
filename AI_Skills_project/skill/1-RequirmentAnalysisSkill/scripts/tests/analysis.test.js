'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { lintStory } = require('../story_lint');
const { checkImpact, levelFor } = require('../build_impact');
const U = require('../util');
const { buildGraph } = require('../build_epic_graph');
const { checkQuestions } = require('../validate_analysis');

const INPUT = path.resolve(__dirname, '..', '..', '..', '..', 'test-input');

test('lint finds the ACs of SD-02 and the inconsistent message prefix', () => {
  const r = lintStory(fs.readFileSync(path.join(INPUT, 'SD-02-story.md'), 'utf8'));
  assert.strictEqual(r.id, 'SD-02');
  assert.strictEqual(r.acceptanceCriteria.length, 3);
  assert.ok(r.findings.some((f) => f.rule === 'inconsistent-text'));
  assert.ok(r.findings.some((f) => f.rule === 'placeholder'));
  assert.strictEqual(r.counts.error, 0);
});

test('lint reports a story without structure', () => {
  const r = lintStory('Make login fast and user-friendly.');
  assert.ok(r.counts.error >= 3);
});

test('impact levels follow L x S: 9 Critical, 6 High, 3-4 Medium, 1-2 Low', () => {
  assert.deepStrictEqual([9, 6, 4, 3, 2, 1].map(levelFor), ['Critical', 'High', 'Medium', 'Medium', 'Low', 'Low']);
});

test('an impact needs evidence or a question and a consistent score', () => {
  const r = checkImpact({ storyId: 'X-1', impacts: [{ id: 'IM-01', module: 'm', likelihood: 3, severity: 2, score: 9, level: 'Critical' }] });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /score 9/.test(e)));
  assert.ok(r.errors.some((e) => /evidence quote or a question/.test(e)));
});

test('the epic parser reads stories and dependencies', () => {
  const e = U.parseEpic(fs.readFileSync(path.join(INPUT, 'EPIC_2_Demoblaze.md'), 'utf8'));
  assert.strictEqual(e.name, 'Demoblaze Online Store');
  assert.strictEqual(e.stories.length, 13);
  assert.deepStrictEqual(e.stories.find((s) => s.id === 'DB-07').dependsOn, ['DB-05']);
  assert.match(e.site, /demoblaze/);
});

test('the graph is self-contained, marks the target and colours impacts', () => {
  const e = U.parseEpic(fs.readFileSync(path.join(INPUT, 'EPIC_1_SauceDemo.md'), 'utf8'));
  const html = buildGraph(e, { impacts: [{ id: 'IM-01', module: 'SD-01', storyRef: 'SD-01', level: 'Critical', score: 9, likelihood: 3, severity: 3 }] }, 'SD-02');
  assert.match(html, /SD-02 · TARGET/);
  assert.match(html, /SD-01 · Critical/);
  assert.doesNotMatch(html, /<script src=|https:\/\/cdn/);
});

test('an Answered question needs an answer and who answered it', () => {
  const errs = checkQuestions({ storyId: 'X-1', clarity: 'Clear', jiraUpdated: false, emailUpdated: false, questions: [{ id: 'Q-01', question: 'q', status: 'Answered' }] });
  assert.ok(errs.some((e) => /Never assume an answer/.test(e)));
});
