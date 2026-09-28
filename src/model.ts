import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { Feed, IAnswer } from './request';

/**
 * One rich motd entry as the hub answers it: markdown inline, html as the url of its package.
 */
export type RichEntry =
  | { group: string; kind: 'markdown'; body: string }
  | { group: string; kind: 'html'; url: string };

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
  typeClass: string;
  audience: 'all' | 'direct';
  audienceLabel: string;
}

/**
 * The extension's settings, schema/plugin.json.
 */
export interface IMotdSettings {
  openOnStart: boolean;
  reopenOnBroadcast: boolean;
  pollMinutes: number;
}

export const DEFAULT_SETTINGS: IMotdSettings = {
  openOnStart: true,
  reopenOnBroadcast: false,
  pollMinutes: 0
};

/**
 * The notification types JupyterLab styles with a jp-Notification-Toast-<type> class.
 */
const STYLED_TYPES = ['info', 'success', 'warning', 'error', 'in-progress'];

const UNPULLED = { state: 'unpulled' as const, etag: null, rows: [] };

/**
 * The feed after one answer. A 304 keeps the rows the model already holds.
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
      return { state: 'absent', etag: null, rows: [] };
    default:
      return { state: 'failed', etag: null, rows: [] };
  }
}

/**
 * The entries of a rich answer; an entry of an unknown kind or shape is dropped.
 */
export function richRows(body: unknown): RichEntry[] {
  const entries = (body as { entries?: unknown })?.entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter(
    (e): e is RichEntry =>
      typeof e?.group === 'string' &&
      ((e.kind === 'markdown' && typeof e.body === 'string') ||
        (e.kind === 'html' && typeof e.url === 'string'))
  );
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
 * Whether the tab has something to show: the hub carries the motd extension (the rich feed
 * answered) and holds at least one entry or one notification for the user.
 */
export function hasContent(
  rich: IFeedState<RichEntry>,
  notifications: IFeedState<INotificationRow>
): boolean {
  return (
    rich.state === 'ok' &&
    (rich.rows.length > 0 || notifications.rows.length > 0)
  );
}

/**
 * The one console line the extension writes when it opens nothing.
 */
export function silenceLine(rich: IFeedState<RichEntry>): string {
  const why = {
    ok: 'the hub holds no entry and no notification for this user',
    absent: 'the hub has no motd extension or cannot be reached',
    failed: 'the hub refused the rich feed or did not answer',
    unpulled: 'nothing was pulled'
  }[rich.state];
  return `Message of the day: nothing to show - ${why}`;
}

/**
 * The notification rows as the tab draws them: newest first, each with the lab's toast class
 * for its type and the audience marker.
 */
export function notificationView(
  rows: INotificationRow[]
): INotificationView[] {
  const time = (ts: string) => {
    const t = Date.parse(ts);
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...rows]
    .sort((a, b) => time(b.ts) - time(a.ts))
    .map(r => {
      const audience = r.audience === 'direct' ? 'direct' : 'all';
      return {
        message: r.message,
        ts: r.ts,
        type: STYLED_TYPES.includes(r.type) ? r.type : 'default',
        typeClass: STYLED_TYPES.includes(r.type)
          ? `jp-Notification-Toast-${r.type}`
          : '',
        audience,
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
 * The settings with their defaults filled in; pollMinutes is a whole number of at least 0.
 */
export function readSettings(
  composite: ReadonlyPartialJSONObject
): IMotdSettings {
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  const minutes = composite.pollMinutes;
  return {
    openOnStart: bool(composite.openOnStart, DEFAULT_SETTINGS.openOnStart),
    reopenOnBroadcast: bool(
      composite.reopenOnBroadcast,
      DEFAULT_SETTINGS.reopenOnBroadcast
    ),
    pollMinutes:
      typeof minutes === 'number' && minutes > 0 ? Math.floor(minutes) : 0
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
    return hasContent(this.rich, this.notifications);
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
