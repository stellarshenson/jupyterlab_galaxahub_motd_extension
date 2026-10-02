import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { Feed, IAnswer } from './request';

/**
 * One rich motd entry: markdown inline, html as the url of its package. `label` heads the
 * entry's card; it is empty when the hub gives none, and the card then has no header strip.
 */
export type RichEntry =
  | { label: string; kind: 'markdown'; body: string }
  | { label: string; kind: 'html'; url: string };

/**
 * One broadcast addressed to the user, as GET /hub/api/user-notifications answers it.
 */
export interface INotificationRow {
  ts: string;
  message: string;
  type: string;
  audience: string;
}

/**
 * One pulled feed. `ok` - the hub answered; `absent` - the proxy's 204, no hub or no motd
 * extension; `failed` - any other status or no answer; `unpulled` - never asked.
 */
export interface IFeedState<T> {
  state: 'unpulled' | 'ok' | 'absent' | 'failed';
  etag: string | null;
  rows: T[];
}

/**
 * One notification row as the tab draws it.
 */
export interface INotificationView {
  message: string;
  ts: string;
  type: string;
  audienceLabel: string;
}

/**
 * The extension's settings, schema/plugin.json.
 */
export interface IMotdSettings {
  openOnStart: boolean;
  reopenOnBroadcast: boolean;
  pollMinutes: number;
  notificationWindow: NotificationWindow;
}

/**
 * How far back the tab lists notifications, one value per choice of the notificationWindow
 * setting.
 */
export const NOTIFICATION_WINDOWS_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

export type NotificationWindow = keyof typeof NOTIFICATION_WINDOWS_MS;

export const DEFAULT_SETTINGS: IMotdSettings = {
  openOnStart: true,
  reopenOnBroadcast: false,
  pollMinutes: 0,
  notificationWindow: '24h'
};

/**
 * The lab's notification types besides default; the tab draws each with its own icon and colour.
 */
const STYLED_TYPES = ['info', 'success', 'warning', 'error', 'in-progress'];

const UNPULLED = { state: 'unpulled' as const, etag: null, rows: [] };

/**
 * The feed after one answer. Any answer but a 200 keeps the rows and the Etag the model holds.
 */
export function applyAnswer<T>(
  previous: IFeedState<T>,
  answer: IAnswer,
  rowsOf: (body: unknown) => T[]
): IFeedState<T> {
  switch (answer.status) {
    case 200:
      return { state: 'ok', etag: answer.etag, rows: rowsOf(answer.body) };
    case 304:
      return { ...previous, state: 'ok' };
    case 204:
      return { ...previous, state: 'absent' };
    default:
      return { ...previous, state: 'failed' };
  }
}

/**
 * The entries of a rich answer; an entry of an unknown kind or shape is dropped. Only `label`,
 * `kind` and `body` or `url` are read; a label that is missing or blank becomes empty.
 */
export function richRows(body: unknown): RichEntry[] {
  const entries = (body as { entries?: unknown })?.entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  const rows: RichEntry[] = [];
  for (const e of entries) {
    const label = typeof e?.label === 'string' ? e.label.trim() : '';
    if (e?.kind === 'markdown' && typeof e.body === 'string') {
      rows.push({ label, kind: 'markdown', body: e.body });
    } else if (e?.kind === 'html' && typeof e.url === 'string') {
      rows.push({ label, kind: 'html', url: e.url });
    }
  }
  return rows;
}

/**
 * The rows of a notifications answer; a row without a message is dropped.
 */
export function notificationRows(body: unknown): INotificationRow[] {
  const rows = (body as { notifications?: unknown })?.notifications;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.filter(r => typeof r?.message === 'string');
}

/**
 * Whether the tab has something to show: the rich feed answered at least one entry - a hub
 * entry, or the local or built-in page the server answers in its place. Notifications alone never
 * open the tab.
 */
export function hasContent(rich: IFeedState<RichEntry>): boolean {
  return rich.state === 'ok' && rich.rows.length > 0;
}

/**
 * The one console line the extension writes when it opens nothing.
 */
export function silenceLine(rich: IFeedState<RichEntry>): string {
  const why = {
    ok: 'the hub holds no entry for this user',
    absent: 'the hub has no motd extension or cannot be reached',
    failed: 'the hub refused the rich feed or did not answer',
    unpulled: 'nothing was pulled'
  }[rich.state];
  return `Message of the day: nothing to show - ${why}`;
}

/**
 * The notification rows as the tab draws them: those inside `span` before `now`, newest first,
 * each with its type, any type the lab does not know read as default, and the audience marker.
 * A row whose time cannot be read is left out.
 */
export function notificationView(
  rows: INotificationRow[],
  span: NotificationWindow,
  now = Date.now()
): INotificationView[] {
  const time = (ts: string) => {
    const t = Date.parse(ts);
    return Number.isNaN(t) ? -Infinity : t;
  };
  return rows
    .filter(r => time(r.ts) >= now - NOTIFICATION_WINDOWS_MS[span])
    .sort((a, b) => time(b.ts) - time(a.ts))
    .map(r => {
      const audience = r.audience === 'direct' ? 'direct' : 'all';
      return {
        message: r.message,
        ts: r.ts,
        type: STYLED_TYPES.includes(r.type) ? r.type : 'default',
        audienceLabel: audience === 'direct' ? 'Direct' : 'All users'
      };
    });
}

/**
 * Whether `message` arrived as a row the previous answer did not carry - that is, the lab
 * notification carrying it is a broadcast the hub recorded for this user.
 */
export function isNewBroadcast(
  before: INotificationRow[],
  after: INotificationRow[],
  message: string
): boolean {
  const seen = new Set(before.map(r => `${r.ts}\n${r.message}`));
  return after.some(
    r => r.message === message && !seen.has(`${r.ts}\n${r.message}`)
  );
}

/**
 * True on the first call for a lab server start in this browser, false on the later ones. The
 * browser keeps the start under `key`, which names the lab.
 */
export function firstLoadOfServerStart(
  key: string,
  serverStart: string
): boolean {
  if (localStorage.getItem(key) === serverStart) {
    return false;
  }
  localStorage.setItem(key, serverStart);
  return true;
}

/**
 * The settings with their defaults filled in; pollMinutes is a whole number of at least 0, and
 * notificationWindow one of its choices.
 */
export function readSettings(
  composite: ReadonlyPartialJSONObject
): IMotdSettings {
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  const minutes = composite.pollMinutes;
  const span = composite.notificationWindow;
  return {
    openOnStart: bool(composite.openOnStart, DEFAULT_SETTINGS.openOnStart),
    reopenOnBroadcast: bool(
      composite.reopenOnBroadcast,
      DEFAULT_SETTINGS.reopenOnBroadcast
    ),
    pollMinutes:
      typeof minutes === 'number' && minutes > 0 ? Math.floor(minutes) : 0,
    notificationWindow:
      typeof span === 'string' &&
      Object.keys(NOTIFICATION_WINDOWS_MS).includes(span)
        ? (span as NotificationWindow)
        : DEFAULT_SETTINGS.notificationWindow
  };
}

/**
 * The pulled answers, the only state the extension keeps besides its settings.
 */
export class MotdModel {
  constructor(fetch: (feed: Feed, etag: string | null) => Promise<IAnswer>) {
    this._fetch = fetch;
  }

  rich: IFeedState<RichEntry> = UNPULLED;
  notifications: IFeedState<INotificationRow> = UNPULLED;

  /**
   * Emitted after every pull.
   */
  get changed(): ISignal<this, void> {
    return this._changed;
  }

  get hasContent(): boolean {
    return hasContent(this.rich);
  }

  /**
   * Pull both feeds, sending the Etags held, and emit `changed`.
   */
  async pull(): Promise<void> {
    const [rich, notifications] = await Promise.all([
      this._fetch('rich', this.rich.etag),
      this._fetch('notifications', this.notifications.etag)
    ]);
    this.rich = applyAnswer(this.rich, rich, richRows);
    this.notifications = applyAnswer(
      this.notifications,
      notifications,
      notificationRows
    );
    this._changed.emit();
  }

  private _fetch: (feed: Feed, etag: string | null) => Promise<IAnswer>;
  private _changed = new Signal<this, void>(this);
}
