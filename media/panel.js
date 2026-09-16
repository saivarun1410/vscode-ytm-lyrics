(() => {
  const vscode = acquireVsCodeApi();

  const nowPlaying = document.getElementById('now-playing');
  const artEl = document.getElementById('art');
  const titleEl = document.getElementById('title');
  const artistEl = document.getElementById('artist');
  const lyricsEl = document.getElementById('lyrics');
  const footerEl = document.getElementById('footer');

  /** Autoscroll stands down for this long after the user scrolls by hand. */
  const MANUAL_SCROLL_GRACE_MS = 4000;

  const state = {
    lines: [],
    synced: false,
    config: { offsetMs: 0, fontSize: 15, clickToSeek: true },
    /** Last position reported by the bridge, and the wall clock when it arrived. */
    basePosition: 0,
    baseWall: performance.now(),
    paused: true,
    rate: 1,
    activeIndex: -1,
    lineEls: [],
    lastManualScroll: 0,
  };

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'track') {
      applyConfig(message.config);
      renderTrack(message.track, message.sheet);
    } else if (message.type === 'tick') {
      applyTick(message.tick);
    } else if (message.type === 'status') {
      renderStatus(message.status);
    } else if (message.type === 'config') {
      applyConfig(message.config);
    }
  });

  lyricsEl.addEventListener('scroll', () => {
    // Programmatic scrolling also fires this, so compare against our own last move.
    if (performance.now() - state.lastProgrammaticScroll > 150) {
      state.lastManualScroll = performance.now();
    }
  });

  lyricsEl.addEventListener('click', (event) => {
    const line = event.target.closest('.line');
    if (!line || !state.synced || !state.config.clickToSeek) { return; }
    const time = Number(line.dataset.time);
    if (Number.isFinite(time)) { vscode.postMessage({ type: 'seek', position: time }); }
  });

  function applyConfig(config) {
    if (!config) { return; }
    state.config = config;
    lyricsEl.style.fontSize = `${config.fontSize}px`;
    for (const el of state.lineEls) { el.classList.toggle('seekable', state.synced && config.clickToSeek); }
  }

  function applyTick(tick) {
    state.basePosition = tick.position;
    state.baseWall = performance.now();
    state.paused = tick.paused;
    state.rate = tick.playbackRate || 1;
  }

  /** Interpolates between bridge samples so highlighting advances smoothly. */
  function currentPosition() {
    if (state.paused) { return state.basePosition; }
    const elapsed = (performance.now() - state.baseWall) / 1000;
    return state.basePosition + elapsed * state.rate;
  }

  function renderStatus(status) {
    if (!status) {
      footerEl.textContent = state.sourceLabel || '';
      return;
    }
    if (state.lines.length === 0) {
      lyricsEl.className = 'message';
      lyricsEl.textContent = status;
    }
    footerEl.textContent = status;
  }

  function renderTrack(track, sheet) {
    nowPlaying.hidden = false;
    titleEl.textContent = track.title;
    artistEl.textContent = [track.artist, track.album].filter(Boolean).join(' · ');
    if (track.artworkUrl) { artEl.src = track.artworkUrl; } else { artEl.removeAttribute('src'); }

    state.activeIndex = -1;
    state.lineEls = [];

    if (!sheet) {
      state.lines = [];
      state.synced = false;
      state.sourceLabel = '';
      lyricsEl.className = 'message';
      lyricsEl.textContent = 'Looking up lyrics…';
      return;
    }

    if (sheet.instrumental) {
      state.lines = [];
      state.synced = false;
      state.sourceLabel = sheet.source;
      lyricsEl.className = 'message';
      lyricsEl.textContent = 'Instrumental';
      footerEl.textContent = sheet.source;
      return;
    }

    state.lines = sheet.lines;
    state.synced = sheet.synced;
    state.sourceLabel = sheet.synced ? sheet.source : `${sheet.source} · unsynced`;
    footerEl.textContent = state.sourceLabel;

    lyricsEl.className = sheet.synced ? '' : 'unsynced';
    lyricsEl.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const line of sheet.lines) {
      const el = document.createElement('div');
      el.className = 'line';
      if (sheet.synced && state.config.clickToSeek) { el.classList.add('seekable'); }
      el.dataset.time = String(line.time);
      el.textContent = line.text;
      fragment.appendChild(el);
      state.lineEls.push(el);
    }
    lyricsEl.appendChild(fragment);
    lyricsEl.scrollTop = 0;
  }

  function findActiveIndex(position) {
    const lines = state.lines;
    let low = 0;
    let high = lines.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (lines[mid].time <= position) { found = mid; low = mid + 1; } else { high = mid - 1; }
    }
    return found;
  }

  function tickFrame() {
    requestAnimationFrame(tickFrame);
    if (!state.synced || state.lines.length === 0) { return; }

    const position = currentPosition() - state.config.offsetMs / 1000;
    const index = findActiveIndex(position);
    if (index === state.activeIndex) { return; }

    const previous = state.lineEls[state.activeIndex];
    if (previous) { previous.classList.remove('active'); previous.classList.add('past'); }

    state.activeIndex = index;
    const active = state.lineEls[index];
    if (!active) { return; }
    active.classList.add('active');
    active.classList.remove('past');
    // Lines after the active one may be "past" if the user seeked backwards.
    for (let i = index + 1; i < state.lineEls.length; i += 1) {
      state.lineEls[i].classList.remove('past');
    }

    if (performance.now() - state.lastManualScroll > MANUAL_SCROLL_GRACE_MS) {
      state.lastProgrammaticScroll = performance.now();
      active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  state.lastProgrammaticScroll = 0;
  requestAnimationFrame(tickFrame);
})();
