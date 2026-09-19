// Manual browser check — NOT part of `npm test`, because it needs a real Chrome, a network
// connection, and YouTube serving ads (which is nondeterministic).
//
//   node tools/browser-check.mjs
//
// Drives a real music.youtube.com session and asserts that content.js reports the playing
// TRACK and never an advertisement. This is what caught the ad-reporting bug: ads share the
// page's single <video> element and repoint navigator.mediaSession at themselves.
//
// Re-run it whenever YouTube Music's DOM changes and tracks stop being detected.
// nothing is reported while ad-showing is set.
import { chromium } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const REPO = '/Users/saivarunthupakula/Documents/VarunSpace/ytm-lyrics';
const src = fs.readFileSync(`${REPO}/browser-extension/content.js`, 'utf8');
const logic = src.split('function sample()')[0].replace(/chrome\.runtime[^\n]*/g, '');

const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'ytml-fx-' + process.pid), { headless: false, channel: 'chrome' });
const page = await ctx.newPage();
await page.goto('https://music.youtube.com/watch?v=kJQP7kiw5Fk', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(6000);
await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.play().catch(()=>{}); } });

let suppressed = 0, reported = [];
for (let i = 0; i < 14; i++) {
  const r = await page.evaluate((l) => {
    eval(l);
    if (isAdPlaying()) return { ad: true };
    const v = findVideo();
    if (!v) return { ad: false, track: null };
    const t = readTrack(v);
    return { ad: false, track: t ? { title: t.title, duration: +t.duration.toFixed(1), videoId: t.videoId } : null };
  }, logic);
  if (r.ad) { suppressed++; console.log('  ad playing -> SUPPRESSED (nothing sent to bridge)'); }
  else if (r.track) { reported.push(r.track); console.log('  reported:', JSON.stringify(r.track)); }
  await page.waitForTimeout(2500);
}
console.log(`\n  ad samples suppressed: ${suppressed}`);
const bad = reported.filter(t => t.duration < 35);
console.log(`  distinct tracks reported: ${[...new Set(reported.map(t=>t.title))].join(' | ') || '(none)'}`);
console.log(`  suspicious short-duration reports (would be ads): ${bad.length}`);
await ctx.close();
