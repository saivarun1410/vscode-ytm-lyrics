// Owns the WebSocket to the VS Code extension. This lives in the service worker rather than
// the content script because extension contexts are trusted origins, which keeps the
// loopback connection clear of the page's mixed-content rules.

// Must match the `ytmLyrics.port` / `ytmLyrics.token` settings in VS Code.
const PORT = 51234;
const TOKEN = '';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

let socket = null;
let reconnectDelay = RECONNECT_MIN_MS;
let reconnectTimer = null;
/** Tab that most recently reported playback, so seeks go back to the right player. */
let activeTabId = null;

function endpoint() {
  const query = TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : '';
  return `ws://127.0.0.1:${PORT}/${query}`;
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  clearTimeout(reconnectTimer);

  try {
    socket = new WebSocket(endpoint());
  } catch (error) {
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    reconnectDelay = RECONNECT_MIN_MS;
  });

  socket.addEventListener('message', (event) => {
    if (activeTabId === null) { return; }
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    chrome.tabs.sendMessage(activeTabId, payload).catch(() => {
      // The tab closed since it last reported; the next sample will re-register one.
      activeTabId = null;
    });
  });

  socket.addEventListener('close', scheduleReconnect);
  socket.addEventListener('error', () => socket && socket.close());
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, reconnectDelay);
  // Back off so a closed VS Code does not mean a reconnect attempt every second all day.
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab && sender.tab.id !== undefined) { activeTabId = sender.tab.id; }

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connect();
    return;
  }
  socket.send(JSON.stringify(message));
});

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
