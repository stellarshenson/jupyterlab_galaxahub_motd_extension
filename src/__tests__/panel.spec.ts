/**
 * The panel's drawing of the model and its polling (ACC-VIEW-6 to 11, ACC-CONFIG-28,
 * ACC-LAYOUT-32, 33, 35 and 36).
 */
import * as fs from 'fs';
import * as path from 'path';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { MessageLoop } from '@lumino/messaging';

import { Widget } from '@lumino/widgets';

import { INotificationRow, MotdModel, RichEntry } from '../model';
import { MotdPanel, motdIcon } from '../panel';
import { Feed, IAnswer } from '../request';

/**
 * An ISO timestamp this many minutes before now; negative is in the future.
 */
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const CSS = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'style', 'base.css'),
  'utf-8'
);

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
      label: 'analysts',
      kind: 'markdown',
      body: '# Welcome to the analysts lab'
    },
    {
      label: 'interns',
      kind: 'html',
      url: '/hub/api/extensions/motd/rich/p1/index.html'
    }
  ];
  const rows: INotificationRow[] = [
    {
      ts: ago(23 * 60),
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
    expect(headings).toEqual(['analysts', 'interns', 'Notifications']);
    expect(rendered).toEqual([
      {
        mime: 'text/markdown',
        source: '# Welcome to the analysts lab',
        trusted: false
      }
    ]);
    panel.dispose();
  });

  it('draws each entry as a card: a header strip with its group, then the content', async () => {
    const { model } = modelAnswering(entries, []);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    const cards = Array.from(
      panel.node.querySelectorAll(
        '.jp-MotdPanel-entries > .jp-MotdPanel-section'
      )
    );
    expect(cards).toHaveLength(2);
    cards.forEach((card, i) => {
      expect(card.children).toHaveLength(2);
      const strip = card.children[0];
      expect(strip.className).toBe('jp-MotdPanel-strip');
      expect(strip.firstElementChild!.getAttribute('class')).toBe(
        'jp-MotdPanel-groupIcon'
      );
      expect(strip.textContent!.startsWith(entries[i].label)).toBe(true);
    });
    const [markdown, html] = cards.map(card => card.children[1]);
    expect(markdown.classList.contains('jp-MotdPanel-body')).toBe(true);
    expect(markdown.textContent).toBe(
      'rendered: # Welcome to the analysts lab'
    );
    expect(html.tagName).toBe('IFRAME');
    panel.dispose();
  });

  it('draws an entry with no label as a card without the header strip', async () => {
    const { model } = modelAnswering(
      [
        { label: '', kind: 'markdown', body: 'Welcome' },
        { label: '', kind: 'html', url: '/pkg-1/index.html' }
      ],
      []
    );
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    const cards = Array.from(
      panel.node.querySelectorAll(
        '.jp-MotdPanel-entries > .jp-MotdPanel-section'
      )
    );
    expect(cards).toHaveLength(2);
    expect(panel.node.querySelector('.jp-MotdPanel-strip')).toBeNull();
    const [markdown, html] = cards.map(card => {
      expect(card.children).toHaveLength(1);
      return card.children[0];
    });
    expect(markdown.textContent).toBe('rendered: Welcome');
    expect(html.tagName).toBe('IFRAME');
    expect(html.getAttribute('title')).toBe(
      'Message of the day - /pkg-1/index.html'
    );
    panel.dispose();
  });

  it('labels an html entry HTML page after its group, a markdown entry not', async () => {
    const { model } = modelAnswering(entries, []);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    const strips = Array.from(
      panel.node.querySelectorAll('.jp-MotdPanel-strip')
    );
    expect(strips.map(s => s.textContent)).toEqual([
      'analysts',
      'interns- HTML page'
    ]);
    expect(strips[1].lastElementChild!.className).toBe('jp-MotdPanel-kind');
    expect(strips[0].querySelector('.jp-MotdPanel-kind')).toBeNull();
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
    expect(frame.getAttribute('sandbox')).toBe(
      'allow-same-origin allow-popups allow-popups-to-escape-sandbox'
    );
    panel.dispose();
  });

  it('adds allow-scripts to the frame sandbox with htmlAllowScripts on (ACC-SERVER-76)', async () => {
    const { model } = modelAnswering(entries, []);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    panel.htmlAllowScripts = true;
    await panel.render();

    expect(panel.node.querySelector('iframe')!.getAttribute('sandbox')).toBe(
      'allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts'
    );
    panel.dispose();
  });

  it('carries jp-mod-noNotifications while the lab names no notifications URL (ACC-LAYOUT-77)', () => {
    const { model } = modelAnswering(entries, []);
    const panel = new MotdPanel(model, fakeRendermime().registry);
    expect(panel.hasClass('jp-mod-noNotifications')).toBe(false);
    panel.notifications = false;
    expect(panel.hasClass('jp-mod-noNotifications')).toBe(true);
    panel.notifications = true;
    expect(panel.hasClass('jp-mod-noNotifications')).toBe(false);
    panel.dispose();
  });

  it('shows the note bubble icon in its tab (ACC-VIEW-80)', () => {
    const { model } = modelAnswering([], []);
    const panel = new MotdPanel(model, fakeRendermime().registry);
    expect(panel.title.icon).toBe(motdIcon);
    // lines in the tab's text colour: the lab's jp-icon3 class on a stroked group, no fill
    expect(motdIcon.svgstr).toContain('<g class="jp-icon3" stroke=');
    expect(motdIcon.svgstr).toContain('fill="none"');
    panel.dispose();
  });

  it('holds both columns in the element that scrolls a stacked tab (ACC-LAYOUT-38)', () => {
    const { model } = modelAnswering([], []);
    const panel = new MotdPanel(model, fakeRendermime().registry);
    const columns = panel.node.firstElementChild!;
    expect(columns.className).toBe('jp-MotdPanel-columns');
    expect(Array.from(columns.children).map(el => el.className)).toEqual([
      'jp-MotdPanel-entries',
      'jp-MotdPanel-notifications'
    ]);
    panel.dispose();
  });

  it('lists notifications newest first with time and audience', async () => {
    const { model } = modelAnswering([], rows);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    const items = Array.from(panel.node.querySelectorAll('.jp-MotdPanel-row'));
    expect(
      items.map(i => i.querySelector('.jp-MotdPanel-message')!.textContent)
    ).toEqual(['newer', 'older']);
    expect(items[0].querySelector('.jp-MotdPanel-audience')!.textContent).toBe(
      'Direct'
    );
    expect(items[1].querySelector('.jp-MotdPanel-audience')!.textContent).toBe(
      'All users'
    );
    expect(items[0].querySelector('time')!.textContent).toBe('5 minutes ago');
    panel.dispose();
  });

  it('redraws Notifications for a new notificationWindow', async () => {
    const { model } = modelAnswering(
      [],
      [...rows, { ...rows[0], ts: ago(3 * 24 * 60 - 1), message: 'three days' }]
    );
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();
    const messages = () =>
      Array.from(panel.node.querySelectorAll('.jp-MotdPanel-message')).map(
        m => m.textContent
      );
    expect(messages()).toEqual(['newer', 'older']);
    panel.notificationWindow = '3d';
    expect(messages()).toEqual(['newer', 'older', 'three days']);
    panel.dispose();
  });

  it('starts each row with the icon of its type, coloured by the lab variable of the type', async () => {
    const variables: Record<string, string> = {
      info: '--jp-info-color1',
      success: '--jp-success-color1',
      warning: '--jp-warn-color1',
      error: '--jp-error-color1',
      'in-progress': '--jp-brand-color1',
      default: '--jp-ui-font-color2'
    };
    const types = Object.keys(variables);
    const { model } = modelAnswering(
      [],
      types.map((type, i) => ({
        ts: ago(i),
        message: type,
        type,
        audience: 'all'
      }))
    );
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    const items = Array.from(
      panel.node.querySelectorAll<HTMLElement>('.jp-MotdPanel-row')
    );
    expect(items.map(i => i.dataset.type)).toEqual(types);
    const icons = items.map(item => {
      const icon = item.firstElementChild!;
      expect(icon.tagName).toBe('svg');
      expect(icon.getAttribute('class')).toBe('jp-MotdPanel-icon');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      // the stylesheet gives the row the lab colour of its data-type, for the icon and the
      // card's tint
      const rule = CSS.match(
        new RegExp(
          `\\.jp-MotdPanel-row\\[data-type='${item.dataset.type}'\\] \\{\\s*--jp-private-motd-tone: var\\((--[\\w-]+)\\);`
        )
      );
      expect(rule?.[1]).toBe(variables[item.dataset.type!]);
      return icon.innerHTML;
    });
    // one icon of its own per type
    expect(new Set(icons).size).toBe(types.length);
    panel.dispose();
  });

  it('names the type of each row for screen readers, except the default type', async () => {
    const labels: Record<string, string | undefined> = {
      info: 'Info',
      success: 'Success',
      warning: 'Warning',
      error: 'Error',
      'in-progress': 'In progress',
      default: undefined
    };
    const { model } = modelAnswering(
      [],
      Object.keys(labels).map((type, i) => ({
        ts: ago(i),
        message: type,
        type,
        audience: 'all'
      }))
    );
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    for (const item of Array.from(
      panel.node.querySelectorAll<HTMLElement>('.jp-MotdPanel-row')
    )) {
      const label = item.querySelector('.jp-MotdPanel-typeLabel');
      expect(label?.textContent).toBe(labels[item.dataset.type!]);
    }
    // drawn off-screen, not display: none, so screen readers still read it
    expect(CSS).toMatch(
      /\.jp-MotdPanel-typeLabel \{[^}]*position: absolute;[^}]*clip-path: inset\(50%\);/
    );
    panel.dispose();
  });

  it('shows the row count in a pill beside the Notifications heading', async () => {
    const four = [1, 2, 3, 4].map(minutes => ({
      ...rows[0],
      ts: ago(minutes)
    }));
    const { model } = modelAnswering([], four);
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();

    const title = panel.node.querySelector('.jp-MotdPanel-title')!;
    expect(title.children[0].textContent).toBe('Notifications');
    expect(title.children[1].className).toBe('jp-MotdPanel-count');
    expect(title.children[1].textContent).toBe('4');
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
    expect(panel.node.querySelector('.jp-MotdPanel-count')).toBeNull();
    panel.dispose();
  });
});

describe('MotdPanel html page frames', () => {
  it('watches the frame pages with one resize observer, connected on load and disconnected on re-render and dispose', async () => {
    // jsdom has no layout, so the fitting itself is proven in Galata; this is its wiring
    const observers: RecordingObserver[] = [];
    class RecordingObserver {
      observed: Element[] = [];
      disconnects = 0;
      constructor() {
        observers.push(this);
      }
      observe(target: Element) {
        this.observed.push(target);
      }
      unobserve() {
        // not used by the panel
      }
      disconnect() {
        this.disconnects++;
      }
    }
    const shim = window.ResizeObserver;
    window.ResizeObserver =
      RecordingObserver as unknown as typeof ResizeObserver;
    try {
      const { model } = modelAnswering(
        [{ label: 'interns', kind: 'html', url: '/pkg-1/index.html' }],
        []
      );
      await model.pull();
      const panel = new MotdPanel(model, fakeRendermime().registry);
      Widget.attach(panel, document.body);
      await panel.render();
      expect(observers).toHaveLength(1);
      const [observer] = observers;

      // jsdom loads no frame page, so the test hands the frame one
      const frame = panel.node.querySelector('iframe')!;
      const page = document.implementation.createHTMLDocument('package');
      Object.defineProperty(frame, 'contentDocument', { value: page });
      frame.dispatchEvent(new Event('load'));
      expect(observer.observed).toEqual([page.documentElement, frame]);

      // a pull with new rows rebuilds the cards; their frames join on their own load
      const disconnects = observer.disconnects;
      await model.pull();
      await panel.render();
      expect(observer.disconnects).toBe(disconnects + 1);
      panel.dispose();
      expect(observer.disconnects).toBe(disconnects + 2);
      expect(observers).toHaveLength(1);
    } finally {
      window.ResizeObserver = shim;
    }
  });
});

describe('MotdPanel cards across pulls', () => {
  it('keeps the cards and their frames when a pull brings no new entries', async () => {
    const entries: RichEntry[] = [
      { label: 'analysts', kind: 'markdown', body: 'Welcome' },
      { label: 'interns', kind: 'html', url: '/pkg-1/index.html' }
    ];
    // a 304, the proxy's 204 for an unreachable hub, and a failed pull keep the rows
    const rich: IAnswer[] = [
      { status: 200, etag: '"r"', body: { entries } },
      { status: 304, etag: '"r"', body: null },
      { status: 204, etag: null, body: null },
      { status: 500, etag: null, body: null }
    ];
    const model = new MotdModel(async (feed): Promise<IAnswer> =>
      feed === 'rich'
        ? rich.shift()!
        : { status: 200, etag: null, body: { notifications: [] } }
    );
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await model.pull();
    await panel.render();
    const cards = Array.from(
      panel.node.querySelectorAll('.jp-MotdPanel-section')
    );
    expect(cards).toHaveLength(2);

    for (let i = 0; i < 3; i++) {
      await model.pull();
      await panel.render();
      const now = Array.from(
        panel.node.querySelectorAll('.jp-MotdPanel-section')
      );
      expect(now).toHaveLength(2);
      expect(now.every((card, j) => card === cards[j])).toBe(true);
    }
    panel.dispose();
  });
});

describe('MotdPanel activation', () => {
  // each column scrolls on its own, so the focus goes to the column the page keys should
  // scroll; focus inside the tab makes the shell take it as the current widget

  it('focuses the entries column when activated with entries', async () => {
    const { model } = modelAnswering(
      [{ label: 'analysts', kind: 'markdown', body: 'Welcome' }],
      []
    );
    await model.pull();
    const panel = new MotdPanel(model, fakeRendermime().registry);
    await panel.render();
    Widget.attach(panel, document.body);
    MessageLoop.sendMessage(panel, Widget.Msg.ActivateRequest);
    expect(document.activeElement).toBe(
      panel.node.querySelector('.jp-MotdPanel-entries')
    );
    panel.dispose();
  });

  it('focuses the Notifications column when activated without entries', () => {
    const { model } = modelAnswering([], []);
    const panel = new MotdPanel(model, fakeRendermime().registry);
    Widget.attach(panel, document.body);
    MessageLoop.sendMessage(panel, Widget.Msg.ActivateRequest);
    expect(document.activeElement).toBe(
      panel.node.querySelector('.jp-MotdPanel-notifications')
    );
    panel.dispose();
  });

  it('moves the focus to the entries column when the first cards are drawn after activation', async () => {
    const { model } = modelAnswering(
      [{ label: 'analysts', kind: 'markdown', body: 'Welcome' }],
      []
    );
    const panel = new MotdPanel(model, fakeRendermime().registry);
    Widget.attach(panel, document.body);
    MessageLoop.sendMessage(panel, Widget.Msg.ActivateRequest);
    await model.pull();
    await panel.render();
    expect(document.activeElement).toBe(
      panel.node.querySelector('.jp-MotdPanel-entries')
    );
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
