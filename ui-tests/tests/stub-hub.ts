import * as http from 'http';

/**
 * The token playwright.config.js hands the lab as JUPYTERHUB_API_TOKEN.
 */
export const STUB_TOKEN = 'galata-stub-token';

/**
 * The text the terminal route answers; the tab must never show it.
 */
export const TERMINAL_TEXT = 'TERMINAL-ONLY-TEXT';

export interface IStubAnswer {
  status: number;
  body?: unknown;
}

/**
 * The hub routes the lab's proxy calls, answered from fields a test sets. A request without
 * the lab token answers 403, so a proxy that forgets the token never opens the tab.
 */
export class StubHub {
  constructor(readonly port: number) {}

  rich: IStubAnswer = { status: 200, body: { entries: [] } };
  notifications: IStubAnswer = { status: 200, body: { notifications: [] } };
  /**
   * The html package pages, by the url path an html entry names.
   */
  pages = new Map<string, string>();
  private counts = new Map<string, number>();
  private server: http.Server | null = null;

  reset(): void {
    this.rich = { status: 200, body: { entries: [] } };
    this.notifications = { status: 200, body: { notifications: [] } };
    this.pages.clear();
    this.counts.clear();
  }

  /**
   * How many requests reached a path under /hub/api/.
   */
  count(path: string): number {
    return this.counts.get(path) ?? 0;
  }

  /**
   * Put one row at the head of the notifications answer, as the hub records a broadcast.
   */
  record(row: unknown): void {
    const body = this.notifications.body as { notifications: unknown[] };
    this.notifications = {
      status: 200,
      body: { notifications: [row, ...body.notifications] }
    };
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }
    const server = http.createServer((req, res) => this.answer(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => resolve());
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  private answer(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = (req.url ?? '').split('?')[0];
    const path = url.replace(/^\/hub\/api\//, '');
    this.counts.set(path, this.count(path) + 1);
    // the hub serves a package page to the browser on its cookie, never on the lab token
    const page = this.pages.get(url);
    if (page !== undefined) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page);
      return;
    }
    if (req.headers.authorization !== `token ${STUB_TOKEN}`) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('{"message": "Forbidden"}');
      return;
    }
    switch (path) {
      case 'extensions/motd/rich':
        return this.send(res, this.rich);
      case 'user-notifications':
        return this.send(res, this.notifications);
      case 'extensions/motd/terminal':
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(TERMINAL_TEXT);
        return;
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"message": "Not Found"}');
    }
  }

  private send(res: http.ServerResponse, answer: IStubAnswer): void {
    if (answer.body === undefined) {
      res.writeHead(answer.status);
      res.end();
      return;
    }
    res.writeHead(answer.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(answer.body));
  }
}
