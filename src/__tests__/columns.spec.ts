/**
 * The two columns of the open tab: the Notifications column kept current by the clock
 * (ACC-VIEW-92) and the names a screen reader announces for both columns (ACC-LAYOUT-93).
 */
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { Widget } from '@lumino/widgets';

import { INotificationRow, MotdModel, RichEntry } from '../model';
import { MotdPanel } from '../panel';
import { Feed, IAnswer } from '../request';

/**
 * An ISO timestamp this many minutes before now.
 */
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

// an html entry never reaches the renderer
const RENDERMIME = {} as IRenderMimeRegistry;

const ENTRIES: RichEntry[] = [
  { label: 'interns', kind: 'html', url: '/pkg-1/index.html' }
];

function modelAnswering(entries: RichEntry[], rows: INotificationRow[]) {
  const calls: Feed[] = [];
  const model = new MotdModel(async (feed): Promise<IAnswer> => {
    calls.push(feed);
    return feed === 'rich'
      ? { status: 200, etag: '"r"', body: { entries } }
      : { status: 200, etag: '"n"', body: { notifications: rows } };
  });
  return { model, calls };
}

const row = (message: string, minutes: number): INotificationRow => ({
  ts: ago(minutes),
  message,
  type: 'info',
  audience: 'all'
});

describe('MotdPanel notification times (ACC-VIEW-92)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const texts = (panel: MotdPanel, selector: string) =>
    Array.from(panel.node.querySelectorAll(selector)).map(el => el.textContent);

  it('redraws the Notifications column each minute without a pull and keeps the cards', async () => {
    const { model, calls } = modelAnswering(ENTRIES, [
      row('recent', 5),
      // inside the 24 hour window for one minute and a half more
      row('leaving', 24 * 60 - 1.5)
    ]);
    await model.pull();
    const panel = new MotdPanel(model, RENDERMIME);
    await panel.render();
    Widget.attach(panel, document.body);
    // the settings apply pollMinutes while the tab is open, which re-arms only the poll
    panel.pollMinutes = 0;
    const cards = Array.from(
      panel.node.querySelectorAll('.jp-MotdPanel-section')
    );
    const frame = panel.node.querySelector('iframe');
    expect(texts(panel, '.jp-MotdPanel-message')).toEqual([
      'recent',
      'leaving'
    ]);
    expect(texts(panel, '.jp-MotdPanel-time')).toEqual([
      '5 minutes ago',
      '23 hours ago'
    ]);
    expect(texts(panel, '.jp-MotdPanel-count')).toEqual(['2']);

    jest.advanceTimersByTime(60_000);
    expect(texts(panel, '.jp-MotdPanel-time')).toEqual([
      '6 minutes ago',
      '23 hours ago'
    ]);

    jest.advanceTimersByTime(60_000);
    expect(texts(panel, '.jp-MotdPanel-message')).toEqual(['recent']);
    expect(texts(panel, '.jp-MotdPanel-time')).toEqual(['7 minutes ago']);
    expect(texts(panel, '.jp-MotdPanel-count')).toEqual(['1']);
    expect(calls).toEqual(['rich', 'notifications']);
    const now = Array.from(
      panel.node.querySelectorAll('.jp-MotdPanel-section')
    );
    expect(now).toHaveLength(cards.length);
    expect(now.every((card, i) => card === cards[i])).toBe(true);
    expect(panel.node.querySelector('iframe')).toBe(frame);
    panel.dispose();
  });

  it('redraws on attach and each minute while the tab is open, and never after dispose', async () => {
    const { model } = modelAnswering(ENTRIES, [row('recent', 5)]);
    await model.pull();
    const panel = new MotdPanel(model, RENDERMIME);
    await panel.render();
    const time = () => texts(panel, '.jp-MotdPanel-time');

    jest.advanceTimersByTime(2 * 60_000);
    expect(time()).toEqual(['5 minutes ago']);
    // the Open command attaches the tab before its pull answers
    Widget.attach(panel, document.body);
    expect(time()).toEqual(['7 minutes ago']);
    jest.advanceTimersByTime(60_000);
    expect(time()).toEqual(['8 minutes ago']);

    Widget.detach(panel);
    jest.advanceTimersByTime(2 * 60_000);
    expect(time()).toEqual(['8 minutes ago']);

    Widget.attach(panel, document.body);
    expect(time()).toEqual(['10 minutes ago']);
    panel.dispose();
    jest.advanceTimersByTime(2 * 60_000);
    expect(time()).toEqual(['10 minutes ago']);
  });

  it('skips a minute while text in the Notifications column is selected', async () => {
    const { model } = modelAnswering(ENTRIES, [row('https://example.org', 5)]);
    await model.pull();
    const panel = new MotdPanel(model, RENDERMIME);
    await panel.render();
    Widget.attach(panel, document.body);
    const message = panel.node.querySelector('.jp-MotdPanel-message')!;
    const selection = document.getSelection()!;
    selection.selectAllChildren(message);

    jest.advanceTimersByTime(60_000);
    expect(message.isConnected).toBe(true);
    expect(selection.toString()).toBe('https://example.org');
    expect(texts(panel, '.jp-MotdPanel-time')).toEqual(['5 minutes ago']);

    // a caret left by a click is no selection
    selection.collapse(message, 0);
    jest.advanceTimersByTime(60_000);
    expect(message.isConnected).toBe(false);
    expect(texts(panel, '.jp-MotdPanel-time')).toEqual(['7 minutes ago']);
    panel.dispose();
  });

  it('keeps a text selection in the Notifications column when a pull answers (DEF-VIEW-45)', async () => {
    const { model } = modelAnswering(ENTRIES, [row('https://example.org', 5)]);
    await model.pull();
    const panel = new MotdPanel(model, RENDERMIME);
    await panel.render();
    Widget.attach(panel, document.body);
    const message = panel.node.querySelector('.jp-MotdPanel-message')!;
    const selection = document.getSelection()!;
    selection.selectAllChildren(message);

    // a poll or a broadcast pull
    await model.pull();
    await panel.render();
    expect(message.isConnected).toBe(true);
    expect(selection.toString()).toBe('https://example.org');

    selection.collapse(message, 0);
    jest.advanceTimersByTime(60_000);
    expect(message.isConnected).toBe(false);
    panel.dispose();
  });
});

describe('MotdPanel entries focus (DEF-VIEW-44)', () => {
  it('gives the focus to the entries column when new cards replace a focused card', async () => {
    let entries = ENTRIES;
    const model = new MotdModel(async (feed): Promise<IAnswer> =>
      feed === 'rich'
        ? { status: 200, etag: `"${entries.length}"`, body: { entries } }
        : { status: 200, etag: '"n"', body: { notifications: [] } }
    );
    await model.pull();
    const panel = new MotdPanel(model, RENDERMIME);
    await panel.render();
    Widget.attach(panel, document.body);
    // a link or a button in a card, reached with Tab
    const card = panel.node.querySelector<HTMLElement>(
      '.jp-MotdPanel-section'
    )!;
    card.tabIndex = -1;
    card.focus();

    entries = [...ENTRIES, { label: 'analysts', kind: 'html', url: '/b' }];
    await model.pull();
    await panel.render();
    expect(card.isConnected).toBe(false);
    expect(document.activeElement).toBe(
      panel.node.querySelector('.jp-MotdPanel-entries')
    );
    panel.dispose();
  });
});

describe('MotdPanel column names (ACC-LAYOUT-93)', () => {
  it('makes both columns regions, named by the tab label and Notifications', () => {
    const { model } = modelAnswering([], []);
    const panel = new MotdPanel(model, RENDERMIME);
    const entries = panel.node.querySelector('.jp-MotdPanel-entries')!;
    const notifications = panel.node.querySelector(
      '.jp-MotdPanel-notifications'
    )!;
    expect(entries.getAttribute('role')).toBe('region');
    expect(entries.getAttribute('aria-label')).toBe('Welcome');
    expect(notifications.getAttribute('role')).toBe('region');
    expect(notifications.getAttribute('aria-label')).toBe('Notifications');
    panel.dispose();
  });

  it('names the entries column by the label the lab gives the tab after construction', () => {
    const { model } = modelAnswering([], []);
    const panel = new MotdPanel(model, RENDERMIME);
    panel.title.label = 'Message of the day';
    expect(
      panel.node
        .querySelector('.jp-MotdPanel-entries')!
        .getAttribute('aria-label')
    ).toBe('Message of the day');
    panel.dispose();
  });
});
