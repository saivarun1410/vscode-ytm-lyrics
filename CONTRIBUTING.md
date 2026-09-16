# Contributing

Thanks for taking a look. This is a small, focused project and contributions are welcome.

## Getting set up

```bash
git clone https://github.com/saivarun1410/vscode-ytm-lyrics.git
cd vscode-ytm-lyrics
npm install
npm run build
```

Open the folder in VS Code and press <kbd>F5</kbd> to launch an Extension Development Host.
Then load `browser-extension/` as an unpacked extension (`chrome://extensions` → Developer
mode → Load unpacked) and play something on <https://music.youtube.com>.

```bash
npm run typecheck   # tsc --noEmit
npm run build       # esbuild bundle into dist/
npm test            # smoke test: parser, bridge, metadata cleaning, API reachability
npm run package     # produce a .vsix
```

`npm test` includes one live request to LRCLIB. Set `YTM_LYRICS_SKIP_NETWORK=1` to skip it —
CI does, so that a free community API is not hammered on every push.

## The shape of the code

| Path | Responsibility |
| --- | --- |
| `src/bridgeServer.ts` | Loopback WebSocket server; origin screening; emits `track`/`tick`/`idle` |
| `src/lyricsProvider.ts` | LRCLIB lookup, duration verification, disk cache |
| `src/lrc.ts` | LRC parsing and active-line search |
| `src/panel.ts` | Webview host, CSP, message plumbing |
| `src/extension.ts` | Wiring, commands, status bar |
| `media/` | Webview client — rendering, interpolation, autoscroll |
| `browser-extension/` | MV3 bridge: content script reads the page, worker owns the socket |

`BridgeServer` emits plain events, so a new playback source (an OS media-session reader, a
YouTube Music Desktop companion client) can be added without touching the panel or the
lyrics provider. That is the intended extension point.

## House rules

- **Never commit lyric text.** Not in tests, fixtures, docs, or screenshots. The project
  fetches lyrics at runtime and redistributes none; test fixtures use placeholder words like
  `alpha` / `beta` and should keep doing so.
- **No credentials, ever.** The design deliberately reads the player rather than the account.
  Pull requests that introduce cookie handling, account login, or session scraping will be
  declined — that is the core architectural decision of this project, not an oversight.
- Keep functions small and files under roughly 300 lines.
- Comments should explain *why*, not restate *what*. Match the surrounding style.
- Add a smoke-test assertion for anything with parsing or protocol logic.
- Update `CHANGELOG.md` under `## [Unreleased]`.

## Pull requests

`main` is protected: it takes no direct pushes, every change arrives as a pull request, CI
must be green on all seven jobs, and the repository owner must approve before merge. Fork the
repo, branch off `main`, keep the diff focused, and make sure `npm run typecheck && npm run
build && npm test` passes. Describe what you changed and how you verified it — "played three
tracks and seeked around" is a perfectly good test report for UI work.

## Reporting bugs

Include your OS, VS Code version, browser, and what the panel footer said at the time. If
lyrics were wrong or missing, include the track title and artist (not the lyrics themselves)
so the metadata-matching logic can be checked.
