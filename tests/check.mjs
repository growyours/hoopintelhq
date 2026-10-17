import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const UTM = 'utm_source=x&amp;utm_medium=bio&amp;utm_campaign=hoopintelhq';
const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map(m => m[1]);
for (const s of ['hoopscampsfinder.com', 'pickuprunfinder.com', 'hoopsgearrankings.com']) {
  const u = `https://${s}/?${UTM}`;
  ok(hrefs.filter(h => h === u).length === 1, `link ${u}`);
}
ok(hrefs.includes('https://x.com/thehoopsintelhq'), 'X follow link present');
for (const h of hrefs.filter(h => /^https?:/.test(h) && !h.startsWith('https://x.com/')))
  ok(h.endsWith(UTM), `UTM exact on ${h}`);
// og.png dimensions from PNG IHDR
const png = readFileSync(join(root, 'og.png'));
ok(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'og.png is 1200x630');
ok(png.length < 200_000, `og.png < 200KB (${png.length})`);
// scripts: only self-hosted
const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
ok(srcs.length > 0 && srcs.every(s => s.startsWith('/')), `no external script hosts (${srcs.join(', ')})`);
ok(srcs.includes('/_vercel/insights/script.js'), 'Vercel insights script present');
ok(!/https?:\/\/[^"'\s]+\.(js|css|woff2?)/i.test(html), 'no external js/css/font URLs');
ok(!/FAQPage/i.test(html), 'no FAQPage');
for (const f of ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest', 'robots.txt', 'sitemap.xml', 'vercel.json', 'assets/style.css', 'assets/va.js', 'assets/avatar-192.webp', 'assets/avatar-192.jpg'])
  ok(existsSync(join(root, f)), `exists ${f}`);
console.log('(tap-target size and horizontal-scroll checks run in the headless Chrome step)');
process.exit(fails ? 1 : 0);
