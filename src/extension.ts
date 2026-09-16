import * as vscode from 'vscode';
import { BridgeServer, BridgeStatus } from './bridgeServer';
import { LyricsProvider } from './lyricsProvider';
import { LyricsPanel } from './panel';
import { sameTrack, Tick, TrackInfo } from './types';

const NUDGE_STEP_MS = 250;
const STATUS_PRIORITY = 100;

export function activate(context: vscode.ExtensionContext): void {
  const settings = () => vscode.workspace.getConfiguration('ytmLyrics');

  const bridge = new BridgeServer({
    port: settings().get<number>('port', 51234),
    token: settings().get<string>('token', ''),
  });
  const provider = new LyricsProvider(context.globalStorageUri.fsPath);
  const panel = new LyricsPanel(context, {
    onSeek: (position) => bridge.seek(position),
    onTogglePlay: () => bridge.togglePlay(),
  });

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right, STATUS_PRIORITY,
  );
  statusBar.command = 'ytmLyrics.open';
  statusBar.show();

  let currentTrack: TrackInfo | undefined;
  /** Guards against a slow lyrics fetch landing after the user has skipped on. */
  let fetchGeneration = 0;

  const describeStatus = (status: BridgeStatus): string => {
    if (status === 'connected') { return 'Bridge connected — waiting for playback'; }
    if (status === 'listening') { return 'Waiting for the browser bridge to connect…'; }
    if (status === 'error') { return 'Bridge failed to start — is the port already in use?'; }
    return 'Bridge stopped';
  };

  const paintStatusBar = (): void => {
    const connected = bridge.currentStatus === 'connected';
    const icon = connected ? '$(music)' : '$(debug-disconnect)';
    const label = currentTrack && connected ? currentTrack.title : 'Lyrics';
    statusBar.text = `${icon} ${truncate(label, 24)}`;
    statusBar.tooltip = currentTrack && connected
      ? `${currentTrack.title} — ${currentTrack.artist}`
      : describeStatus(bridge.currentStatus);
  };

  bridge.on('status', (status: BridgeStatus) => {
    if (status !== 'connected') { currentTrack = undefined; }
    panel.setStatus(describeStatus(status));
    paintStatusBar();
  });

  bridge.on('failure', (error: Error) => {
    void vscode.window.showErrorMessage(
      `YTM Lyrics bridge could not listen on port ${settings().get('port')}: ${error.message}`,
    );
  });

  bridge.on('rejected', (reason: string) => {
    console.warn(`[ytm-lyrics] refused a bridge connection: ${reason}`);
  });

  bridge.on('idle', () => {
    currentTrack = undefined;
    panel.setStatus('Nothing is playing');
    paintStatusBar();
  });

  bridge.on('track', (track: TrackInfo) => {
    if (sameTrack(currentTrack, track)) { return; }
    currentTrack = track;
    paintStatusBar();

    if (settings().get<boolean>('autoOpen', false)) { panel.reveal(); }
    panel.setTrack(track, null);
    panel.setStatus('Looking up lyrics…');

    const generation = ++fetchGeneration;
    void provider.fetch(track).then((sheet) => {
      if (generation !== fetchGeneration) { return; }
      panel.setTrack(track, sheet);
      panel.setStatus(sheet ? '' : 'No lyrics found for this track');
    });
  });

  bridge.on('tick', (tick: Tick) => panel.setTick(tick));

  const nudge = async (deltaMs: number): Promise<void> => {
    const next = settings().get<number>('offsetMs', 0) + deltaMs;
    await settings().update('offsetMs', next, vscode.ConfigurationTarget.Global);
    void vscode.window.setStatusBarMessage(`Lyrics offset: ${next}ms`, 1500);
  };

  context.subscriptions.push(
    statusBar,
    { dispose: () => bridge.stop() },
    { dispose: () => panel.dispose() },
    vscode.commands.registerCommand('ytmLyrics.open', () => panel.reveal()),
    vscode.commands.registerCommand('ytmLyrics.restartBridge', () => {
      bridge.start();
      void vscode.window.showInformationMessage('YTM Lyrics bridge restarted.');
    }),
    vscode.commands.registerCommand('ytmLyrics.nudgeEarlier', () => nudge(-NUDGE_STEP_MS)),
    vscode.commands.registerCommand('ytmLyrics.nudgeLater', () => nudge(NUDGE_STEP_MS)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('ytmLyrics.port') ||
          event.affectsConfiguration('ytmLyrics.token')) {
        bridge.start();
      }
      panel.refreshConfig();
    }),
  );

  bridge.start();
  paintStatusBar();
}

export function deactivate(): void {
  // Disposables registered on the context handle teardown.
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
