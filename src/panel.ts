import * as vscode from 'vscode';
import { LyricSheet, Tick, TrackInfo } from './types';

const VIEW_TYPE = 'ytmLyrics.panel';
const TITLE = 'Lyrics';

export interface PanelCallbacks {
  onSeek(position: number): void;
  onTogglePlay(): void;
}

/**
 * Hosts the lyrics webview in an editor column beside the user's code.
 *
 * The panel receives position samples roughly four times a second and interpolates
 * between them locally, so highlighting advances smoothly rather than in visible steps.
 */
export class LyricsPanel {
  private panel?: vscode.WebviewPanel;
  private lastTrack?: TrackInfo;
  private lastSheet?: LyricSheet | null;
  private lastStatus = 'Waiting for the browser bridge…';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly callbacks: PanelCallbacks,
  ) {}

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  reveal(): void {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Beside, true);
      return;
    }
    this.create();
  }

  setStatus(status: string): void {
    this.lastStatus = status;
    this.post({ type: 'status', status });
  }

  setTrack(track: TrackInfo, sheet: LyricSheet | null): void {
    this.lastTrack = track;
    this.lastSheet = sheet;
    this.post({ type: 'track', track, sheet, config: this.viewConfig() });
  }

  setTick(tick: Tick): void {
    this.post({ type: 'tick', tick });
  }

  refreshConfig(): void {
    this.post({ type: 'config', config: this.viewConfig() });
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private viewConfig(): { offsetMs: number; fontSize: number; clickToSeek: boolean } {
    const settings = vscode.workspace.getConfiguration('ytmLyrics');
    return {
      offsetMs: settings.get<number>('offsetMs', 0),
      fontSize: settings.get<number>('fontSize', 15),
      clickToSeek: settings.get<boolean>('clickToSeek', true),
    };
  }

  private create(): void {
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      TITLE,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
      },
    );
    this.panel = panel;
    panel.webview.html = this.render(panel.webview);

    panel.onDidDispose(() => { this.panel = undefined; }, null, this.context.subscriptions);
    panel.webview.onDidReceiveMessage(
      (message: { type: string; position?: number }) => this.onMessage(message),
      null,
      this.context.subscriptions,
    );

    // Replay the last known state so a reopened panel is not blank until the next track.
    this.post({ type: 'status', status: this.lastStatus });
    if (this.lastTrack) {
      this.post({
        type: 'track', track: this.lastTrack, sheet: this.lastSheet, config: this.viewConfig(),
      });
    }
  }

  private onMessage(message: { type: string; position?: number }): void {
    if (message.type === 'seek' && typeof message.position === 'number') {
      this.callbacks.onSeek(message.position);
    } else if (message.type === 'togglePlay') {
      this.callbacks.onTogglePlay();
    }
  }

  private post(payload: unknown): void {
    void this.panel?.webview.postMessage(payload);
  }

  private render(webview: vscode.Webview): string {
    const asset = (name: string): vscode.Uri =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', name));
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      // Album art is served from Google's CDN; https: keeps that working without widening further.
      `img-src ${webview.cspSource} https: data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<link rel="stylesheet" href="${asset('panel.css')}" />
<title>${TITLE}</title>
</head>
<body>
  <header id="now-playing" hidden>
    <img id="art" alt="" />
    <div class="meta">
      <div id="title"></div>
      <div id="artist"></div>
    </div>
  </header>
  <main id="lyrics" tabindex="0"></main>
  <footer id="footer"></footer>
  <script nonce="${nonce}" src="${asset('panel.js')}"></script>
</body>
</html>`;
  }
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}
