/** Track identity as reported by the browser bridge (from navigator.mediaSession). */
export interface TrackInfo {
  title: string;
  artist: string;
  album: string;
  /** Track length in seconds, from the <video> element. */
  duration: number;
  /** Best-effort YouTube video id; may be empty. Used only for cache keys. */
  videoId: string;
  artworkUrl: string;
}

/** Playback position sample, sent ~4x/second. */
export interface Tick {
  position: number;
  paused: boolean;
  playbackRate: number;
}

/** One timed line of a synced lyric sheet. */
export interface LyricLine {
  /** Start time in seconds. */
  time: number;
  text: string;
}

export interface LyricSheet {
  synced: boolean;
  lines: LyricLine[];
  /** Human-readable provenance, shown in the panel footer. */
  source: string;
  instrumental: boolean;
}

export function trackKey(track: TrackInfo): string {
  if (track.videoId) { return `v:${track.videoId}`; }
  const rounded = Math.round(track.duration);
  return `m:${track.artist}|${track.title}|${rounded}`.toLowerCase();
}

export function sameTrack(a: TrackInfo | undefined, b: TrackInfo | undefined): boolean {
  if (!a || !b) { return a === b; }
  return trackKey(a) === trackKey(b);
}
