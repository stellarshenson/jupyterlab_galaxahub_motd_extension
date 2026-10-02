import { Time } from '@jupyterlab/coreutils';

import { IRenderMime, IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { TranslationBundle, nullTranslator } from '@jupyterlab/translation';

import { LabIcon } from '@jupyterlab/ui-components';

import { Message } from '@lumino/messaging';

import { Widget } from '@lumino/widgets';

import { fitFrame } from './fit';

import {
  DEFAULT_SETTINGS,
  MotdModel,
  NotificationWindow,
  RichEntry,
  notificationView
} from './model';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CIRCLE = 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0';

/**
 * The path data of each notification type's icon, on a 24 by 24 grid.
 */
const TYPE_ICONS: Record<string, string[]> = {
  info: [CIRCLE, 'M12 11v5', 'M12 8h.01'],
  success: [CIRCLE, 'm8 12 3 3 5-6'],
  warning: ['M12 3 2 21h20L12 3z', 'M12 10v5', 'M12 18h.01'],
  error: [CIRCLE, 'm9 9 6 6M15 9l-6 6'],
  'in-progress': [CIRCLE, 'M12 7v5l3 2'],
  default: ['M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z', 'M10 21h4']
};

/**
 * The tab's icon, the info icon of a notification row. The lab's jp-icon-brand1 class gives the
 * stroke the brand colour, which is blue in the stock and the Galaxa themes.
 */
export const motdIcon = new LabIcon({
  name: 'jupyterlab_galaxahub_motd_extension:tab',
  svgstr:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" viewBox="0 0 24 24" fill="none">' +
    '<g class="jp-icon-brand1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    TYPE_ICONS.info.map(d => `<path d="${d}"/>`).join('') +
    '</g></svg>'
});

/**
 * The words a screen reader says for each type; the default type has none.
 */
const TYPE_LABELS: Record<string, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  'in-progress': 'In progress'
};

const GROUP_ICON = [
  'M5.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
  'M2.5 20a6.5 6.5 0 0 1 13 0',
  'M16 4.5a3.5 3.5 0 0 1 0 7',
  'M18 14.5a6.5 6.5 0 0 1 3.5 5.5'
];

/**
 * A static line icon drawn in the text colour; its size comes from the stylesheet.
 */
function icon(paths: string[], className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * The heading of a markdown entry that the link `href` (`#fragment`) names. The lab's renderer
 * gives a heading its text with a hyphen for each space as its id; a link written the GitHub
 * way names that id in lower case and without punctuation.
 */
function headingOf(body: HTMLElement, href: string): HTMLElement | undefined {
  // the renderer writes a letter outside ASCII as escapes and leaves a % as it is, so each run
  // of escapes is decoded by itself: the % of the heading 'Résumé 100%' starts no escape
  const fragment = href.slice(1).replace(/(%[0-9a-f]{2})+/gi, run => {
    try {
      return decodeURIComponent(run);
    } catch {
      // a % and two hex digits of a heading that are no escape, as in '100%ab': read as written
      return run;
    }
  });
  const headings = Array.from(
    body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  );
  const id = (heading: HTMLElement) => heading.dataset.jupyterId ?? heading.id;
  const github = (text: string) =>
    text.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '');
  return (
    headings.find(heading => id(heading) === fragment) ??
    headings.find(heading => github(id(heading)) === fragment.toLowerCase())
  );
}

/**
 * The Message of the day tab: the rich entries as cards in the left column, the Notifications
 * section in the right column. It draws whatever the model holds after each pull, and while it
 * is open it pulls again every `pollMinutes`.
 */
export class MotdPanel extends Widget {
  constructor(
    model: MotdModel,
    rendermime: IRenderMimeRegistry,
    trans: TranslationBundle = nullTranslator.load(
      'jupyterlab_galaxahub_motd_extension'
    )
  ) {
    super();
    this._model = model;
    this._rendermime = rendermime;
    this._trans = trans;
    this.id = 'galaxahub-motd';
    this.title.label = trans.__('Message of the day');
    this.title.icon = motdIcon;
    this.title.closable = true;
    this.addClass('jp-MotdPanel');
    // the shell's current widget follows focus, so the panel must be able to take it
    this.node.tabIndex = -1;
    // the columns stay across renders
    this._entries.className = 'jp-MotdPanel-entries';
    this._notifications.className = 'jp-MotdPanel-notifications';
    // each column scrolls on its own, so the page keys need the focus in one of them;
    // 0 keeps both in the Tab order
    this._entries.tabIndex = 0;
    this._notifications.tabIndex = 0;
    // the element that scrolls a stacked tab: the stylesheet cannot give the tab itself a rule
    // by the tab's width
    const columns = document.createElement('div');
    columns.className = 'jp-MotdPanel-columns';
    columns.append(this._entries, this._notifications);
    this.node.appendChild(columns);
    model.changed.connect(() => void this.render(), this);
  }

  /**
   * Whether the scripts of an html page run, c.GalaxaHubMotd.html_allow_scripts; read when the
   * cards are drawn.
   */
  htmlAllowScripts = false;

  /**
   * Whether the tab has its Notifications column, which it has while the lab config names a
   * notifications URL; without the column the cards take the full width.
   */
  set notifications(shown: boolean) {
    this.toggleClass('jp-mod-noNotifications', !shown);
  }

  /**
   * Minutes between pulls while the tab is open; 0 never polls.
   */
  set pollMinutes(minutes: number) {
    this._pollMinutes = minutes;
    this._arm();
  }

  /**
   * How far back the Notifications column lists broadcasts; a change redraws the column.
   */
  set notificationWindow(span: NotificationWindow) {
    this._notificationWindow = span;
    this._notifications.replaceChildren(...this._notificationsContent());
  }

  /**
   * Draw the model: the cards when the entries changed, the Notifications column every time.
   * A render that finishes after a newer one started is dropped.
   */
  async render(): Promise<void> {
    const token = ++this._renderToken;
    const rows = this._model.rich.rows;
    // a 304, a 204 and a failed pull keep the rows, so the cards stay: the html frames keep
    // their pages and the column its scroll position
    if (rows !== this._drawnRows) {
      const renderers: IRenderMime.IRenderer[] = [];
      const cards = document.createDocumentFragment();
      for (const entry of rows) {
        cards.appendChild(await this._entrySection(entry, renderers));
      }
      if (token !== this._renderToken) {
        renderers.forEach(r => r.dispose());
        return;
      }
      this._renderers.forEach(r => r.dispose());
      this._renderers = renderers;
      // the old frames leave with their cards; each new frame joins the observer on load
      this._frameObserver.disconnect();
      // a tab activated before its first cards were drawn gave the focus to Notifications, or
      // to the tab itself in a lab with no Notifications column
      const refocus =
        !this._entries.childElementCount &&
        document.activeElement === this._besideEntries;
      // an empty entries column is hidden and the Notifications column takes the full width
      this._entries.replaceChildren(cards);
      this._drawnRows = rows;
      if (refocus) {
        this._focusColumn();
      }
    }
    this._notifications.replaceChildren(...this._notificationsContent());
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    window.clearInterval(this._timer);
    this._renderers.forEach(r => r.dispose());
    this._frameObserver.disconnect();
    super.dispose();
  }

  protected onActivateRequest(msg: Message): void {
    this._focusColumn();
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this._arm();
  }

  protected onBeforeDetach(msg: Message): void {
    window.clearInterval(this._timer);
    this._timer = 0;
    super.onBeforeDetach(msg);
  }

  /**
   * What takes the focus while the entries column is empty: the Notifications column, or the
   * tab itself in a lab with no Notifications column.
   */
  private get _besideEntries(): HTMLElement {
    return this.hasClass('jp-mod-noNotifications')
      ? this.node
      : this._notifications;
  }

  /**
   * Focus the column the page keys should scroll: the entries, or Notifications when there are
   * none, since an empty entries column is hidden and cannot take the focus. A stacked tab keeps
   * its scroll position.
   */
  private _focusColumn(): void {
    (this._entries.childElementCount
      ? this._entries
      : this._besideEntries
    ).focus({ preventScroll: true });
  }

  private _arm(): void {
    window.clearInterval(this._timer);
    this._timer = 0;
    if (this.isAttached && this._pollMinutes > 0) {
      this._timer = window.setInterval(
        () => void this._model.pull(),
        this._pollMinutes * 60_000
      );
    }
  }

  private async _entrySection(
    entry: RichEntry,
    renderers: IRenderMime.IRenderer[]
  ): Promise<HTMLElement> {
    const section = document.createElement('section');
    section.className = 'jp-MotdPanel-section';
    section.dataset.label = entry.label;
    section.dataset.kind = entry.kind;
    // an entry with no label has no header strip
    if (entry.label) {
      const strip = document.createElement('header');
      strip.className = 'jp-MotdPanel-strip';
      strip.append(
        icon(GROUP_ICON, 'jp-MotdPanel-groupIcon'),
        this._heading(entry.label)
      );
      if (entry.kind === 'html') {
        const kind = document.createElement('span');
        kind.className = 'jp-MotdPanel-kind';
        kind.textContent = this._trans.__('- HTML page');
        strip.appendChild(kind);
      }
      section.appendChild(strip);
    }
    if (entry.kind === 'markdown') {
      // the lab's own markdown renderer, sanitised as untrusted content
      const renderer = this._rendermime.createRenderer('text/markdown');
      renderers.push(renderer);
      renderer.addClass('jp-MotdPanel-body');
      await renderer.renderModel(
        this._rendermime.createModel({
          data: { 'text/markdown': entry.body },
          trusted: false
        })
      );
      // a link to a heading of this entry scrolls to that heading. The lab's renderer does this
      // only with a url resolver, and the lab's registry has none: such a link has
      // target=_blank and no handler, so a click opened the lab's address in another window
      renderer.node.addEventListener('click', event => {
        const href = (event.target as Element)
          .closest('a')
          ?.getAttribute('href');
        if (href?.startsWith('#')) {
          event.preventDefault();
          headingOf(renderer.node, href)?.scrollIntoView();
        }
      });
      section.appendChild(renderer.node);
    } else {
      // allow-same-origin keeps the hub cookie on the page's own files; allow-popups opens a
      // target=_blank link in a browser tab outside the sandbox; allow-scripts, with
      // htmlAllowScripts on, runs the page's scripts, which on the lab's origin have the access
      // of the lab page itself
      const frame = document.createElement('iframe');
      frame.className = 'jp-MotdPanel-frame';
      const sandbox =
        'allow-same-origin allow-popups allow-popups-to-escape-sandbox';
      frame.setAttribute(
        'sandbox',
        this.htmlAllowScripts ? `${sandbox} allow-scripts` : sandbox
      );
      // with no label the page's url tells the frames apart for a screen reader
      frame.title = `Message of the day - ${entry.label || entry.url}`;
      frame.src = entry.url;
      // the observer reports the page root and the frame on load and on every size change
      // after it, so the frame follows a page that changes its height, a tab width change and a
      // tab shown after a hidden load. The frame is observed too, because a page's scrollbar
      // can take up a change of the frame's width and leave the root's size as it was; a page
      // on another origin cannot be read and keeps the 480 px box
      frame.addEventListener('load', () => {
        const root = frame.contentDocument?.documentElement;
        if (root) {
          this._frameObserver.observe(root);
          this._frameObserver.observe(frame);
        }
      });
      section.appendChild(frame);
    }
    return section;
  }

  private _notificationsContent(): HTMLElement[] {
    const title = document.createElement('div');
    title.className = 'jp-MotdPanel-title';
    title.appendChild(this._heading(this._trans.__('Notifications')));
    const rows = notificationView(
      this._model.notifications.rows,
      this._notificationWindow
    );
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'jp-MotdPanel-empty';
      empty.textContent = this._trans.__('No notifications');
      return [title, empty];
    }
    const count = document.createElement('span');
    count.className = 'jp-MotdPanel-count';
    count.textContent = String(rows.length);
    title.appendChild(count);
    const list = document.createElement('ul');
    list.className = 'jp-MotdPanel-list';
    for (const row of rows) {
      const item = document.createElement('li');
      item.className = 'jp-MotdPanel-row';
      item.dataset.type = row.type;
      const text = document.createElement('div');
      text.className = 'jp-MotdPanel-text';
      const message = document.createElement('div');
      message.className = 'jp-MotdPanel-message';
      message.textContent = row.message;
      const meta = document.createElement('div');
      meta.className = 'jp-MotdPanel-meta';
      const audience = document.createElement('span');
      audience.className = 'jp-MotdPanel-audience';
      audience.textContent = row.audienceLabel;
      const time = document.createElement('time');
      time.className = 'jp-MotdPanel-time';
      time.dateTime = row.ts;
      const sent = Date.parse(row.ts);
      if (!Number.isNaN(sent)) {
        // formatHuman reads any moment ahead of the browser clock as "next year", and the
        // hub's clock can run seconds ahead; a row is never newer than now
        time.textContent = Time.formatHuman(
          new Date(Math.min(sent, Date.now()))
        );
        time.title = Time.format(row.ts);
      }
      meta.append(audience, time);
      text.append(message, meta);
      // the icon's colour and the card's tint are the type's lab variable, set in the
      // stylesheet by data-type
      item.appendChild(icon(TYPE_ICONS[row.type], 'jp-MotdPanel-icon'));
      // the icon is hidden from screen readers, so the type is also written out
      if (TYPE_LABELS[row.type]) {
        const label = document.createElement('span');
        label.className = 'jp-MotdPanel-typeLabel';
        label.textContent = TYPE_LABELS[row.type];
        item.appendChild(label);
      }
      item.appendChild(text);
      list.appendChild(item);
    }
    return [title, list];
  }

  private _heading(text: string): HTMLElement {
    const heading = document.createElement('h2');
    heading.className = 'jp-MotdPanel-heading';
    heading.textContent = text;
    return heading;
  }

  private _model: MotdModel;
  private _rendermime: IRenderMimeRegistry;
  private _trans: TranslationBundle;
  private _entries = document.createElement('div');
  private _notifications = document.createElement('aside');
  private _renderers: IRenderMime.IRenderer[] = [];
  private _drawnRows: RichEntry[] | null = null;
  // one observer for every html entry frame and its page root
  private _frameObserver = new ResizeObserver(() =>
    this._entries
      .querySelectorAll<HTMLIFrameElement>('.jp-MotdPanel-frame')
      .forEach(fitFrame)
  );
  private _renderToken = 0;
  private _pollMinutes = 0;
  private _notificationWindow: NotificationWindow =
    DEFAULT_SETTINGS.notificationWindow;
  private _timer = 0;
}
