/**
 * The Message of the day tab against a stub hub (docs/acc-crit.md, the Galata-tagged criteria).
 *
 * The lab under test calls the stub through this extension's server proxy; playwright.config.js
 * points JUPYTERHUB_API_URL at it. Pages load only once a test has set the stub's answers.
 */
import {
  IJupyterLabPageFixture,
  expect,
  galata,
  test
} from '@jupyterlab/galata';

import { STUB_TOKEN, StubHub, TERMINAL_TEXT } from './stub-hub';

const PLUGIN = 'jupyterlab_galaxahub_motd_extension:plugin';
const TAB = 'Message of the day';
const LINE = 'Message of the day:';
const STUB_PORT = process.env.MOTD_STUB_PORT!;
const RICH = 'extensions/motd/rich';
const NOTIFICATIONS = 'user-notifications';

const hub = new StubHub(Number(STUB_PORT));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const row = (
  message: string,
  minutes: number,
  type = 'info',
  audience = 'all'
) => ({ ts: minutesAgo(minutes), message, type, audience });

const MARKDOWN = {
  group: 'analysts',
  kind: 'markdown',
  body: '# Welcome to the analysts lab\n\nThe **GPU 0** is shared.'
};

const HTML = {
  group: 'everyone',
  kind: 'html',
  url: '/hub/api/extensions/motd/rich/pkg-1/index.html'
};

test.use({
  autoGoto: false,
  // galata's default readiness waits for the Launcher to be the current tab and then
  // activates it; this extension makes its own tab current at start, so readiness here is
  // the splash gone and the layout restored
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

/**
 * The console lines this extension writes with its own prefix, collected from page load on.
 */
function motdLines(page: IJupyterLabPageFixture): string[] {
  const lines: string[] = [];
  page.on('console', message => {
    if (message.text().startsWith(LINE)) {
      lines.push(message.text());
    }
  });
  return lines;
}

function tab(page: IJupyterLabPageFixture) {
  return page.activity.getTabLocator(TAB);
}

async function expectOpenAndCurrent(page: IJupyterLabPageFixture) {
  await expect(tab(page)).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).jupyterapp.shell.currentWidget?.title.label
      )
    )
    .toBe(TAB);
}

/**
 * Wait for the start pull to settle into its one console line, then assert no tab, no
 * dialog and no notification of this extension.
 */
async function expectSilent(page: IJupyterLabPageFixture, lines: string[]) {
  await expect.poll(() => lines.length, { timeout: 30_000 }).toBe(1);
  await page.waitForTimeout(500);
  expect(lines).toHaveLength(1);
  await expect(tab(page)).toHaveCount(0);
  await expect(page.locator('.jp-Dialog')).toHaveCount(0);
  await expect(
    page.locator('.jp-toast-message', { hasText: 'Message of the day' })
  ).toHaveCount(0);
}

function execute(page: IJupyterLabPageFixture, command: string, args = {}) {
  return page.evaluate(
    ([id, a]) => (window as any).jupyterapp.commands.execute(id, a),
    [command, args] as const
  );
}

test.describe('lab start', () => {
  test('opens the tab and makes it current when the hub has entries', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
  });

  test('opens the tab when only notifications exist', async ({ page }) => {
    hub.notifications = {
      status: 200,
      body: { notifications: [row('maintenance tonight', 5)] }
    };
    await page.goto();
    await expectOpenAndCurrent(page);
  });

  test('stays closed when the hub has no motd extension', async ({ page }) => {
    hub.rich = { status: 404, body: { message: 'Not Found' } };
    hub.notifications = {
      status: 200,
      body: { notifications: [row('maintenance tonight', 5)] }
    };
    const lines = motdLines(page);
    await page.goto();
    await expectSilent(page, lines);
  });

  test('stays closed when both answers are empty', async ({ page }) => {
    const lines = motdLines(page);
    await page.goto();
    await expectSilent(page, lines);
    expect(hub.count(RICH)).toBeGreaterThan(0);
  });

  test('stays closed when the hub is unreachable', async ({ page }) => {
    await hub.stop();
    const lines = motdLines(page);
    await page.goto();
    await expectSilent(page, lines);
  });
});

test.describe('tab content', () => {
  test('renders one section per entry in hub order, markdown through the lab renderer', async ({
    page
  }) => {
    const second = { group: 'alpha', kind: 'markdown', body: '* one\n* two' };
    hub.rich = {
      status: 200,
      body: { entries: [{ ...MARKDOWN, group: 'zulu' }, second] }
    };
    await page.goto();
    await expectOpenAndCurrent(page);

    await expect(page.locator('.jp-MotdPanel-heading')).toHaveText([
      'zulu',
      'alpha',
      'Notifications'
    ]);
    const zulu = page.locator('.jp-MotdPanel-section[data-group="zulu"]');
    await expect(zulu.locator('.jp-RenderedMarkdown h1')).toContainText(
      'Welcome to the analysts lab'
    );
    await expect(zulu.locator('.jp-RenderedMarkdown strong')).toHaveText(
      'GPU 0'
    );
    await expect(
      page.locator(
        '.jp-MotdPanel-section[data-group="alpha"] .jp-RenderedMarkdown li'
      )
    ).toHaveText(['one', 'two']);
  });

  test('shows an html entry in a sandboxed iframe at the hub url', async ({
    page
  }) => {
    // the hub serves the package on the lab's own origin; the stub stands in for that route
    await page.route(
      '**/hub/api/extensions/motd/rich/pkg-1/index.html',
      route =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><h1 id="pkg">Package welcome</h1>'
        })
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await page.goto();
    await expectOpenAndCurrent(page);

    const frame = page.locator('.jp-MotdPanel-frame');
    await expect(frame).toHaveAttribute('src', HTML.url);
    await expect(frame).toHaveAttribute('sandbox', 'allow-same-origin');
    await expect(
      page.frameLocator('.jp-MotdPanel-frame').locator('#pkg')
    ).toHaveText('Package welcome');
    // shown in the frame, never inlined into the lab page
    await expect(page.locator('.jp-MotdPanel #pkg')).toHaveCount(0);
  });

  test('lists notifications newest first with type style, relative time and audience', async ({
    page
  }) => {
    // oldest first on the wire: the tab must reorder
    hub.notifications = {
      status: 200,
      body: {
        notifications: [
          row('oldest', 3 * 24 * 60, 'info', 'all'),
          row('middle', 60, 'error', 'direct'),
          row('newest', 5, 'warning', 'all')
        ]
      }
    };
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);

    await expect(page.locator('.jp-MotdPanel-heading').last()).toHaveText(
      'Notifications'
    );
    const rows = page.locator('.jp-MotdPanel-row');
    await expect(rows.locator('.jp-MotdPanel-message')).toHaveText([
      'newest',
      'middle',
      'oldest'
    ]);
    await expect(rows.nth(0)).toHaveClass(/jp-Notification-Toast-warning/);
    await expect(rows.nth(1)).toHaveClass(/jp-Notification-Toast-error/);
    await expect(rows.nth(2)).toHaveClass(/jp-Notification-Toast-info/);
    await expect(rows.locator('.jp-MotdPanel-audience')).toHaveText([
      'All users',
      'Direct',
      'All users'
    ]);
    await expect(rows.locator('.jp-MotdPanel-time')).toHaveText([
      '5 minutes ago',
      '1 hour ago',
      '3 days ago'
    ]);
    // the type colour is the lab's own: the warning row's top border is --jp-warn-color1
    const [border, warn] = await rows.nth(0).evaluate(el => [
      getComputedStyle(el).borderTopColor,
      (() => {
        const probe = document.createElement('div');
        probe.style.color = 'var(--jp-warn-color1)';
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      })()
    ]);
    expect(border).toBe(warn);
  });

  test('does not render the terminal text', async ({ page }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel')).not.toContainText(
      TERMINAL_TEXT
    );
    expect(hub.count('extensions/motd/terminal')).toBe(0);
  });

  test('the browser calls only the extension routes', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => {
      requests.push(
        `${request.url()} ${request.headers()['authorization'] ?? ''}`
      );
    });
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    hub.notifications = {
      status: 200,
      body: { notifications: [row('maintenance tonight', 5)] }
    };
    await page.goto();
    await expectOpenAndCurrent(page);

    const motd = requests.filter(r =>
      r.includes('/jupyterlab-galaxahub-motd-extension/')
    );
    expect(
      motd.some(r => r.includes('/jupyterlab-galaxahub-motd-extension/rich'))
    ).toBe(true);
    expect(
      motd.some(r =>
        r.includes('/jupyterlab-galaxahub-motd-extension/notifications')
      )
    ).toBe(true);
    expect(
      motd.some(r =>
        r.includes('/jupyterlab-galaxahub-motd-extension/terminal')
      )
    ).toBe(false);
    expect(requests.filter(r => r.includes(`:${STUB_PORT}/`))).toEqual([]);
    expect(
      requests.filter(r =>
        /\/hub\/api\/(user-notifications|extensions\/motd\/(rich|terminal))(\?| )/.test(
          r
        )
      )
    ).toEqual([]);
    expect(requests.filter(r => r.includes(STUB_TOKEN))).toEqual([]);
  });
});

test.describe('open command', () => {
  test('palette command reopens the tab and pulls again', async ({ page }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await page.activity.closePanel(TAB);
    await expect(tab(page)).toHaveCount(0);

    // the browser request, not the stub count: on a lab carrying many extensions the Launcher
    // that fills the emptied main area can hold every connection slot for seconds, so the pull
    // is issued at once but can reach the hub late
    const pulls = Promise.all([
      page.waitForRequest(/\/jupyterlab-galaxahub-motd-extension\/rich/),
      page.waitForRequest(
        /\/jupyterlab-galaxahub-motd-extension\/notifications/
      )
    ]);
    await execute(page, 'apputils:activate-command-palette');
    await page
      .locator('.lm-CommandPalette-input')
      .fill('Message of the day: Open');
    await page
      .locator('.lm-CommandPalette-item', {
        hasText: 'Message of the day: Open'
      })
      .click();

    await expectOpenAndCurrent(page);
    await pulls;
  });

  test('the tab is a singleton', async ({ page }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await execute(page, 'galaxahub-motd:open');
    await execute(page, 'galaxahub-motd:open');
    await expect(tab(page)).toHaveCount(1);
    await expect(page.locator('.jp-MotdPanel')).toHaveCount(1);
  });
});

test.describe('openOnStart off', () => {
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [PLUGIN]: { openOnStart: false }
    }
  });

  test('openOnStart off keeps the tab closed on start', async ({ page }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expect.poll(() => hub.count(NOTIFICATIONS)).toBeGreaterThan(0);
    await page.waitForTimeout(2000);
    await expect(tab(page)).toHaveCount(0);
    // the command still opens it
    await execute(page, 'galaxahub-motd:open');
    await expectOpenAndCurrent(page);
  });
});

test.describe('reopenOnBroadcast on', () => {
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [PLUGIN]: { reopenOnBroadcast: true }
    }
  });

  test('reopenOnBroadcast reopens the tab for a recorded broadcast', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await page.activity.closePanel(TAB);
    await expect(tab(page)).toHaveCount(0);

    const message = 'Broadcast: maintenance at 22:00 UTC';
    hub.record(row(message, 0, 'warning'));
    await execute(page, 'apputils:notify', { message, type: 'warning' });

    await expect(tab(page)).toHaveCount(1, { timeout: 30_000 });
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-message').first()).toHaveText(
      message
    );
  });

  test('a notification the hub did not record leaves the tab closed', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await page.activity.closePanel(TAB);
    const pulled = hub.count(NOTIFICATIONS);

    await execute(page, 'apputils:notify', {
      message: 'Kernel restarted',
      type: 'info'
    });

    // the extension checks the feed three times, then gives up
    await expect
      .poll(() => hub.count(NOTIFICATIONS), { timeout: 30_000 })
      .toBe(pulled + 3);
    await page.waitForTimeout(500);
    await expect(tab(page)).toHaveCount(0);
  });
});

test.describe('reopenOnBroadcast default', () => {
  test('a recorded broadcast leaves the tab closed by default', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await page.activity.closePanel(TAB);
    const pulled = hub.count(NOTIFICATIONS);

    const message = 'Broadcast: default setting';
    hub.record(row(message, 0));
    await execute(page, 'apputils:notify', { message, type: 'info' });

    // longer than the first re-pull delay an enabled setting would wait
    await page.waitForTimeout(3000);
    expect(hub.count(NOTIFICATIONS)).toBe(pulled);
    await expect(tab(page)).toHaveCount(0);
  });
});
