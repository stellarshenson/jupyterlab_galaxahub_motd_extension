/**
 * Clearing the Notifications column: the Clear and Remove buttons (ACC-VIEW-94-CLEAR-ALL) and the
 * rows that stay away, kept in the clearedNotifications setting (ACC-VIEW-96-STAY-CLEARED).
 */
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { Widget } from '@lumino/widgets';

import {
  INotificationRow,
  MotdModel,
  RichEntry,
  notificationKey
} from '../model';
import { MotdPanel } from '../panel';
import { IAnswer } from '../request';

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

const row = (message: string, minutes: number): INotificationRow => ({
  ts: ago(minutes),
  message,
  type: 'info',
  audience: 'all'
});

const saved = () => jest.fn<Promise<void>, [string[]]>().mockResolvedValue();

/**
 * The open tab over a feed answering `feed.rows`, which a test replaces before the next pull.
 */
async function open(rows: INotificationRow[], save = saved()) {
  const feed = { rows };
  const model = new MotdModel(async (name): Promise<IAnswer> =>
    name === 'rich'
      ? { status: 200, etag: '"r"', body: { entries: ENTRIES } }
      : { status: 200, etag: '"n"', body: { notifications: feed.rows } }
  );
  await model.pull();
  const panel = new MotdPanel(model, RENDERMIME);
  const stored: string[] = [];
  // as in the plugin, the stored list comes back to the panel before the save ends
  panel.saveCleared = async keys => {
    await save(keys);
    stored.push(...keys);
    panel.clearedNotifications = [...stored];
  };
  await panel.render();
  Widget.attach(panel, document.body);
  const pull = async () => {
    await model.pull();
    await panel.render();
  };
  return { panel, feed, save, pull };
}

const messages = (panel: MotdPanel) =>
  Array.from(panel.node.querySelectorAll('.jp-MotdPanel-message')).map(
    el => el.textContent
  );

const clearButton = (panel: MotdPanel) =>
  panel.node.querySelector<HTMLButtonElement>('.jp-MotdPanel-clear');

const removeButtons = (panel: MotdPanel) =>
  Array.from(
    panel.node.querySelectorAll<HTMLButtonElement>('.jp-MotdPanel-remove')
  );

const entriesColumn = (panel: MotdPanel) =>
  panel.node.querySelector('.jp-MotdPanel-entries');

describe('MotdPanel Clear and Remove buttons (ACC-VIEW-94-CLEAR-ALL)', () => {
  it('Clear empties the column and saves every listed key', async () => {
    const rows = [row('first', 5), row('second', 10)];
    const { panel, save } = await open(rows);
    clearButton(panel)!.click();
    expect(messages(panel)).toEqual([]);
    expect(panel.hasClass('jp-mod-noNotifications')).toBe(true);
    expect(save.mock.calls).toEqual([[rows.map(notificationKey)]]);
    panel.dispose();
  });

  it('Remove leaves the other rows and saves one key', async () => {
    const rows = [row('first', 5), row('second', 10), row('third', 15)];
    const { panel, save } = await open(rows);
    removeButtons(panel)[1].click();
    expect(messages(panel)).toEqual(['first', 'third']);
    expect(panel.node.querySelector('.jp-MotdPanel-count')!.textContent).toBe(
      '2'
    );
    expect(save.mock.calls).toEqual([[[notificationKey(rows[1])]]]);
    panel.dispose();
  });

  it('ignores the second click of a double click and a held Enter on Remove', async () => {
    const { panel, save } = await open([row('first', 5), row('second', 10)]);
    const [first] = removeButtons(panel);
    first.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    expect(messages(panel)).toEqual(['first', 'second']);
    expect(save).not.toHaveBeenCalled();
    const keydown = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init
      });
      first.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(keydown({ key: 'Enter', repeat: true })).toBe(true);
    expect(keydown({ key: 'Enter' })).toBe(false);
    expect(keydown({ key: 'PageDown', repeat: true })).toBe(false);
    panel.dispose();
  });

  it('ignores a click on Clear with detail 2', async () => {
    const { panel, save } = await open([row('first', 5), row('second', 10)]);
    clearButton(panel)!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 2 })
    );
    expect(messages(panel)).toEqual(['first', 'second']);
    expect(save).not.toHaveBeenCalled();
    panel.dispose();
  });

  it('names each button for a screen reader, and Remove ends the row', async () => {
    const { panel } = await open([row('maintenance', 5)]);
    const clear = clearButton(panel)!;
    expect(clear.type).toBe('button');
    expect(clear.textContent).toBe('Clear');
    expect(clear.getAttribute('aria-label')).toBe('Clear all notifications');
    expect(clear.parentElement!.className).toBe('jp-MotdPanel-title');
    const [remove] = removeButtons(panel);
    expect(remove.type).toBe('button');
    expect(remove.title).toBe('Remove');
    expect(remove.getAttribute('aria-label')).toBe(
      'Remove notification: maintenance'
    );
    expect(remove.querySelector('svg.jp-MotdPanel-removeIcon')).not.toBeNull();
    expect(remove.parentElement!.lastElementChild).toBe(remove);
    panel.dispose();
  });

  it('draws no button without saveCleared', async () => {
    const { panel } = await open([row('first', 5)]);
    panel.saveCleared = null;
    await panel.render();
    expect(messages(panel)).toEqual(['first']);
    expect(clearButton(panel)).toBeNull();
    expect(removeButtons(panel)).toEqual([]);
    panel.dispose();
  });
});

describe('MotdPanel cleared rows (ACC-VIEW-96-STAY-CLEARED)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps a cleared row out after a pull with the same rows', async () => {
    const { panel, pull } = await open([row('first', 5), row('second', 10)]);
    removeButtons(panel)[0].click();
    await pull();
    expect(messages(panel)).toEqual(['second']);
    panel.dispose();
  });

  it('keeps a cleared row out after a longer notificationWindow, and lists the rows the window adds', async () => {
    const { panel } = await open([row('recent', 5), row('older', 2 * 24 * 60)]);
    panel.notificationWindow = '24h';
    expect(messages(panel)).toEqual(['recent']);
    clearButton(panel)!.click();
    expect(messages(panel)).toEqual([]);
    panel.notificationWindow = '7d';
    expect(messages(panel)).toEqual(['older']);
    panel.dispose();
  });

  it('lists a row with the same message and a new ts', async () => {
    const rows = [row('maintenance', 10)];
    const { panel, feed, pull } = await open(rows);
    removeButtons(panel)[0].click();
    feed.rows = [row('maintenance', 1), ...rows];
    await pull();
    expect(messages(panel)).toEqual(['maintenance']);
    panel.dispose();
  });

  it('applies the setting: the rows it names leave, and an item taken out of it lists its row again', async () => {
    const rows = [row('first', 5), row('second', 10)];
    const { panel } = await open(rows);
    panel.clearedNotifications = [notificationKey(rows[0])];
    expect(messages(panel)).toEqual(['second']);
    panel.clearedNotifications = [];
    expect(messages(panel)).toEqual(['first', 'second']);
    panel.dispose();
  });

  it('removes the row of a press with text selected in the column', async () => {
    const { panel } = await open([row('first', 5), row('second', 10)]);
    document
      .getSelection()!
      .selectAllChildren(panel.node.querySelector('.jp-MotdPanel-message')!);
    removeButtons(panel)[0].click();
    expect(messages(panel)).toEqual(['second']);
    document.getSelection()!.removeAllRanges();
    panel.dispose();
  });

  it('removes a row that left the feed while text in the column was selected', async () => {
    const rows = [row('first', 5), row('second', 10)];
    const { panel, feed, pull } = await open(rows);
    const selection = document.getSelection()!;
    selection.selectAllChildren(
      panel.node.querySelector('.jp-MotdPanel-message')!
    );
    feed.rows = rows.slice(1);
    await pull();
    // the selection skipped the draw of the pull, so the row is still listed
    expect(messages(panel)).toEqual(['first', 'second']);
    removeButtons(panel)[0].click();
    expect(messages(panel)).toEqual(['second']);
    selection.removeAllRanges();
    panel.dispose();
  });

  it('returns the rows and logs an error when the save is rejected', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation();
    const save = saved();
    save.mockRejectedValue(new Error('the lab refused'));
    const { panel } = await open([row('first', 5), row('second', 10)], save);
    clearButton(panel)!.click();
    // the row leaves at once, before the save answers
    expect(messages(panel)).toEqual([]);
    await new Promise(resolve => setTimeout(resolve));
    expect(messages(panel)).toEqual(['first', 'second']);
    expect(log.mock.calls[0][0]).toContain('the lab refused');
    panel.dispose();
  });

  it('returns both rows when two pending saves are both rejected', async () => {
    jest.spyOn(console, 'error').mockImplementation();
    const rejects: ((reason: Error) => void)[] = [];
    const save = saved();
    save.mockImplementation(
      () => new Promise((_, reject) => rejects.push(reject))
    );
    const { panel } = await open(
      [row('first', 5), row('second', 10), row('third', 15)],
      save
    );
    removeButtons(panel)[0].click();
    removeButtons(panel)[0].click();
    expect(messages(panel)).toEqual(['third']);
    rejects.forEach(reject => reject(new Error('the lab refused')));
    await new Promise(resolve => setTimeout(resolve));
    expect(messages(panel)).toEqual(['first', 'second', 'third']);
    panel.dispose();
  });

  it('keeps a text selection when the keys are assigned again, and redraws on other keys', async () => {
    const rows = [row('first', 5), row('second', 10)];
    const { panel } = await open(rows);
    const selection = document.getSelection()!;
    selection.selectAllChildren(
      panel.node.querySelector('.jp-MotdPanel-message')!
    );
    panel.clearedNotifications = [];
    expect(selection.toString()).toBe('first');
    panel.clearedNotifications = [notificationKey(rows[0])];
    expect(messages(panel)).toEqual(['second']);
    selection.removeAllRanges();
    panel.dispose();
  });

  it('saves the key of each quick press and keeps both rows out while the saves wait', async () => {
    const rows = [row('first', 5), row('second', 10), row('third', 15)];
    // a save that has not answered when the second press comes
    const save = saved();
    save.mockReturnValue(new Promise(() => undefined));
    const { panel } = await open(rows, save);
    removeButtons(panel)[0].click();
    removeButtons(panel)[0].click();
    expect(messages(panel)).toEqual(['third']);
    expect(save.mock.calls).toEqual([
      [[notificationKey(rows[0])]],
      [[notificationKey(rows[1])]]
    ]);
    // the read before a save assigns the stored list, which does not hold these keys yet
    panel.clearedNotifications = ['a key saved in another page'];
    expect(messages(panel)).toEqual(['third']);
    panel.dispose();
  });
});

describe('MotdPanel focus on the column buttons (ACC-VIEW-94-CLEAR-ALL)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('Remove on the first of two rows moves the focus to the next Remove', async () => {
    const rows = [row('first', 5), row('second', 10)];
    const { panel } = await open(rows);
    const [first] = removeButtons(panel);
    first.focus();
    first.click();
    const [next] = removeButtons(panel);
    expect(next.dataset.key).toBe(notificationKey(rows[1]));
    expect(document.activeElement).toBe(next);
    panel.dispose();
  });

  it('Remove on the last row moves the focus to the Remove of the row now last', async () => {
    const rows = [row('first', 5), row('second', 10)];
    const { panel } = await open(rows);
    const last = removeButtons(panel)[1];
    last.focus();
    last.click();
    const [next] = removeButtons(panel);
    expect(next.dataset.key).toBe(notificationKey(rows[0]));
    expect(document.activeElement).toBe(next);
    panel.dispose();
  });

  it('Remove on the only row moves the focus to the entries column', async () => {
    const { panel } = await open([row('only', 5)]);
    const [remove] = removeButtons(panel);
    remove.focus();
    remove.click();
    expect(document.activeElement).toBe(entriesColumn(panel));
    panel.dispose();
  });

  it('Clear moves the focus to the entries column', async () => {
    const { panel } = await open([row('first', 5), row('second', 10)]);
    const clear = clearButton(panel)!;
    clear.focus();
    clear.click();
    expect(document.activeElement).toBe(entriesColumn(panel));
    panel.dispose();
  });

  it('a minute redraw keeps the focus on the same Remove', async () => {
    const rows = [row('first', 5), row('second', 10)];
    const { panel } = await open(rows);
    const before = removeButtons(panel)[1];
    before.focus();
    jest.advanceTimersByTime(60_000);
    const after = removeButtons(panel)[1];
    expect(after).not.toBe(before);
    expect(after.dataset.key).toBe(notificationKey(rows[1]));
    expect(document.activeElement).toBe(after);
    panel.dispose();
  });

  it('a minute redraw keeps the focus on Clear', async () => {
    const { panel } = await open([row('first', 5)]);
    const before = clearButton(panel)!;
    before.focus();
    jest.advanceTimersByTime(60_000);
    expect(clearButton(panel)).not.toBe(before);
    expect(document.activeElement).toBe(clearButton(panel));
    panel.dispose();
  });

  it('with a new row at the top after a pull, the focus stays on the same row', async () => {
    const rows = [row('first', 5), row('second', 10)];
    const { panel, feed, pull } = await open(rows);
    removeButtons(panel)[0].focus();
    feed.rows = [row('newest', 1), ...rows];
    await pull();
    const [, same] = removeButtons(panel);
    expect(same.dataset.key).toBe(notificationKey(rows[0]));
    expect(document.activeElement).toBe(same);
    panel.dispose();
  });

  it('leaves the focus on the column itself', async () => {
    const { panel } = await open([row('first', 5)]);
    const column = panel.node.querySelector<HTMLElement>(
      '.jp-MotdPanel-notifications'
    )!;
    column.focus();
    jest.advanceTimersByTime(60_000);
    expect(document.activeElement).toBe(column);
    panel.dispose();
  });
});
