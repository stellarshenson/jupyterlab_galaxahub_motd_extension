/**
 * The tab's icon is the hub's favicon, in the tab bar (ACC-VIEW-80) and in the Open Tabs list of
 * the running sidebar (ACC-VIEW-101). The suite's lab runs outside a hub, so each test gives the
 * lab page a hub host and prefix that name the stub hub, which answers the favicon. The tab
 * without a hub prefix is in motd.spec.ts.
 *
 * Playwright aborts every request it intercepts whose url ends in /favicon.ico, and one route
 * turns interception on for the whole page, so this file has no route: galata's mocks are off and
 * the page config is changed in the browser.
 */
import { IJupyterLabPageFixture, expect, test } from '@jupyterlab/galata';

import { Locator } from '@playwright/test';

import { StubHub } from './stub-hub';

// the tab label the suite's lab config sets (jupyter_server_test_config.py)
const TAB = 'Message of the day';
const STUB_PORT = process.env.MOTD_STUB_PORT!;
const FAVICON = '/hub/static/favicon.ico';
const SQUARE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>';
const hub = new StubHub(Number(STUB_PORT));

test.use({
  autoGoto: false,
  mockConfig: false,
  mockSettings: false,
  mockState: false,
  mockUser: false,
  kernels: null,
  sessions: null,
  terminals: null,
  // this extension makes its own tab current at start, so readiness is the splash gone and the
  // layout restored, as in motd.spec.ts
  waitForApplication: async ({ baseURL }, use) => {
    await use(async page => {
      await page.locator('#jupyterlab-splash').waitFor({ state: 'detached' });
      await page.waitForFunction(
        () => (window as any).jupyterapp !== undefined
      );
      await page.evaluate(() => (window as any).jupyterapp.restored);
    });
  }
});

test.beforeAll(async () => {
  await hub.start();
});

test.afterAll(async () => {
  await hub.stop();
});

test.beforeEach(async () => {
  hub.reset();
  await hub.start();
  hub.rich = {
    status: 200,
    body: {
      entries: [
        {
          group: 'grp-analysts',
          label: 'analysts',
          kind: 'markdown',
          body: 'Text.'
        }
      ]
    }
  };
});

/**
 * Load the lab with the stub hub as the hub host and /hub/ as the hub prefix in its page config,
 * as the lab of a hub on its own host has. The page is parsed by then and the lab's scripts,
 * which read the config, have not run. The page config also turns on the lab's own running
 * sidebar, which holds the Open Tabs list: a workspace manager extension installed beside the lab
 * turns it off and takes its place.
 */
async function gotoUnderHub(page: IJupyterLabPageFixture) {
  await page.addInitScript(hubHost => {
    document.addEventListener('readystatechange', () => {
      const data = document.getElementById('jupyter-config-data');
      if (document.readyState === 'interactive' && data) {
        const config = JSON.parse(data.textContent!);
        data.textContent = JSON.stringify({
          ...config,
          hubHost,
          hubPrefix: '/hub/',
          disabledExtensions: [
            ...(config.disabledExtensions ?? []).filter(
              (id: string) => id !== '@jupyterlab/running-extension:sidebar'
            ),
            '@stellarshenson/jupyterlab-workspace-manager-extension'
          ]
        });
      }
    });
  }, `http://127.0.0.1:${STUB_PORT}`);
  // the lab keeps its layout between tests of this file, which mock no state
  await page.goto('?reset');
}

/**
 * The tab and a launcher tab, both open and neither current.
 */
async function tabAndLauncher(
  page: IJupyterLabPageFixture
): Promise<[Locator, Locator]> {
  const tab = page.activity.getTabLocator(TAB);
  await expect(tab).toHaveCount(1);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() =>
      (window as any).jupyterapp.commands.execute('launcher:create')
    );
  }
  const launcher = page.activity.getTabLocator('Launcher').first();
  await expect(tab).not.toHaveClass(/lm-mod-current/);
  await expect(launcher).not.toHaveClass(/lm-mod-current/);
  return [tab, launcher];
}

/**
 * The rows of the tab and of a launcher tab in the Open Tabs list of the running sidebar.
 */
async function openTabsRows(
  page: IJupyterLabPageFixture
): Promise<[Locator, Locator]> {
  await page.sidebar.openTab('jp-running-sessions');
  const rows = page
    .getByRole('region', { name: 'Open Tabs Section' })
    .locator('.jp-RunningSessions-item');
  const row = (label: string) =>
    rows.filter({
      has: page.locator('.jp-RunningSessions-itemLabel', { hasText: label })
    });
  await expect(row(TAB)).toHaveCount(1);
  return [row(TAB), row('Launcher').first()];
}

/**
 * Whether the browser decodes the image an svg image element shows.
 */
async function decodes(image: Locator): Promise<boolean> {
  return image.evaluate(element =>
    (element as SVGImageElement).decode().then(
      () => true,
      () => false
    )
  );
}

/**
 * The box of `part`, its left edge from the left edge of the element that holds it.
 */
async function box(owner: Locator, part: string) {
  const partBox = (await owner.locator(part).boundingBox())!;
  return {
    x: partBox.x - (await owner.boundingBox())!.x,
    width: partBox.width,
    height: partBox.height
  };
}

test('the tab shows the hub favicon at the size of another tab icon', async ({
  page
}) => {
  hub.favicon = SQUARE;
  await gotoUnderHub(page);
  const [tab, launcher] = await tabAndLauncher(page);
  const image = tab.locator('.lm-TabBar-tabIcon image');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute(
    'href',
    `http://127.0.0.1:${STUB_PORT}${FAVICON}`
  );
  // decorative
  await expect(tab.locator('.lm-TabBar-tabIcon svg')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
  expect(await decodes(image)).toBe(true);
  // the favicon fills the icon box as the launcher's svg fills its own
  for (const [ours, theirs] of [
    ['.lm-TabBar-tabIcon', '.lm-TabBar-tabIcon'],
    ['.lm-TabBar-tabIcon image', '.lm-TabBar-tabIcon svg']
  ]) {
    const a = await box(tab, ours);
    const b = await box(launcher, theirs);
    expect(a.x).toBeCloseTo(b.x, 1);
    expect(a.width).toBeCloseTo(b.width, 1);
    expect(a.height).toBeCloseTo(b.height, 1);
  }
  // and the label starts where the launcher's label starts
  expect((await box(tab, '.lm-TabBar-tabLabel')).x).toBeCloseTo(
    (await box(launcher, '.lm-TabBar-tabLabel')).x,
    1
  );
});

test('the tab has no icon box when the hub favicon does not load', async ({
  page
}) => {
  await gotoUnderHub(page);
  const [tab, launcher] = await tabAndLauncher(page);
  // the favicon was asked for, and the stub answered 404
  await expect.poll(() => hub.count(FAVICON)).toBe(1);
  await expect(tab.locator('.lm-TabBar-tabIcon')).toBeHidden();
  await expect(tab.locator('.lm-TabBar-tabIcon image')).toHaveCount(0);
  // no room kept for an icon: the label starts where the launcher's icon starts
  expect((await box(tab, '.lm-TabBar-tabLabel')).x).toBeCloseTo(
    (await box(launcher, '.lm-TabBar-tabIcon')).x,
    1
  );
});

test('the Open Tabs list shows the hub favicon for the tab (ACC-VIEW-101)', async ({
  page
}) => {
  hub.favicon = SQUARE;
  await gotoUnderHub(page);
  await tabAndLauncher(page);
  const [row, launcherRow] = await openTabsRows(page);
  const image = row.locator('.jp-RunningSessions-icon image');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute(
    'href',
    `http://127.0.0.1:${STUB_PORT}${FAVICON}`
  );
  expect(await decodes(image)).toBe(true);
  // at the place and the size of the launcher row's icon
  const a = await box(row, '.jp-RunningSessions-icon image');
  const b = await box(launcherRow, '.jp-RunningSessions-icon svg');
  expect(a.x).toBeCloseTo(b.x, 1);
  expect(a.width).toBeCloseTo(b.width, 1);
  expect(a.height).toBeCloseTo(b.height, 1);
  // the tab bar and the list together asked the hub for the favicon once
  expect(hub.count(FAVICON)).toBe(1);
});

test('the Open Tabs list keeps the file icon when the hub favicon does not load (ACC-VIEW-101)', async ({
  page
}) => {
  await gotoUnderHub(page);
  await tabAndLauncher(page);
  // the favicon was asked for, and the stub answered 404
  await expect.poll(() => hub.count(FAVICON)).toBe(1);
  const [row] = await openTabsRows(page);
  await expect(
    row.locator('.jp-RunningSessions-icon svg[data-icon="ui-components:file"]')
  ).toBeVisible();
  await expect(row.locator('image')).toHaveCount(0);
});
