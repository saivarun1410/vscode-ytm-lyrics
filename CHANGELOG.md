# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-16

### Added

- Loopback WebSocket bridge (`127.0.0.1`) that receives now-playing state from a companion
  browser extension, screened by `Origin` so web pages cannot connect.
- Companion MV3 browser extension for `music.youtube.com` that reports track metadata and
  playback position from the page's `<video>` element and `navigator.mediaSession`.
- Time-synced lyrics panel rendered beside the editor, interpolating between bridge samples
  with `requestAnimationFrame` for smooth line highlighting.
- Lyrics lookup against [LRCLIB](https://lrclib.net) with exact-match then fuzzy-search
  fallback, duration verification, and on-disk caching.
- LRC parsing covering `[offset:]` tags, multi-timestamp lines, and instrumental spacing.
- Click-to-seek, autoscroll with a manual-scroll grace period, and timing-nudge commands.
- Settings for port, shared token, auto-open, timing offset, font size, and click-to-seek.

[Unreleased]: https://github.com/saivarun1410/vscode-ytm-lyrics/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/saivarun1410/vscode-ytm-lyrics/releases/tag/v0.1.0
