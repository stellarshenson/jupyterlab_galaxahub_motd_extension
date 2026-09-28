import { Time } from '@jupyterlab/coreutils';

import { IRenderMime, IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { Message } from '@lumino/messaging';

import { Widget } from '@lumino/widgets';

import { MotdModel, RichEntry, notificationView } from './model';

/**
 * The Message of the day tab: one section per rich entry, then the Notifications section.
 * It draws whatever the model holds after each pull, and while it is open it pulls again
 * every `pollMinutes`.
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
   * Draw the model. A render that finishes after a newer one started is dropped.
   */
  async render(): Promise<void> {
    const token = ++this._renderToken;
    const renderers: IRenderMime.IRenderer[] = [];
    const content = document.createDocumentFragment();
    for (const entry of this._model.rich.rows) {
      content.appendChild(await this._entrySection(entry, renderers));
    }
    content.appendChild(this._notificationsSection());
    if (token !== this._renderToken) {
      renderers.forEach(r => r.dispose());
      return;
    }
    this._renderers.forEach(r => r.dispose());
    this._renderers = renderers;
    this.node.replaceChildren(content);
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    window.clearInterval(this._timer);
    this._renderers.forEach(r => r.dispose());
    super.dispose();
  }

  protected onActivateRequest(msg: Message): void {
    this.node.focus();
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
    const section = this._section(entry.group);
    section.dataset.group = entry.group;
    section.dataset.kind = entry.kind;
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
      // allow-same-origin keeps the hub cookie on its own files, and no allow-scripts
      const frame = document.createElement('iframe');
      frame.className = 'jp-MotdPanel-frame';
      frame.setAttribute('sandbox', 'allow-same-origin');
      frame.title = `Message of the day - ${entry.group}`;
      frame.src = entry.url;
      frame.addEventListener('load', () => {
        const height = frame.contentDocument?.documentElement.scrollHeight;
        if (height) {
          frame.style.height = `${height}px`;
        }
      });
      section.appendChild(frame);
    }
    return section;
  }

  private _notificationsSection(): HTMLElement {
    const section = this._section('Notifications');
    section.classList.add('jp-MotdPanel-notifications');
    const rows = notificationView(this._model.notifications.rows);
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'jp-MotdPanel-empty';
      empty.textContent = 'No notifications';
      section.appendChild(empty);
      return section;
    }
    const list = document.createElement('ul');
    list.className = 'jp-MotdPanel-list';
    for (const row of rows) {
      const item = document.createElement('li');
      // the lab's own toast look: its type rules apply to Toastify__toast elements only
      item.className =
        `jp-MotdPanel-row Toastify__toast ${row.typeClass}`.trim();
      item.dataset.type = row.type;
      item.dataset.audience = row.audience;
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
      item.append(message, meta);
      list.appendChild(item);
    }
    section.appendChild(list);
    return section;
  }

  private _section(heading: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'jp-MotdPanel-section';
    const title = document.createElement('h2');
    title.className = 'jp-MotdPanel-heading';
    title.textContent = heading;
    section.appendChild(title);
    return section;
  }

  private _model: MotdModel;
  private _rendermime: IRenderMimeRegistry;
  private _renderers: IRenderMime.IRenderer[] = [];
  private _renderToken = 0;
  private _pollMinutes = 0;
  private _timer = 0;
}
