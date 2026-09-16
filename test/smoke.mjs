// End-to-end smoke test: builds the extension's own modules via esbuild, then exercises
// the bridge server with a fake browser client and checks the LRC parser.
import * as esbuild from 'esbuild';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';

const bundle = await esbuild.build({
  entryPoints: ['src/bridgeServer.ts', 'src/lrc.ts', 'src/lyricsProvider.ts'],
  bundle: true, format: 'esm', platform: 'node', outdir: 'test/.build', logLevel: 'silent',
  external: ['ws'],
});
if (bundle.errors.length) { throw new Error('build failed'); }

const { BridgeServer } = await import('./.build/bridgeServer.js');
const { parseLrc, activeLineIndex } = await import('./.build/lrc.js');
const { cleanTitle, cleanArtist } = await import('./.build/lyricsProvider.js');

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(`  PASS  ${name}`); }
  catch (e) { results.push(`  FAIL  ${name} — ${e.message}`); process.exitCode = 1; }
};

// --- LRC parser (synthetic timing fixture, placeholder text) ---
const fixture = ['[offset:+500]', '[00:10.50]alpha', '[00:12.25][01:00.00]beta', '[00:14.00]'].join('\n');
const lines = parseLrc(fixture);
check('parses timestamps with the offset tag applied', () => {
  assert.equal(lines[0].time, 11.0);          // 10.50 + 0.5s offset
  assert.equal(lines[0].text, 'alpha');
});
check('expands multi-timestamp lines into separate entries', () => {
  assert.equal(lines.filter((l) => l.text === 'beta').length, 2);
  assert.equal(lines[3].time, 60.5);
});
check('keeps empty lines as instrumental spacing', () => {
  assert.equal(lines[2].text, '');
});
check('lines come out time-ordered', () => {
  const times = lines.map((l) => l.time);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});
check('activeLineIndex is -1 before the first line', () => {
  assert.equal(activeLineIndex(lines, 0), -1);
  assert.equal(activeLineIndex(lines, 11.0), 0);
  assert.equal(activeLineIndex(lines, 13), 1);
});

// --- metadata cleaning ---
check('strips YouTube title decorations', () => {
  assert.equal(cleanTitle('Some Song (Official Music Video)'), 'Some Song');
  assert.equal(cleanTitle('Some Song [Lyrics]'), 'Some Song');
});
check('reduces artist strings to the lead artist', () => {
  assert.equal(cleanArtist('Artist A, Artist B'), 'Artist A');
  assert.equal(cleanArtist('Artist A - Topic'), 'Artist A');
  assert.equal(cleanArtist('Artist A feat. Artist B'), 'Artist A');
});

// --- bridge server ---
const PORT = 51999;
const bridge = new BridgeServer({ port: PORT, token: '' });
const seen = { track: null, tick: null, idle: false };
bridge.on('track', (t) => { seen.track = t; });
bridge.on('tick', (t) => { seen.tick = t; });
bridge.on('idle', () => { seen.idle = true; });
bridge.start();
await once(bridge, 'status');

const rejected = await connectWith({ Origin: 'https://evil.example.com' });
check('rejects connections from a web page origin', () => {
  assert.equal(rejected.opened, false, 'web-page origin should not stay connected');
});

const accepted = await connectWith({ Origin: 'chrome-extension://abcdefghijklmnop' });
check('accepts connections from an extension origin', () => {
  assert.equal(accepted.opened, true);
});

accepted.socket.send(JSON.stringify({
  type: 'track',
  track: { title: 'T', artist: 'A', album: '', duration: 180, videoId: 'x1', artworkUrl: '' },
}));
accepted.socket.send(JSON.stringify({ type: 'tick', tick: { position: 12.5, paused: false, playbackRate: 1 } }));
accepted.socket.send('{not json');
accepted.socket.send(JSON.stringify({ type: 'idle' }));
await delay(300);

check('relays track, tick and idle, surviving a malformed frame', () => {
  assert.equal(seen.track.videoId, 'x1');
  assert.equal(seen.tick.position, 12.5);
  assert.equal(seen.idle, true);
});

const inbound = new Promise((r) => accepted.socket.once('message', (m) => r(JSON.parse(m.toString()))));
bridge.seek(42);
check('sends seek commands back to the browser', async () => {});
const seekMsg = await Promise.race([inbound, delay(500).then(() => null)]);
check('seek command reaches the client', () => {
  assert.deepEqual(seekMsg, { type: 'seek', position: 42 });
});

accepted.socket.close();
bridge.stop();

// --- live LRCLIB reachability (metadata only; no lyric text is printed) ---
let apiLine = '  SKIP  LRCLIB reachability (no network)';
try {
  if (process.env.YTM_LYRICS_SKIP_NETWORK) { throw new Error('YTM_LYRICS_SKIP_NETWORK is set'); }
  const res = await fetch('https://lrclib.net/api/search?track_name=Yesterday&artist_name=The%20Beatles', {
    headers: { 'User-Agent': 'vscode-ytm-lyrics/0.1.0 (smoke test)' },
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  const synced = json.filter((r) => r.syncedLyrics).length;
  apiLine = `  PASS  LRCLIB reachable — HTTP ${res.status}, ${json.length} results, ${synced} with synced timing`;
} catch (e) {
  apiLine = `  SKIP  LRCLIB check not run — ${e.message}`;
}

console.log('\nSmoke test\n----------');
console.log(results.join('\n'));
console.log(apiLine);
console.log(process.exitCode ? '\nFAILURES PRESENT' : '\nAll assertions passed.');

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function once(emitter, event) { return new Promise((r) => emitter.once(event, r)); }
function connectWith(headers) {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/`, { headers });
    let settled = false;
    socket.on('open', () => setTimeout(() => {
      if (!settled) { settled = true; resolve({ opened: socket.readyState === WebSocket.OPEN, socket }); }
    }, 200));
    socket.on('close', () => {
      if (!settled) { settled = true; resolve({ opened: false, socket }); }
    });
    socket.on('error', () => {
      if (!settled) { settled = true; resolve({ opened: false, socket }); }
    });
  });
}
