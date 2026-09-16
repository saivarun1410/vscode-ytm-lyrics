import { EventEmitter } from 'node:events';
import { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { TrackInfo, Tick } from './types';

/** Only browser-extension contexts may connect; real web pages send an http(s) Origin. */
const EXTENSION_ORIGIN = /^(chrome|moz|safari-web|extension)-extension:\/\//i;
const LOOPBACK_HOST = '127.0.0.1';

export type BridgeStatus = 'stopped' | 'listening' | 'connected' | 'error';

export interface BridgeOptions {
  port: number;
  /** Optional shared secret; when set, connections must present it. */
  token: string;
}

/**
 * Loopback WebSocket server that the browser extension pushes now-playing state to.
 *
 * Binds to 127.0.0.1 only, so nothing outside this machine can reach it. Connections
 * are additionally screened by Origin: browsers set that header themselves and page
 * JavaScript cannot forge it, so an https:// page cannot impersonate the extension.
 */
export class BridgeServer extends EventEmitter {
  private server?: WebSocketServer;
  private client?: WebSocket;
  private status: BridgeStatus = 'stopped';

  constructor(private options: BridgeOptions) {
    super();
  }

  start(): void {
    this.stop();
    const server = new WebSocketServer({ port: this.options.port, host: LOOPBACK_HOST });
    this.server = server;

    server.on('listening', () => this.setStatus('listening'));
    server.on('error', (error: Error) => {
      this.setStatus('error');
      this.emit('failure', error);
    });
    server.on('connection', (socket, request) => this.onConnection(socket, request));
  }

  stop(): void {
    this.client?.close();
    this.client = undefined;
    this.server?.close();
    this.server = undefined;
    this.setStatus('stopped');
  }

  get currentStatus(): BridgeStatus {
    return this.status;
  }

  /** Asks the browser to seek the active player to `position` seconds. */
  seek(position: number): void {
    this.send({ type: 'seek', position });
  }

  /** Toggles play/pause on the active player. */
  togglePlay(): void {
    this.send({ type: 'togglePlay' });
  }

  private send(payload: unknown): void {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(payload));
    }
  }

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    const rejection = this.rejectionReason(request);
    if (rejection) {
      socket.close(1008, rejection);
      this.emit('rejected', rejection);
      return;
    }

    // One bridge at a time: a newly opened YouTube Music tab supersedes the old one.
    this.client?.close(1000, 'superseded');
    this.client = socket;
    this.setStatus('connected');

    socket.on('message', (raw) => this.onMessage(raw.toString()));
    socket.on('close', () => {
      if (this.client === socket) {
        this.client = undefined;
        this.setStatus(this.server ? 'listening' : 'stopped');
        this.emit('disconnected');
      }
    });
    socket.on('error', () => socket.close());
  }

  private rejectionReason(request: IncomingMessage): string | undefined {
    const origin = request.headers.origin;
    if (origin && !EXTENSION_ORIGIN.test(origin)) {
      return 'only browser extensions may connect';
    }
    if (this.options.token) {
      const presented = new URL(request.url ?? '/', 'ws://localhost').searchParams.get('token');
      if (presented !== this.options.token) { return 'bad token'; }
    }
    return undefined;
  }

  private onMessage(raw: string): void {
    let payload: { type?: string; track?: TrackInfo; tick?: Tick };
    try {
      payload = JSON.parse(raw);
    } catch {
      return; // A malformed frame is not worth tearing the bridge down for.
    }

    if (payload.type === 'track' && payload.track) {
      this.emit('track', payload.track);
    } else if (payload.type === 'tick' && payload.tick) {
      this.emit('tick', payload.tick);
    } else if (payload.type === 'idle') {
      this.emit('idle');
    }
  }

  private setStatus(status: BridgeStatus): void {
    if (this.status === status) { return; }
    this.status = status;
    this.emit('status', status);
  }
}
