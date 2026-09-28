/**
 * Configuration for Playwright using default from @jupyterlab/galata.
 *
 * JUPYTER_TEST_PORT is the one port knob: the lab under test listens on it and the stub hub
 * the suite starts (tests/stub-hub.ts) on the port above it. Every JUPYTERHUB_ and JPY_
 * variable is removed first, so on a JupyterHub workstation the lab never reaches the real hub.
 * Environment set here reaches the webServer and every worker.
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

const PORT = process.env.JUPYTER_TEST_PORT || '8888';
const BASE_URL = `http://localhost:${PORT}`;

for (const name of Object.keys(process.env)) {
  if (name.startsWith('JUPYTERHUB_') || name.startsWith('JPY_')) {
    delete process.env[name];
  }
}
process.env.MOTD_STUB_PORT = String(Number(PORT) + 1);
process.env.JUPYTERHUB_API_URL = `http://127.0.0.1:${process.env.MOTD_STUB_PORT}/hub/api`;
process.env.JUPYTERHUB_API_TOKEN = 'galata-stub-token';

module.exports = {
  ...baseConfig,
  // one lab and one stub hub, shared by every spec
  workers: 1,
  fullyParallel: false,
  use: { ...baseConfig.use, baseURL: BASE_URL },
  webServer: {
    command: 'jlpm start',
    url: `${BASE_URL}/lab`,
    timeout: 120 * 1000,
    reuseExistingServer: false
  }
};
