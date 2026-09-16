// Runs inside music.youtube.com. Reads playback state from the page and forwards it to the
// service worker, which owns the WebSocket to VS Code. Nothing here touches your account,
// cookies or credentials — only the <video> element and navigator.mediaSession.

const SAMPLE_INTERVAL_MS = 250;
/** Reporting an unchanged position forever would spin the CPU; idle after this many samples. */
const IDLE_SAMPLES = 8;

let lastTrackSignature = '';
let idleSamples = 0;
let reportedIdle = false;

function findVideo() {
  return document.querySelector('video');
}

function readTrack(video) {
  const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
  if (!metadata) { return null; }

  const artwork = metadata.artwork || [];
  // Artwork is ordered smallest-first; the last entry is the highest resolution offered.
  const largest = artwork.length ? artwork[artwork.length - 1].src : '';

  return {
    title: metadata.title || '',
    artist: metadata.artist || '',
    album: metadata.album || '',
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    videoId: readVideoId(),
    artworkUrl: largest,
  };
}

function readVideoId() {
  const fromUrl = new URLSearchParams(location.search).get('v');
  if (fromUrl) { return fromUrl; }
  // On browse pages the URL has no id, but the player bar links to the playing track.
  const link = document.querySelector('ytmusic-player-bar a[href*="watch?v="]');
  if (!link) { return ''; }
  const match = /[?&]v=([\w-]{6,})/.exec(link.getAttribute('href') || '');
  return match ? match[1] : '';
}

function signatureOf(track) {
  return `${track.title}|${track.artist}|${Math.round(track.duration)}`;
}

function sample() {
  const video = findVideo();
  const track = video ? readTrack(video) : null;

  if (!track || !track.title) {
    goIdle();
    return;
  }

  const signature = signatureOf(track);
  if (signature !== lastTrackSignature) {
    lastTrackSignature = signature;
    reportedIdle = false;
    post({ type: 'track', track });
  }

  // A paused player that nobody is touching does not need four messages a second.
  if (video.paused) {
    idleSamples += 1;
    if (idleSamples > IDLE_SAMPLES) { return; }
  } else {
    idleSamples = 0;
  }

  post({
    type: 'tick',
    tick: {
      position: video.currentTime,
      paused: video.paused,
      playbackRate: video.playbackRate || 1,
    },
  });
}

function goIdle() {
  if (reportedIdle) { return; }
  reportedIdle = true;
  lastTrackSignature = '';
  post({ type: 'idle' });
}

function post(payload) {
  try {
    chrome.runtime.sendMessage(payload);
  } catch (error) {
    // The service worker restarts independently; the next sample reconnects.
  }
}

// Commands arriving from VS Code, relayed by the service worker.
chrome.runtime.onMessage.addListener((message) => {
  const video = findVideo();
  if (!video) { return; }
  if (message.type === 'seek' && typeof message.position === 'number') {
    video.currentTime = message.position;
  } else if (message.type === 'togglePlay') {
    if (video.paused) { video.play(); } else { video.pause(); }
  }
});

setInterval(sample, SAMPLE_INTERVAL_MS);
