/**
 * The panel's drawing of the model and its polling (ACC-VIEW-6 to 11, ACC-CONFIG-28).
 */
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { MessageLoop } from '@lumino/messaging';

import { Widget } from '@lumino/widgets';

import { INotificationRow, MotdModel, RichEntry } from '../model';
import { MotdPanel } from '../panel';
import { Feed, IAnswer } from '../request';

/**
 * An ISO timestamp this many minutes before now; negative is in the future.
 */
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/**
 * A rendermime stand-in recording what it was asked to render.
 */
function fakeRendermime() {
  const rendered: { mime: string; source: unknown; trusted: boolean }[] = [];
  const registry = {
    createModel: (options: any) => options,
    createRenderer: (mime: string) => {
      const widget = new Widget();
      (widget as any).renderModel = async (model: any) => {
        rendered.push({
          mime,
          source: model.data['text/markdown'],
          trusted: model.trusted
        });
        widget.node.textContent = `rendered: ${model.data['text/markdown']}`;
      };
      return widget;
    }
  };
  return { registry: registry as unknown as IRenderMimeRegistry, rendered };
}

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

describe('MotdPanel drawing', () => {
  const entries: RichEntry[] = [
    {
      group: 'analysts',
      kind: 'markdown',
      body: '# Welcome to the analysts lab'
    },
    {
      group: 'everyone',
      kind: 'html',
      url: '/hub/api/extensions/motd/rich/p1/index.html'
    }
  ];
  const rows: INotificationRow[] = [
    {
      ts: ago(24 * 60),
      message: 'older',
      type: 'info',
      audience: 'all'
    },
    {
      ts: ago(5),
      message: 'newer',
      type: 'warning',
      audience: 'direct'
    }
  ];

  it('draws one section per entry in hub order, then Notifications', async () => {
    const { model } = modelAnswering(entries, rows);
    const { registry, rendered } = fakeRendermime();
    await model.pull();
    const panel = new MotdPanel(model, registry);
    await panel.render();

    const headings = Array.from(
      panel.node.querySelectorAll('.jp-MotdPanel-heading')
    ).map(h => h.textContent);
    expect(headings).toEqual(['analysts', 'everyone', 'Notifications']);
    expect(rendered).toEqual([
      {
        mime: 'text/markdown',
        source: '# Welcome to the analysts lab',
        trusted: false
      }
    ]);
    panel.dispose();
  });

  it('shows an html entry in a sandboxed iframe at the hub url', async () => {
    const { model } = modelAnswering(entries, []);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    const frame = panel.node.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe(
      '/hub/api/extensions/motd/rich/p1/index.html'
    );
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
    panel.dispose();
  });

  it('lists notifications newest first with type class, time and audience', async () => {
    const { model } = modelAnswering([], rows);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    const items = Array.from(panel.node.querySelectorAll('.jp-MotdPanel-row'));
    expect(
      items.map(i => i.querySelector('.jp-MotdPanel-message')!.textContent)
    ).toEqual(['newer', 'older']);
    expect(items[0].classList.contains('jp-Notification-Toast-warning')).toBe(
      true
    );
    expect(items[0].querySelector('.jp-MotdPanel-audience')!.textContent).toBe(
      'Direct'
    );
    expect(items[1].querySelector('.jp-MotdPanel-audience')!.textContent).toBe(
      'All users'
    );
    expect(items[0].querySelector('time')!.textContent).toBe('5 minutes ago');
    panel.dispose();
  });

  it('never shows a time ahead of the browser clock as the future', async () => {
    const ahead: INotificationRow = { ...rows[1], ts: ago(-0.5) };
    const { model } = modelAnswering([], [ahead]);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();
    expect(panel.node.querySelector('time')!.textContent).toBe('now');
    panel.dispose();
  });

  it('says so when there are no notifications', async () => {
    const { model } = modelAnswering(entries.slice(0, 1), []);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();
    expect(panel.node.querySelector('.jp-MotdPanel-empty')!.textContent).toBe(
      'No notifications'
    );
    panel.dispose();
  });
});

describe('MotdPanel activation', () => {
  it('takes the focus when activated, so the shell makes it the current widget', () => {
    const { model } = modelAnswering([], []);
    const panel = new MotdPanel(model, fakeRendermime().registry);
    Widget.attach(panel, document.body);
    MessageLoop.sendMessage(panel, Widget.Msg.ActivateRequest);
    expect(document.activeElement).toBe(panel.node);
    panel.dispose();
  });
});

describe('MotdPanel polling', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pulls every pollMinutes while open and stops when closed', () => {
    const { model, calls } = modelAnswering([], []);
    const panel = new MotdPanel(model, fakeRendermime().registry);
    Widget.attach(panel, document.body);
    panel.pollMinutes = 2;

    jest.advanceTimersByTime(2 * 60_000);
    expect(calls).toEqual(['rich', 'notifications']);
    jest.advanceTimersByTime(2 * 60_000);
    expect(calls).toHaveLength(4);

    Widget.detach(panel);
    jest.advanceTimersByTime(10 * 60_000);
    expect(calls).toHaveLength(4);
    panel.dispose();
  });

  it('never polls with pollMinutes 0', () => {
    const { model, calls } = modelAnswering([], []);
    const panel = new MotdPanel(model, fakeRendermime().registry);
    Widget.attach(panel, document.body);
    panel.pollMinutes = 0;
    jest.advanceTimersByTime(60 * 60_000);
    expect(calls).toEqual([]);
    panel.dispose();
  });

  it('does not poll a closed tab, and starts when it opens', () => {
    const { model, calls } = modelAnswering([], []);
    const panel = new MotdPanel(model, fakeRendermime().registry);
    panel.pollMinutes = 1;
    jest.advanceTimersByTime(5 * 60_000);
    expect(calls).toEqual([]);
    Widget.attach(panel, document.body);
    jest.advanceTimersByTime(60_000);
    expect(calls).toEqual(['rich', 'notifications']);
    panel.dispose();
  });
});
