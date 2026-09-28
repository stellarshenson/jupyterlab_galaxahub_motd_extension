import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette, Notification } from '@jupyterlab/apputils';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import {
  DEFAULT_SETTINGS,
  MotdModel,
  isNewBroadcast,
  readSettings,
  silenceLine
} from './model';
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
  optional: [ICommandPalette, ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    rendermime: IRenderMimeRegistry,
    palette: ICommandPalette | null,
    settingRegistry: ISettingRegistry | null
  ) => {
    console.log(
      'JupyterLab extension jupyterlab_galaxahub_motd_extension is activated!'
    );

    const model = new MotdModel((feed, etag) =>
      fetchFeed(feed, etag, app.serviceManager.serverSettings)
    );
    const panel = new MotdPanel(model, rendermime);
    let settings = DEFAULT_SETTINGS;

    const open = () => {
      if (!panel.isAttached) {
        app.shell.add(panel, 'main');
      }
      app.shell.activateById(panel.id);
    };

    app.commands.addCommand(COMMAND_OPEN, {
      label: 'Message of the day: Open',
      caption: 'Open the Message of the day tab and pull it again from the hub',
      execute: async () => {
        open();
        await model.pull();
      }
    });
    palette?.addItem({ command: COMMAND_OPEN, category: 'Message of the day' });

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
            open();
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
      if (settings.openOnStart) {
        open();
      }
    })();
  }
};

export default plugin;
