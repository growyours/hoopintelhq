// Submits sitemap URLs to IndexNow. Run manually: node scripts/indexnow.mjs [--dry-run]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HOST = 'hoopintelhq.com';
export const KEY = 'ecde637075034684de32676051cc25da';
export const ENDPOINT = 'https://api.indexnow.org/indexnow';
export const TIMEOUT_MS = 30_000;

export const parseSitemap = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());

// Local file backing a URL path, or null if there is none.
function pageFile(pathname, dir) {
  const p = decodeURIComponent(pathname);
  const candidates = p.endsWith('/') ? [`${p}index.html`] : [p, `${p}.html`, `${p}/index.html`];
  for (const c of candidates) {
    const f = join(dir, c);
    if (c.endsWith('.html') && existsSync(f)) return f;
  }
  return null;
}

// True if any <meta name="robots|googlebot" content="...noindex..."> tag exists, whatever the
// attribute order, spacing or quote style.
export function hasNoindex(html) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([^\s"'=<>\/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1].toLowerCase()] ??= m[2] ?? m[3] ?? m[4];
    }
    if (/^(robots|googlebot)$/i.test(attrs.name?.trim() ?? '') && /noindex/i.test(attrs.content ?? '')) return true;
  }
  return false;
}

// Keep only https://hoopintelhq.com HTML pages that are not noindex.
export function filterUrls(urls, dir = root) {
  const keep = [];
  for (const raw of urls) {
    let u;
    try { u = new URL(raw); } catch { continue; }
    if (u.protocol !== 'https:' || u.hostname !== HOST || u.port) continue;
    if (/\.[a-z0-9]+$/i.test(u.pathname) && !u.pathname.endsWith('.html')) continue; // .txt, .xml, images...
    const file = pageFile(u.pathname, dir);
    if (!file) continue;
    if (hasNoindex(readFileSync(file, 'utf8'))) continue;
    keep.push(u.href);
  }
  return keep;
}

export function statusMessage(status) {
  switch (status) {
    case 200: return 'OK (200): IndexNow accepted the URLs.';
    case 202: return 'Accepted (202): IndexNow received the URLs; the key check will finish later.';
    case 400: return 'Bad request (400): the request was malformed. Check the host, key and URL list.';
    case 403: return 'Forbidden (403): the key is invalid or the key file at keyLocation could not be verified.';
    case 422: return 'Unprocessable (422): the URLs do not match the host or the key does not match the key file.';
    case 429: return 'Too many requests (429): IndexNow is rate limiting this site. Wait and try again later.';
    default: return `Unexpected response (${status}).`;
  }
}

export function buildPayload(urlList) {
  return { host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList };
}

// Returns the process exit code.
export async function run({ dryRun = false, fetchImpl = fetch, dir = root, log = console.log } = {}) {
  const urlList = filterUrls(parseSitemap(readFileSync(join(dir, 'sitemap.xml'), 'utf8')), dir);
  if (!urlList.length) { log('No indexable URLs to submit.'); return 1; }
  const payload = buildPayload(urlList);
  if (dryRun) {
    log(`Dry run: would POST ${urlList.length} URL(s) to ${ENDPOINT}:`);
    log(JSON.stringify(payload, null, 2));
    return 0;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    log(statusMessage(res.status));
    return res.status === 200 || res.status === 202 ? 0 : 1;
  } catch (e) {
    log(e.name === 'AbortError' ? `Timed out after ${TIMEOUT_MS / 1000}s waiting for IndexNow.` : `Request failed: ${e.message}`);
    return 1;
  } finally {
    clearTimeout(timer);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await run({ dryRun: process.argv.includes('--dry-run') }));
}
