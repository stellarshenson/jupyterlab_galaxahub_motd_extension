import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette, Notification } from '@jupyterlab/apputils';

import { PageConfig } from '@jupyterlab/coreutils';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ITranslator, nullTranslator } from '@jupyterlab/translation';

// eslint-disable-next-line jupyter/prefer-lazy-imports -- activation builds the model at once
import {
  DEFAULT_SETTINGS,
  MotdModel,
  firstLoadOfServerStart,
  isNewBroadcast,
  readSettings,
  silenceLine
} from './model';
// eslint-disable-next-line jupyter/prefer-lazy-imports -- activation builds the tab at once
import { MotdPanel } from './panel';
import { fetchFeed } from './request';

const PLUGIN_ID = 'jupyterlab_galaxahub_motd_extension:plugin';
const COMMAND_OPEN = 'galaxahub-motd:open';

/**
 * Pauses before re-pulling after a lab notification. The hub records a broadcast only once
 * its deliveries to every lab have settled, so the row can trail the toast by seconds.
 */
const BROADCAST_PULL_DELAYS_MS = [1000, 4000, 10000];

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'The GalaxaHub message of the day: the rich motd entries and the broadcasts addressed to the user, in one tab',
  autoStart: true,
  requires: [IRenderMimeRegistry],
  optional: [ICommandPalette, ISettingRegistry, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    rendermime: IRenderMimeRegistry,
    palette: ICommandPalette | null,
    settingRegistry: ISettingRegistry | null,
    translator: ITranslator | null
  ) => {
    console.log(
      'JupyterLab extension jupyterlab_galaxahub_motd_extension is activated!'
    );

    const model = new MotdModel((feed, etag) =>
      fetchFeed(feed, etag, app.serviceManager.serverSettings)
    );
    const trans = (translator ?? nullTranslator).load(
      'jupyterlab_galaxahub_motd_extension'
    );
    const panel = new MotdPanel(model, rendermime, trans);
    // c.GalaxaHubMotd.label and html_allow_scripts, and whether notifications_api_url is set,
    // which the server extension puts in the lab page's config
    panel.title.label =
      PageConfig.getOption('galaxahubMotdLabel') || panel.title.label;
    panel.htmlAllowScripts =
      PageConfig.getOption('galaxahubMotdHtmlAllowScripts') === 'true';
    panel.notifications =
      PageConfig.getOption('galaxahubMotdNotifications') !== 'false';
    let settings = DEFAULT_SETTINGS;

    const open = () => {
      if (!panel.isAttached) {
        app.shell.add(panel, 'main');
      }
      app.shell.activateById(panel.id);
    };

    app.commands.addCommand(COMMAND_OPEN, {
      label: trans.__('Message of the day: Open'),
      caption: trans.__(
        'Pull the Message of the day from the hub again and open its tab'
      ),
      describedBy: { args: { type: 'object', properties: {} } },
      execute: async () => {
        await model.pull();
        if (model.hasContent) {
          open();
        } else {
          console.log(silenceLine(model.rich));
        }
      }
    });
    palette?.addItem({
      command: COMMAND_OPEN,
      category: trans.__('Message of the day')
    });

    // the tab never shows notifications alone: it closes when the rich feed answers with no
    // entry (the local or built-in page the server answers counts as an entry)
    model.changed.connect(() => {
      if (
        panel.isAttached &&
        model.rich.state === 'ok' &&
        !model.rich.rows.length
      ) {
        panel.close();
      }
    });

    // live broadcasts arrive as lab notifications through jupyterlab_notifications_extension;
    // one the hub records for this user as a new row is a broadcast, anything else is not
    Notification.manager.changed.connect((_, change) => {
      if (change.type !== 'added' || !settings.reopenOnBroadcast) {
        return;
      }
      void (async () => {
        const before = model.notifications.rows;
        for (const delay of BROADCAST_PULL_DELAYS_MS) {
          await new Promise(resolve => setTimeout(resolve, delay));
          await model.pull();
          if (
            isNewBroadcast(
              before,
              model.notifications.rows,
              change.notification.message
            )
          ) {
            // opened behind the current tab, so an editor the user types in keeps the keys
            if (model.hasContent && !panel.isAttached) {
              app.shell.add(panel, 'main', { activate: false });
            }
            return;
          }
        }
      })();
    });

    void (async () => {
      if (settingRegistry) {
        try {
          const loaded = await settingRegistry.load(PLUGIN_ID);
          const apply = () => {
            settings = readSettings(loaded.composite);
            panel.pollMinutes = settings.pollMinutes;
            panel.notificationWindow = settings.notificationWindow;
          };
          apply();
          loaded.changed.connect(apply);
        } catch (reason) {
          console.error(
            `Message of the day: settings not loaded, defaults apply - ${reason}`
          );
        }
      }
      await app.restored;
      await model.pull();
      if (!model.hasContent) {
        console.log(silenceLine(model.rich));
        return;
      }
      // the user's openOnStart and the lab's c.GalaxaHubMotd.open_on_start must both be on; the
      // tab then opens once per lab server start, on the first load of the page after it
      if (
        settings.openOnStart &&
        PageConfig.getOption('galaxahubMotdOpenOnStart') !== 'false' &&
        firstLoadOfServerStart(
          `${PLUGIN_ID}:serverStart:${app.serviceManager.serverSettings.baseUrl}`,
          PageConfig.getOption('galaxahubMotdServerStart')
        )
      ) {
        open();
      }
    })();
  }
};

export default plugin;
