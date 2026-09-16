import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseLrc, parsePlain } from './lrc';
import { LyricSheet, TrackInfo, trackKey } from './types';

const API_BASE = 'https://lrclib.net/api';
/** LRCLIB asks clients to identify themselves so they can contact operators of misbehaving tools. */
const USER_AGENT = 'vscode-ytm-lyrics/0.1.0 (https://github.com/saivarun1410/vscode-ytm-lyrics)';
const REQUEST_TIMEOUT_MS = 8000;
/** A search hit whose length differs from the playing track by more than this is a different cut. */
const DURATION_TOLERANCE_SECONDS = 4;

/** Decorations YouTube Music appends to titles that would break an exact metadata match. */
const TITLE_NOISE = /\s*[([]\s*(official\s*)?(music\s*)?(video|audio|lyrics?|visualizer|hd|4k|remaster(ed)?(\s*\d{4})?|mv)\s*[)\]]\s*/gi;
/** Auto-generated YouTube artist channels are suffixed with " - Topic". */
const TOPIC_SUFFIX = /\s*-\s*topic\s*$/i;

interface LrcLibRecord {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/**
 * Fetches time-synced lyrics from LRCLIB and caches them on disk.
 *
 * LRCLIB is a free community lyrics database that serves LRC directly, which is why
 * it is used here rather than scraping the licensed lyrics panel inside YouTube Music.
 */
export class LyricsProvider {
  private readonly memory = new Map<string, LyricSheet | null>();

  constructor(private readonly cacheDir: string) {}

  /** Returns a sheet, or null when no usable match exists for the track. */
  async fetch(track: TrackInfo): Promise<LyricSheet | null> {
    const key = trackKey(track);
    if (this.memory.has(key)) { return this.memory.get(key) ?? null; }

    const cached = await this.readCache(key);
    if (cached !== undefined) {
      this.memory.set(key, cached);
      return cached;
    }

    const sheet = await this.lookup(track);
    this.memory.set(key, sheet);
    await this.writeCache(key, sheet);
    return sheet;
  }

  private async lookup(track: TrackInfo): Promise<LyricSheet | null> {
    const title = cleanTitle(track.title);
    const artist = cleanArtist(track.artist);

    const exact = await this.requestExact(title, artist, track.album, track.duration);
    if (exact) { return toSheet(exact); }

    const candidate = await this.requestSearch(title, artist, track.duration);
    return candidate ? toSheet(candidate) : null;
  }

  /** LRCLIB's /get endpoint matches on the full metadata tuple and 404s otherwise. */
  private async requestExact(
    title: string, artist: string, album: string, duration: number,
  ): Promise<LrcLibRecord | null> {
    const query = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) { query.set('album_name', album); }
    if (duration > 0) { query.set('duration', String(Math.round(duration))); }

    const records = await this.request<LrcLibRecord>(`${API_BASE}/get?${query}`);
    return records && !Array.isArray(records) ? records : null;
  }

  /** Falls back to fuzzy search, then re-checks duration so we do not show a remix's lyrics. */
  private async requestSearch(
    title: string, artist: string, duration: number,
  ): Promise<LrcLibRecord | null> {
    const query = new URLSearchParams({ track_name: title, artist_name: artist });
    const results = await this.request<LrcLibRecord[]>(`${API_BASE}/search?${query}`);
    if (!Array.isArray(results) || results.length === 0) { return null; }

    const scored = results
      .filter((record) => record.syncedLyrics || record.plainLyrics || record.instrumental)
      .map((record) => ({ record, drift: Math.abs(record.duration - duration) }))
      .sort((a, b) => scoreOf(a) - scoreOf(b));

    const best = scored[0];
    if (!best) { return null; }
    // With no duration to check against, trust search ranking; otherwise demand a close length.
    if (duration > 0 && best.drift > DURATION_TOLERANCE_SECONDS) { return null; }
    return best.record;
  }

  private async request<T>(url: string): Promise<T | null> {
    const abort = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: abort,
      });
      if (!response.ok) { return null; }
      return (await response.json()) as T;
    } catch {
      // Offline, rate-limited, or timed out — treated the same as "no lyrics available".
      return null;
    }
  }

  private cachePath(key: string): string {
    return path.join(this.cacheDir, `${Buffer.from(key).toString('base64url')}.json`);
  }

  /** Returns undefined when nothing is cached, distinguishing that from a cached miss. */
  private async readCache(key: string): Promise<LyricSheet | null | undefined> {
    try {
      const raw = await fs.readFile(this.cachePath(key), 'utf8');
      return JSON.parse(raw) as LyricSheet | null;
    } catch {
      return undefined;
    }
  }

  private async writeCache(key: string, sheet: LyricSheet | null): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(this.cachePath(key), JSON.stringify(sheet), 'utf8');
    } catch {
      // A cache that cannot be written is a performance problem, not a correctness one.
    }
  }
}

/** Prefers synced sheets, then shorter drift, so a timed match always beats an untimed one. */
function scoreOf(entry: { record: LrcLibRecord; drift: number }): number {
  return (entry.record.syncedLyrics ? 0 : 1000) + entry.drift;
}

function toSheet(record: LrcLibRecord): LyricSheet | null {
  const source = `LRCLIB · ${record.artistName} — ${record.trackName}`;
  if (record.instrumental) {
    return { synced: false, lines: [], source, instrumental: true };
  }
  if (record.syncedLyrics) {
    return { synced: true, lines: parseLrc(record.syncedLyrics), source, instrumental: false };
  }
  if (record.plainLyrics) {
    return { synced: false, lines: parsePlain(record.plainLyrics), source, instrumental: false };
  }
  return null;
}

export function cleanTitle(title: string): string {
  return title.replace(TITLE_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanArtist(artist: string): string {
  // Multi-artist strings ("A, B & C") match far better when reduced to the lead artist.
  const lead = artist.split(/\s*(?:,|&|feat\.?|ft\.?|x)\s+/i)[0] ?? artist;
  return lead.replace(TOPIC_SUFFIX, '').trim();
}
