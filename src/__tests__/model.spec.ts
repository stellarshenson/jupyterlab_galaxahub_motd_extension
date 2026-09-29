/**
 * The answer-to-view mapping (ACC-START-2 to 4, ACC-VIEW-9 and 10, ACC-VIEW-11, ACC-LIVE-23 and 24).
 */
import {
  IFeedState,
  INotificationRow,
  MotdModel,
  RichEntry,
  applyAnswer,
  hasContent,
  isNewBroadcast,
  notificationRows,
  notificationView,
  richRows,
  silenceLine
} from '../model';
import { Feed, IAnswer } from '../request';

const ok = <T>(rows: T[]): IFeedState<T> => ({
  state: 'ok',
  etag: '"e"',
  rows
});
const absent = <T>(): IFeedState<T> => ({
  state: 'absent',
  etag: null,
  rows: []
});
const failed = <T>(): IFeedState<T> => ({
  state: 'failed',
  etag: null,
  rows: []
});

const ENTRY: RichEntry = { group: 'analysts', kind: 'markdown', body: '# Hi' };
const ROW: INotificationRow = {
  ts: '2026-09-28T08:00:00+00:00',
  message: 'maintenance tonight',
  type: 'warning',
  audience: 'all'
};

describe('applyAnswer', () => {
  const previous = ok([ROW]);

  it('takes the rows and the Etag of a 200', () => {
    const next = applyAnswer(
      previous,
      { status: 200, etag: '"n"', body: { notifications: [] } },
      notificationRows
    );
    expect(next).toEqual({ state: 'ok', etag: '"n"', rows: [] });
  });

  it('keeps the held rows and Etag on a 304', () => {
    const next = applyAnswer(
      previous,
      { status: 304, etag: '"e"', body: null },
      notificationRows
    );
    expect(next).toEqual(previous);
  });

  it('reads the proxy 204 as an absent hub and keeps the held rows and Etag', () => {
    const next = applyAnswer(
      previous,
      { status: 204, etag: null, body: null },
      notificationRows
    );
    expect(next).toEqual({ ...previous, state: 'absent' });
  });

  it.each([403, 500, 0])(
    'reads status %s as failed and keeps the held rows and Etag',
    status => {
      const next = applyAnswer(
        previous,
        { status, etag: null, body: null },
        notificationRows
      );
      expect(next).toEqual({ ...previous, state: 'failed' });
    }
  );
});

describe('richRows', () => {
  it('keeps the hub order and drops an entry of unknown kind or shape', () => {
    const rows = richRows({
      entries: [
        {
          group: 'b-group',
          kind: 'html',
          url: '/hub/api/extensions/motd/rich/p1/index.html'
        },
        { group: 'a-group', kind: 'markdown', body: 'text' },
        { group: 'c-group', kind: 'terminal', body: 'x' },
        { group: 'd-group', kind: 'html' }
      ]
    });
    expect(rows.map(r => r.group)).toEqual(['b-group', 'a-group']);
  });

  it('answers no rows for a body without entries', () => {
    expect(richRows(null)).toEqual([]);
    expect(richRows({})).toEqual([]);
  });
});

describe('hasContent', () => {
  it('opens for a rich entry', () => {
    expect(hasContent(ok([ENTRY]), ok([]))).toBe(true);
  });

  it('opens for notifications alone when the rich feed answered', () => {
    expect(hasContent(ok([]), ok([ROW]))).toBe(true);
  });

  it('stays closed when the hub has no motd extension, notifications or not', () => {
    expect(hasContent(absent(), ok([ROW]))).toBe(false);
  });

  it('stays closed on empty answers', () => {
    expect(hasContent(ok([]), ok([]))).toBe(false);
    expect(hasContent(ok([]), absent())).toBe(false);
  });

  it('stays closed when the rich feed failed', () => {
    expect(hasContent(failed(), ok([ROW]))).toBe(false);
  });
});

describe('silenceLine', () => {
  it('is one line naming the reason', () => {
    for (const rich of [
      ok<RichEntry>([]),
      absent<RichEntry>(),
      failed<RichEntry>()
    ]) {
      const line = silenceLine(rich);
      expect(line.startsWith('Message of the day: nothing to show - ')).toBe(
        true
      );
      expect(line).not.toContain('\n');
    }
    expect(silenceLine(absent())).toContain('no motd extension');
  });
});

describe('notificationView', () => {
  const rows: INotificationRow[] = [
    {
      ts: '2026-09-27T10:00:00+00:00',
      message: 'oldest',
      type: 'info',
      audience: 'all'
    },
    {
      ts: '2026-09-28T10:00:00+00:00',
      message: 'newest',
      type: 'error',
      audience: 'direct'
    },
    {
      ts: '2026-09-27T22:00:00+00:00',
      message: 'middle',
      type: 'mystery',
      audience: 'all'
    }
  ];

  it('lists newest first whatever order the answer carried', () => {
    expect(notificationView(rows).map(r => r.message)).toEqual([
      'newest',
      'middle',
      'oldest'
    ]);
  });

  it('keeps a lab type and reads an unknown type as default', () => {
    expect(notificationView(rows).map(r => r.type)).toEqual([
      'error',
      'default',
      'info'
    ]);
  });

  it('marks the audience', () => {
    const [newest, middle] = notificationView(rows);
    expect([newest.audience, newest.audienceLabel]).toEqual([
      'direct',
      'Direct'
    ]);
    expect([middle.audience, middle.audienceLabel]).toEqual([
      'all',
      'All users'
    ]);
  });
});

describe('isNewBroadcast', () => {
  const later = { ...ROW, ts: '2026-09-28T09:00:00+00:00', message: 'new one' };

  it('is true for a message that arrived as a new row', () => {
    expect(isNewBroadcast([ROW], [later, ROW], 'new one')).toBe(true);
  });

  it('is false for a message the feed does not carry', () => {
    expect(isNewBroadcast([ROW], [ROW], 'kernel restarted')).toBe(false);
  });

  it('is false for a message already pulled before the notification', () => {
    expect(isNewBroadcast([later, ROW], [later, ROW], 'new one')).toBe(false);
  });
});

describe('MotdModel', () => {
  it('pulls the rich and notifications feeds only, sending the Etag it holds', async () => {
    const calls: [Feed, string | null][] = [];
    const answers: Record<Feed, IAnswer[]> = {
      rich: [
        { status: 200, etag: '"r1"', body: { entries: [ENTRY] } },
        { status: 304, etag: '"r1"', body: null }
      ],
      notifications: [
        { status: 200, etag: '"n1"', body: { notifications: [ROW] } },
        { status: 200, etag: '"n2"', body: { notifications: [] } }
      ]
    };
    const model = new MotdModel(async (feed, etag) => {
      calls.push([feed, etag]);
      return answers[feed].shift()!;
    });
    let changed = 0;
    model.changed.connect(() => changed++);

    await model.pull();
    await model.pull();

    expect(calls).toEqual([
      ['rich', null],
      ['notifications', null],
      ['rich', '"r1"'],
      ['notifications', '"n1"']
    ]);
    expect(model.rich.rows).toEqual([ENTRY]);
    expect(model.notifications.rows).toEqual([]);
    expect(changed).toBe(2);
  });
});
