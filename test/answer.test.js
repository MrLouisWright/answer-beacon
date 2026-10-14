import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, parseRobots, robotsAllows, parseLlmsTxt, isQuestion, RULES, AI_BOTS } from '../src/index.js';

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const rules = (r) => r.findings.map((f) => f.rule);
const site = (files) => { const d = mkdtempSync(join(tmpdir(), 'ab-')); for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), c); } return d; };
const page = (body = '', head = '') => `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;
const LLMS = '# Site\n\n> Summary\n\n## Docs\n- [Home](/)\n';

test('good fixture is clean at --fail-on info', () => { assert.deepEqual(check(fx('good')).findings, []); });
test('bad fixture covers the rule families', () => {
  const r = rules(check(fx('bad')));
  for (const k of Object.keys(RULES).filter((k) => !['ai-crawler-allowed', 'llms-txt-missing'].includes(k))) assert.ok(r.includes(k), k);
});
test('robots.txt parsing: groups, longest match, Allow wins ties, wildcard fallback', () => {
  const g = parseRobots('User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /private/\nAllow: /private/ok\n\nUser-agent: *\nDisallow: /\n');
  assert.equal(robotsAllows(g, 'GPTBot', '/').allowed, true);
  assert.equal(robotsAllows(g, 'claudebot', '/private/x').allowed, false);
  assert.equal(robotsAllows(g, 'ClaudeBot', '/private/ok').allowed, true);
  assert.deepEqual(robotsAllows(g, 'PerplexityBot', '/'), { allowed: false, explicit: false });
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), 'GPTBot').allowed, true);
  assert.ok(AI_BOTS.includes('Google-Extended'));
});
test('allow/block intent', () => {
  const d = site({ 'index.html': page(), 'robots.txt': 'User-agent: *\nAllow: /\n', 'llms.txt': LLMS });
  assert.ok(rules(check(d, { blockBots: ['CCBot'] })).includes('ai-crawler-allowed'));
  assert.ok(!rules(check(d, { blockBots: ['CCBot'] })).includes('ai-crawler-blocked'));
  const e = site({ 'index.html': page(), 'robots.txt': 'User-agent: GPTBot\nDisallow: /\n', 'llms.txt': LLMS });
  assert.ok(rules(check(e)).includes('ai-crawler-blocked'));
  assert.ok(!rules(check(e, { allowBots: ['ClaudeBot'], blockBots: ['GPTBot'] })).some((x) => x.startsWith('ai-crawler')));
});
test('llms.txt parsing and requirement', () => {
  assert.deepEqual(parseLlmsTxt(LLMS).errors, []); assert.equal(parseLlmsTxt(LLMS).links[0].url, '/');
  assert.ok(parseLlmsTxt('').errors.length); assert.ok(parseLlmsTxt('# A\n# B\n## S\n- [x](/)').errors.some((e) => /one H1/.test(e)));
  const d = site({ 'index.html': page() });
  assert.ok(rules(check(d)).includes('llms-txt-missing')); assert.ok(!rules(check(d, { requireLlmsTxt: false })).includes('llms-txt-missing'));
});
test('question detection and direct answers', () => {
  assert.ok(isQuestion('What is AEO')); assert.ok(isQuestion('Pricing?')); assert.ok(!isQuestion('Whatever happened next'.replace('Whatever', 'Overview')));
  const d = site({ 'index.html': page('<h1>A</h1><h2>How do I start?</h2><ul><li>Install</li></ul><h2>Why?</h2><p>Because it is short.</p>'), 'llms.txt': LLMS });
  assert.deepEqual(rules(check(d)).filter((r) => r.startsWith('question') || r.startsWith('answer')), []);
  assert.ok(rules(check(d, { maxAnswerWords: 5 })).length >= 0);
});
test('QAPage accepts suggestedAnswer; noindex pages skipped; notArticles', () => {
  const qa = { '@context': 'https://schema.org', '@type': 'QAPage', mainEntity: { '@type': 'Question', name: 'Is it?', suggestedAnswer: { '@type': 'Answer', text: 'Maybe' } } };
  const d = site({ 'index.html': page('<h1>Is it?</h1><p>Maybe</p>', `<script type="application/ld+json">${JSON.stringify(qa)}</script>`), 'llms.txt': LLMS, 'news/a.html': page('<article>x</article>'), 'x.html': page('<article>x</article>', '<meta name="robots" content="noindex">') });
  const r = rules(check(d)); assert.ok(!r.includes('faq-schema-invalid')); assert.ok(r.includes('author-missing'));
  assert.ok(!rules(check(d, { notArticles: ['/news/**'] })).includes('author-missing'));
});
test('allowlist with expiry', () => {
  const d = site({ 'index.html': page() });
  const r = check(d, { now: new Date('2026-10-14') }, { allowlist: [{ rule: 'llms-txt-missing', reason: 'adding next sprint', expires: '2026-11-30' }, { rule: 'organization-schema-missing', reason: 'later' }] });
  assert.equal(r.findings.length, 0); assert.equal(r.suppressed.length, 2);
});
test('CLI exit codes and formats', () => {
  const bin = new URL('../bin/answer-beacon.js', import.meta.url).pathname;
  const run = (...x) => spawnSync(process.execPath, [bin, ...x], { encoding: 'utf8' });
  assert.equal(run(fx('good'), '--fail-on', 'info').status, 0);
  assert.equal(run(fx('bad')).status, 1);
  assert.equal(run(fx('bad'), '--fail-on', 'none').status, 0);
  assert.equal(run('/nonexistent-dir-xyz').status, 2);
  assert.equal(run(fx('good'), '--max-answer-words', '1').status, 2);
  const s = JSON.parse(run(fx('bad'), '--format', 'sarif', '--fail-on', 'none').stdout); assert.equal(s.version, '2.1.0');
  assert.match(run(fx('bad'), '--format', 'markdown', '--fail-on', 'none').stdout, /\| Severity \|/);
  assert.equal(run(fx('good'), '--allow-bots', 'CCBot').status, 1);
});
