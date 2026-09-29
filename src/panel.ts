import { Time } from '@jupyterlab/coreutils';

import { IRenderMime, IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { Message } from '@lumino/messaging';

import { Widget } from '@lumino/widgets';

import { MotdModel, RichEntry, notificationView } from './model';

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
 * Fit an html entry frame to its page: the page root's height plus any content past the root,
 * plus the frame's borders and any horizontal scrollbar; the viewport height is read from the
 * page's scrolling element, which is the root in standards mode and the body in quirks mode. A
 * hidden frame keeps its height. A page that cannot be measured keeps the stylesheet's 480 px
 * box and scrolls inside it: a root as tall as the frame's viewport
 * (html, body { height: 100% }), a root that follows the frame's height (vh units), content past
 * the root that follows the frame's height (positioned against the viewport's bottom) or nothing
 * in flow (only absolute or fixed content).
 */
function fitFrame(frame: HTMLIFrameElement): void {
  const page = frame.contentDocument;
  if (!page?.body || !frame.offsetHeight) {
    return;
  }
  const root = page.documentElement;
  const view = page.scrollingElement ?? root;
  // a new height can move a scrollbar in the tab or the frame and wrap the page again, so it is
  // set until the root is as tall as the viewport, three times at most; a root already as tall
  // is fitted or sized to the frame, and a frame that ends fitted reports no further change
  for (let i = 0; i < 3 && root.offsetHeight !== view.clientHeight; i++) {
    frame.style.height = `${root.offsetHeight + frame.offsetHeight - view.clientHeight}px`;
  }
  // content past the root (a margin on the html element, content positioned or pulled below
  // the body) still scrolls once the root fits; it is added, twice at most, because the page
  // loses its own scrollbar and can wrap wider; only a frame this call or an earlier one fitted
  // gets it, so a root as tall as the 480 px box is left as it is
  const past =
    frame.style.height && root.offsetHeight === view.clientHeight
      ? view.scrollHeight - view.clientHeight
      : 0;
  for (
    let j = 0;
    j < 2 && past && root.offsetHeight + past !== view.clientHeight;
    j++
  ) {
    frame.style.height = `${root.offsetHeight + past + frame.offsetHeight - view.clientHeight}px`;
  }
  if (
    root.offsetHeight + past !== view.clientHeight ||
    view.scrollHeight > view.clientHeight ||
    !page.body.offsetHeight
  ) {
    frame.style.height = '';
  }
}

/**
 * The Message of the day tab: the rich entries as cards in the left column, the Notifications
 * section in the right column. It draws whatever the model holds after each pull, and while it
 * is open it pulls again every `pollMinutes`.
 */
export class MotdPanel extends Widget {
  constructor(model: MotdModel, rendermime: IRenderMimeRegistry) {
    super();
    this._model = model;
    this._rendermime = rendermime;
    this.id = 'galaxahub-motd';
    this.title.label = 'Message of the day';
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
    this.node.append(this._entries, this._notifications);
    model.changed.connect(() => void this.render(), this);
  }

  /**
   * Minutes between pulls while the tab is open; 0 never polls.
   */
  set pollMinutes(minutes: number) {
    this._pollMinutes = minutes;
    this._arm();
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
      // a tab activated before its first cards were drawn gave the focus to Notifications
      const refocus =
        !this._entries.childElementCount &&
        document.activeElement === this._notifications;
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
   * Focus the column the page keys should scroll: the entries, or Notifications when there are
   * none, since an empty entries column is hidden and cannot take the focus. A stacked tab keeps
   * its scroll position.
   */
  private _focusColumn(): void {
    (this._entries.childElementCount
      ? this._entries
      : this._notifications
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
    section.dataset.group = entry.group;
    section.dataset.kind = entry.kind;
    const strip = document.createElement('header');
    strip.className = 'jp-MotdPanel-strip';
    strip.append(
      icon(GROUP_ICON, 'jp-MotdPanel-groupIcon'),
      this._heading(entry.group)
    );
    if (entry.kind === 'html') {
      const kind = document.createElement('span');
      kind.className = 'jp-MotdPanel-kind';
      kind.textContent = '- HTML page';
      strip.appendChild(kind);
    }
    section.appendChild(strip);
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
      section.appendChild(renderer.node);
    } else {
      // the hub serves a package with script-src 'none' and frame-ancestors 'self';
      // allow-same-origin keeps the hub cookie on its own files, and no allow-scripts;
      // allow-popups opens a target=_blank link in a browser tab outside the sandbox
      const frame = document.createElement('iframe');
      frame.className = 'jp-MotdPanel-frame';
      frame.setAttribute(
        'sandbox',
        'allow-same-origin allow-popups allow-popups-to-escape-sandbox'
      );
      frame.title = `Message of the day - ${entry.group}`;
      frame.src = entry.url;
      // the observer reports the page root on load and on every size change after it, so the
      // frame follows a page that changes its height, a tab width change and a tab shown after
      // a hidden load; a page on another origin cannot be read and keeps the 480 px box
      frame.addEventListener('load', () => {
        const root = frame.contentDocument?.documentElement;
        if (root) {
          this._frameObserver.observe(root);
        }
      });
      section.appendChild(frame);
    }
    return section;
  }

  private _notificationsContent(): HTMLElement[] {
    const title = document.createElement('div');
    title.className = 'jp-MotdPanel-title';
    title.appendChild(this._heading('Notifications'));
    const rows = notificationView(this._model.notifications.rows);
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'jp-MotdPanel-empty';
      empty.textContent = 'No notifications';
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
      item.dataset.audience = row.audience;
      const text = document.createElement('div');
      text.className = 'jp-MotdPanel-text';
      const message = document.createElement('div');
      message.className = 'jp-MotdPanel-message';
      message.textContent = row.message;
      const meta = document.createElement('div');
      meta.className = 'jp-MotdPanel-meta';
      const audience = document.createElement('span');
      audience.className = `jp-MotdPanel-audience jp-mod-${row.audience}`;
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
      // the icon's colour is the type's lab variable, set in the stylesheet by data-type
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
  private _entries = document.createElement('div');
  private _notifications = document.createElement('aside');
  private _renderers: IRenderMime.IRenderer[] = [];
  private _drawnRows: RichEntry[] | null = null;
  // one observer for the page roots of every html entry frame
  private _frameObserver = new ResizeObserver(() =>
    this._entries
      .querySelectorAll<HTMLIFrameElement>('.jp-MotdPanel-frame')
      .forEach(fitFrame)
  );
  private _renderToken = 0;
  private _pollMinutes = 0;
  private _timer = 0;
}
