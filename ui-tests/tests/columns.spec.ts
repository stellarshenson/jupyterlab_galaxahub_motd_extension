/**
 * The two columns of the open Message of the day tab against a stub hub: the Notifications
 * column kept current by the clock (ACC-VIEW-92) and the names of both columns (ACC-LAYOUT-93).
 */
import { IJupyterLabPageFixture, expect, test } from '@jupyterlab/galata';

import { StubHub } from './stub-hub';

// the tab label the suite's lab config sets (jupyter_server_test_config.py)
const TAB = 'Message of the day';
const NOTIFICATIONS = 'user-notifications';
const hub = new StubHub(Number(process.env.MOTD_STUB_PORT!));

const row = (message: string, minutes: number) => ({
  ts: new Date(Date.now() - minutes * 60_000).toISOString(),
  message,
  type: 'info',
  audience: 'all'
});

test.use({
  autoGoto: false,
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
});

async function openTab(page: IJupyterLabPageFixture) {
  await page.goto();
  await expect(page.activity.getTabLocator(TAB)).toHaveCount(1);
}

test.describe('notification times', () => {
  test('the Notifications column follows the clock without a pull, and the entry frame keeps its page', async ({
    page
  }) => {
    // the hub serves the package on the lab's own origin; the route stands in for it
    await page.route(
      '**/hub/api/extensions/motd/rich/pkg-1/index.html',
      route =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><h1 id="pkg">Package welcome</h1>'
        })
    );
    hub.rich = {
      status: 200,
      body: {
        entries: [
          {
            group: 'grp-interns',
            label: 'interns',
            kind: 'html',
            url: '/hub/api/extensions/motd/rich/pkg-1/index.html'
          }
        ]
      }
    };
    hub.notifications = {
      status: 200,
      body: {
        notifications: [row('recent', 5), row('leaving', 7 * 24 * 60 - 1)]
      }
    };
    // installed before the lab loads; the page's clock then runs as the real one until it is
    // moved
    await page.clock.install();
    await openTab(page);
    const column = page.locator('.jp-MotdPanel-notifications');
    await expect(column.locator('.jp-MotdPanel-message')).toHaveText([
      'recent',
      'leaving'
    ]);
    await expect(column.locator('.jp-MotdPanel-time')).toHaveText([
      '5 minutes ago',
      '6 days ago'
    ]);
    await expect(column.locator('.jp-MotdPanel-count')).toHaveText('2');
    // a mark on the loaded page, which a new load of the frame would not carry
    const pkg = page.frameLocator('.jp-MotdPanel-frame').locator('#pkg');
    await expect(pkg).toHaveText('Package welcome');
    await pkg.evaluate(el => el.setAttribute('data-kept', 'yes'));
    const pulled = hub.count(NOTIFICATIONS);

    await page.clock.fastForward('02:00');
    await expect(column.locator('.jp-MotdPanel-message')).toHaveText([
      'recent'
    ]);
    await expect(column.locator('.jp-MotdPanel-time')).toHaveText([
      '7 minutes ago'
    ]);
    await expect(column.locator('.jp-MotdPanel-count')).toHaveText('1');
    await expect(pkg).toHaveAttribute('data-kept', 'yes');
    expect(hub.count(NOTIFICATIONS)).toBe(pulled);
  });
});

test.describe('column names', () => {
  test('each column is a region found by its name, and it is the column that takes the focus', async ({
    page
  }) => {
    // no heading, so the card holds no anchor link to stop on
    hub.rich = {
      status: 200,
      body: {
        entries: [
          {
            group: 'grp-analysts',
            label: 'analysts',
            kind: 'markdown',
            body: 'The **GPU 0** is shared.'
          }
        ]
      }
    };
    hub.notifications = {
      status: 200,
      body: { notifications: [row('maintenance tonight', 5)] }
    };
    await openTab(page);
    const panel = page.locator('.jp-MotdPanel');
    const entries = panel.getByRole('region', { name: TAB, exact: true });
    const notifications = panel.getByRole('region', {
      name: 'Notifications',
      exact: true
    });
    await expect(entries).toHaveClass('jp-MotdPanel-entries');
    await expect(notifications).toHaveClass('jp-MotdPanel-notifications');

    await expect(entries).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(notifications).toBeFocused();
  });
});
