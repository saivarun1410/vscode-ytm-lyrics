import { LyricLine } from './types';

/** Matches one `[mm:ss.xx]` timestamp; a line may carry several. */
const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** Matches ID tags such as `[offset:+250]` that carry metadata, not timing. */
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\s*\]/i;

/**
 * Parses an LRC document into time-ordered lines.
 *
 * Handles multi-timestamp lines (`[00:12.00][01:44.00] text`) and applies any
 * embedded `[offset:]` tag, which LRC defines as milliseconds to shift playback.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const offsetSeconds = readOffsetSeconds(lrc);
  const lines: LyricLine[] = [];

  for (const rawLine of lrc.split(/\r?\n/)) {
    const text = rawLine.replace(TIMESTAMP, '').trim();
    TIMESTAMP.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TIMESTAMP.exec(rawLine)) !== null) {
      lines.push({ time: toSeconds(match) + offsetSeconds, text });
    }
  }

  return dedupe(lines.sort((a, b) => a.time - b.time));
}

/** Converts plain unsynced lyrics into lines that all share time 0. */
export function parsePlain(plain: string): LyricLine[] {
  return plain.split(/\r?\n/).map((text) => ({ time: 0, text: text.trim() }));
}

function toSeconds(match: RegExpExecArray): number {
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fractionDigits = match[3] ?? '0';
  // `.5` means 500ms while `.50` means 500ms and `.500` means 500ms — pad to 3.
  const millis = Number(fractionDigits.padEnd(3, '0'));
  return minutes * 60 + seconds + millis / 1000;
}

function readOffsetSeconds(lrc: string): number {
  const tag = OFFSET_TAG.exec(lrc);
  return tag ? Number(tag[1]) / 1000 : 0;
}

/** Drops consecutive lines that share a timestamp and text, which LRCLIB sometimes emits. */
function dedupe(lines: LyricLine[]): LyricLine[] {
  return lines.filter((line, index) => {
    const previous = lines[index - 1];
    return !previous || previous.time !== line.time || previous.text !== line.text;
  });
}

/** Index of the line active at `position`, or -1 before the first line. */
export function activeLineIndex(lines: LyricLine[], position: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= position) { found = mid; low = mid + 1; } else { high = mid - 1; }
  }
  return found;
}
