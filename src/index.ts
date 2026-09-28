import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { requestAPI } from './request';

/**
 * Initialization data for the jupyterlab_galaxahub_motd_extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_galaxahub_motd_extension:plugin',
  description: 'jupyterlab_galaxahub_motd_extension',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry | null
  ) => {
    console.log(
      'JupyterLab extension jupyterlab_galaxahub_motd_extension is activated!'
    );

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log(
            'jupyterlab_galaxahub_motd_extension settings loaded:',
            settings.composite
          );
        })
        .catch(reason => {
          console.error(
            'Failed to load settings for jupyterlab_galaxahub_motd_extension.',
            reason
          );
        });
    }

    requestAPI<any>('hello', app.serviceManager.serverSettings)
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The jupyterlab_galaxahub_motd_extension server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
