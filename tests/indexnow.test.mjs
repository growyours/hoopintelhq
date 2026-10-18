import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filterUrls, statusMessage, run, parseSitemap } from '../scripts/indexnow.mjs';

function site() {
  const d = mkdtempSync(join(tmpdir(), 'indexnow-'));
  writeFileSync(join(d, 'index.html'), '<html><head></head></html>');
  writeFileSync(join(d, 'about.html'), '<meta name="robots" content="index,follow">');
  writeFileSync(join(d, 'hidden.html'), '<meta name="robots" content="noindex, nofollow">');
  mkdirSync(join(d, 'blog'));
  writeFileSync(join(d, 'blog', 'index.html'), '<html></html>');
  const locs = [
    'https://hoopintelhq.com/', 'https://hoopintelhq.com/about', 'https://hoopintelhq.com/blog/',
    'https://hoopintelhq.com/hidden', 'https://hoopintelhq.com/llms.txt', 'https://hoopintelhq.com/sitemap.xml',
    'https://hoopintelhq.com/missing', 'https://example.com/', 'http://hoopintelhq.com/', 'https://www.hoopintelhq.com/',
  ];
  writeFileSync(join(d, 'sitemap.xml'), `<urlset>${locs.map(l => `<url><loc>${l}</loc></url>`).join('')}</urlset>`);
  return d;
}

test('filter keeps only indexable https hoopintelhq.com HTML pages', () => {
  const d = site();
  const out = filterUrls(parseSitemap(readFileSyncSitemap(d)), d);
  assert.deepEqual(out, ['https://hoopintelhq.com/', 'https://hoopintelhq.com/about', 'https://hoopintelhq.com/blog/']);
});
import { readFileSync } from 'node:fs';
const readFileSyncSitemap = d => readFileSync(join(d, 'sitemap.xml'), 'utf8');

test('dry run makes no network call and prints the payload', async () => {
  const d = site();
  let calls = 0;
  const lines = [];
  const code = await run({ dryRun: true, dir: d, fetchImpl: () => { calls++; throw new Error('network'); }, log: m => lines.push(m) });
  assert.equal(code, 0);
  assert.equal(calls, 0);
  const text = lines.join('\n');
  assert.match(text, /Dry run/);
  assert.match(text, /"urlList"/);
  assert.match(text, /https:\/\/hoopintelhq\.com\/about/);
  assert.doesNotMatch(text, /llms\.txt|hidden/);
});

test('real run passes an abort signal and reports status', async () => {
  const d = site();
  let signal;
  const lines = [];
  const code = await run({ dir: d, log: m => lines.push(m), fetchImpl: async (_u, o) => { signal = o.signal; return { status: 202 }; } });
  assert.equal(code, 0);
  assert.ok(signal instanceof AbortSignal);
  assert.match(lines[0], /202/);
});

test('plain-language messages', () => {
  assert.match(statusMessage(200), /accepted/i);
  assert.match(statusMessage(202), /received/i);
  assert.match(statusMessage(400), /malformed/i);
  assert.match(statusMessage(403), /key is invalid/i);
  assert.match(statusMessage(422), /do not match/i);
  assert.match(statusMessage(429), /rate limiting/i);
  assert.match(statusMessage(500), /Unexpected response \(500\)/);
});

test('failing statuses give non-zero exit, timeout is reported', async () => {
  const d = site();
  assert.equal(await run({ dir: d, log() {}, fetchImpl: async () => ({ status: 429 }) }), 1);
  const lines = [];
  const code = await run({ dir: d, log: m => lines.push(m), fetchImpl: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } });
  assert.equal(code, 1);
  assert.match(lines[0], /Timed out after 30s/);
});
