# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/saivarun1410/vscode-ytm-lyrics/security/advisories/new)
instead. Expect an initial response within a week.

## Threat model

This extension opens a WebSocket server on your machine, so it is worth being explicit about
what that does and does not expose.

**What the server is.** `BridgeServer` binds to `127.0.0.1` only — never `0.0.0.0`. It is not
reachable from your local network or the internet, only from processes on the same machine.

**What it carries.** Track title, artist, album, artwork URL, duration, and playback position.
It accepts two commands back: seek, and play/pause. No credentials, cookies, tokens, or
account data are read, transmitted, or stored at any point.

**How connections are screened.** Any process on your machine could in principle open a
socket to the port, and a web page you visit could try. Connections are therefore filtered by
the `Origin` header: browsers set it themselves and page JavaScript cannot forge it, so an
`https://` page is rejected while a browser-extension context is allowed. Setting
`ytmLyrics.token` (and the matching `TOKEN` in `browser-extension/background.js`) adds a
shared secret on top, which is worth doing on a shared or multi-user machine.

**Residual risk.** Origin screening does not stop a *native* program already running as your
user, since such a program can set any header it likes. That program would learn what you are
listening to and could pause it. If your threat model includes hostile local processes, set a
token.

## Privacy

Lyrics lookups send the track title, artist, album, and duration to `lrclib.net`. Nothing
else leaves your machine. Results are cached on disk under the extension's global storage
directory; delete that directory to clear the cache.
