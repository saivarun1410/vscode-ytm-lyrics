# YouTube Music Lyrics for VS Code

[![CI](https://github.com/saivarun1410/vscode-ytm-lyrics/actions/workflows/ci.yml/badge.svg)](https://github.com/saivarun1410/vscode-ytm-lyrics/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85-007ACC.svg)](https://code.visualstudio.com/)

Time-synced lyrics for whatever you're playing on YouTube Music, in a tab beside your code.

**No account credentials are required, or even usable, for this.** See
[Why not credentials?](#why-not-credentials) below.

## How it works

```
music.youtube.com tab                 VS Code window
┌───────────────────────┐            ┌──────────────────────────┐
│ content.js            │            │ BridgeServer (127.0.0.1) │
│  <video>.currentTime  │  ws, 4/s   │           ↓              │
│  mediaSession metadata│ ─────────► │ LyricsProvider → LRCLIB  │
│         ↑             │ ◄───────── │           ↓              │
│    seek / play-pause  │            │ Webview, ViewColumn.Beside│
└───────────────────────┘            └──────────────────────────┘
```

### Why not credentials?

The obvious design is "log in to YouTube Music and ask it what's playing." That does not
work, and it is worth being precise about why:

- The **YouTube Data API** exposes your library, playlists and search. It has no endpoint for
  current playback state.
- **Unofficial cookie-based libraries** are the same story — library, search, and lyrics for a
  video ID you already have. None of them know what is playing right now.

So credentials are simultaneously *insufficient* (they cannot answer the question) and a
*liability* (there is no OAuth scope covering this, which means session-cookie handling).
The player is the only component that knows, so the bridge reads the `<video>` element and
`navigator.mediaSession` directly. Nothing touches your cookies, session or account, and
reading the player gives an exact playback position for free — which is what makes lyrics
actually track the music instead of just sitting there.

This is the project's core architectural decision, not an oversight. Pull requests adding
account login or session scraping will be declined.

### Where lyrics come from

[LRCLIB](https://lrclib.net), a free community database that serves timestamped `.lrc`
directly — so there is no scraping of the licensed lyrics panel inside YouTube Music.

**This repository contains and redistributes no lyrics.** They are fetched at runtime on your
own machine and cached under the extension's global storage directory. Lyric content remains
subject to LRCLIB's terms and the rights of the underlying copyright holders.

## Setup

### 1. The VS Code extension

```bash
npm install
npm run build
```

Then either press <kbd>F5</kbd> in this folder to launch an Extension Development Host, or
package and install it permanently:

```bash
npm run package                       # produces ytm-lyrics-0.1.0.vsix
code --install-extension ytm-lyrics-0.1.0.vsix
```

If `code` is not on your PATH: VS Code → <kbd>Cmd</kbd><kbd>Shift</kbd><kbd>P</kbd> →
*Shell Command: Install 'code' command in PATH*.

### 2. The browser bridge

1. Open `chrome://extensions` (or `brave://extensions`).
2. Turn on **Developer mode**.
3. **Load unpacked** → select this repo's `browser-extension/` folder.

### 3. Play something

Open <https://music.youtube.com>, hit play, then run **YTM Lyrics: Open Lyrics Panel** from
the Command Palette — or click the `♪` item in the status bar.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `ytmLyrics.port` | `51234` | Loopback port. Must match `PORT` in `browser-extension/background.js`. |
| `ytmLyrics.token` | `""` | Optional shared secret. Must match `TOKEN` in `background.js` if set. |
| `ytmLyrics.autoOpen` | `false` | Open the panel automatically when a track starts. |
| `ytmLyrics.offsetMs` | `0` | Global timing nudge. Positive = lines appear later. |
| `ytmLyrics.fontSize` | `15` | Lyrics font size. |
| `ytmLyrics.clickToSeek` | `true` | Click a line to seek the player to it. |

Commands: *Open Lyrics Panel*, *Restart Bridge Server*, *Nudge Lyrics Earlier / Later*.

## Security model

- The server binds to `127.0.0.1` only — unreachable from anywhere but this machine.
- Connections are screened by `Origin`. Browsers set that header themselves and page
  JavaScript cannot forge it, so an `https://` page cannot impersonate the extension and
  snoop on your listening or seek your player.
- Set `ytmLyrics.token` (and the matching `TOKEN` in `background.js`) if you want a shared
  secret on top of that.

## Tests

```bash
npm test
```

Covers LRC parsing (offset tags, multi-timestamp lines, ordering), title/artist
normalisation, bridge origin rejection, message relay, malformed-frame resilience, the seek
round-trip, and LRCLIB reachability.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the dev
loop, the layout of the code, and house rules. Security reports go through
[private advisories](SECURITY.md), not public issues.

`BridgeServer` emits plain `track` / `tick` / `idle` events, so a new playback source — an OS
media-session reader, a YouTube Music Desktop companion client — can be added without
touching the panel or the lyrics provider. That is the intended extension point, and a good
first contribution.

## License

[MIT](LICENSE) © Sai Varun Thupakula

## Known limits

- LRCLIB is community-contributed: obscure tracks may return unsynced lyrics or nothing. The
  panel falls back gracefully and says so.
- The browser extension is unpacked, so Chrome will occasionally ask you to re-enable it.
- Only `music.youtube.com` is matched. To cover regular YouTube too, add
  `https://www.youtube.com/*` to both `matches` and `host_permissions` in the manifest.
