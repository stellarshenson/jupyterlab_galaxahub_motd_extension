/**
 * The Message of the day tab against a stub hub (docs/acc-crit.md, the Galata-tagged criteria).
 *
 * The lab under test calls the stub through this extension's server proxy;
 * jupyter_server_test_config.py points the GalaxaHubMotd URLs at it. Pages load only once a test has set the stub's answers.
 */
import {
  IJupyterLabPageFixture,
  expect,
  galata,
  test
} from '@jupyterlab/galata';

import { Locator } from '@playwright/test';

import { spawn } from 'child_process';

import * as fs from 'fs';

import * as path from 'path';

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
  group: 'grp-analysts',
  label: 'analysts',
  kind: 'markdown',
  body: '# Welcome to the analysts lab\n\nThe **GPU 0** is shared.'
};

const HTML = {
  group: 'grp-interns',
  label: 'interns',
  kind: 'html',
  url: '/hub/api/extensions/motd/rich/pkg-1/index.html'
};

// the frame sandbox of this lab, whose c.GalaxaHubMotd.html_allow_scripts is on
const SANDBOX_WITH_SCRIPTS =
  'allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts';

// a page whose script replaces the text of #js
const SCRIPT_PAGE =
  '<!doctype html><html><body><p id="js">no script ran</p>' +
  '<script>document.getElementById("js").textContent = "script ran";</script></body></html>';

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

/**
 * Wait until an html entry frame has loaded its package page and the lab has drawn twice since;
 * the resize observer that fits the frame reports before the next paint.
 */
async function loaded(page: IJupyterLabPageFixture, frame: Locator) {
  await expect
    .poll(() =>
      frame.evaluate(el => {
        const doc = (el as HTMLIFrameElement).contentDocument;
        return (
          doc?.readyState === 'complete' && doc.URL.endsWith('/index.html')
        );
      })
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
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

  test('stays closed when only notifications exist, also from the open command', async ({
    page
  }) => {
    hub.notifications = {
      status: 200,
      body: { notifications: [row('maintenance tonight', 5)] }
    };
    const lines = motdLines(page);
    await page.goto();
    await expectSilent(page, lines);
    await execute(page, 'galaxahub-motd:open');
    await expect.poll(() => lines.length).toBe(2);
    await expect(tab(page)).toHaveCount(0);
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
    const second = { label: 'alpha', kind: 'markdown', body: '* one\n* two' };
    hub.rich = {
      status: 200,
      body: { entries: [{ ...MARKDOWN, label: 'zulu' }, second] }
    };
    await page.goto();
    await expectOpenAndCurrent(page);

    await expect(page.locator('.jp-MotdPanel-heading')).toHaveText([
      'zulu',
      'alpha',
      'Notifications'
    ]);
    const zulu = page.locator('.jp-MotdPanel-section[data-label="zulu"]');
    await expect(zulu.locator('.jp-RenderedMarkdown h1')).toContainText(
      'Welcome to the analysts lab'
    );
    await expect(zulu.locator('.jp-RenderedMarkdown strong')).toHaveText(
      'GPU 0'
    );
    await expect(
      page.locator(
        '.jp-MotdPanel-section[data-label="alpha"] .jp-RenderedMarkdown li'
      )
    ).toHaveText(['one', 'two']);
  });

  test('scrolls to the heading a same-document link names and opens no window', async ({
    page
  }) => {
    const filler = Array.from({ length: 40 }, (_, i) => `Line ${i}`).join(
      '\n\n'
    );
    const body = [
      '# Welcome',
      '[lab form](#Second-part), [GitHub form](#third-part-faq), [accent](#Résumé-100%), [no heading](#no-such-heading)',
      filler,
      '## Second part',
      filler,
      '## Third part: FAQ!',
      filler,
      '## Résumé 100%',
      filler
    ].join('\n\n');
    // the entry above has a heading of the same name: the link stays inside its own entry
    const above = { label: 'alpha', kind: 'markdown', body: '## Second part' };
    hub.rich = {
      status: 200,
      body: { entries: [above, { ...MARKDOWN, body }] }
    };
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto();
    await expectOpenAndCurrent(page);
    let opened = 0;
    page.context().on('page', () => opened++);
    const url = page.url();
    const scroller = page.locator('.jp-MotdPanel-entries');
    const entry = page.locator('.jp-MotdPanel-section[data-label="analysts"]');
    // how far the heading's top is below the top of the scrolling column
    const below = async (heading: string) => {
      const top = (await scroller.boundingBox())!.y;
      const box = await entry.locator('h2', { hasText: heading }).boundingBox();
      return box!.y - top;
    };

    await entry.getByRole('link', { name: 'lab form' }).click();
    await expect.poll(() => below('Second part')).toBeLessThan(40);
    expect(await below('Second part')).toBeGreaterThanOrEqual(0);

    await entry.getByRole('link', { name: 'GitHub form' }).click();
    await expect.poll(() => below('Third part')).toBeLessThan(40);
    expect(await below('Third part')).toBeGreaterThanOrEqual(0);

    // the renderer writes the letter é as escapes and leaves the % as it is
    await entry.getByRole('link', { name: 'accent' }).click();
    await expect.poll(() => below('Résumé 100%')).toBeLessThan(40);
    expect(await below('Résumé 100%')).toBeGreaterThanOrEqual(0);

    await entry.getByRole('link', { name: 'no heading' }).click();
    await page.waitForTimeout(500);
    expect(opened).toBe(0);
    expect(page.url()).toBe(url);
    // the lab page itself did not move
    expect(
      await page.evaluate(() => [
        document.scrollingElement!.scrollTop,
        document.getElementById('main')!.getBoundingClientRect().top
      ])
    ).toEqual([0, 0]);
  });

  test('an entry with no label shows its card without the header strip', async ({
    page
  }) => {
    const url = '/hub/api/extensions/motd/rich/pkg-3/index.html';
    await page.route(`**${url}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><p>Team page</p>'
      })
    );
    hub.rich = {
      status: 200,
      body: {
        entries: [
          // the hub's group is not read: with no label the card has no header strip
          { group: 'grp-analysts', kind: 'markdown', body: MARKDOWN.body },
          { group: 'grp-interns', label: '', kind: 'html', url },
          MARKDOWN
        ]
      }
    };
    await page.goto();
    await expectOpenAndCurrent(page);

    const cards = page.locator('.jp-MotdPanel-section');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('.jp-MotdPanel-strip')).toHaveCount(1);
    await expect(page.locator('.jp-MotdPanel-heading')).toHaveText([
      'analysts',
      'Notifications'
    ]);
    await expect(page.locator('.jp-MotdPanel-entries')).not.toContainText(
      'grp-'
    );
    await expect(cards.nth(0).locator('.jp-RenderedMarkdown h1')).toContainText(
      'Welcome to the analysts lab'
    );
    // the frame starts at the card's top edge, its top border under the card's border
    const card = (await cards.nth(1).boundingBox())!;
    const frame = (await cards
      .nth(1)
      .locator('.jp-MotdPanel-frame')
      .boundingBox())!;
    expect(frame.y).toBeCloseTo(card.y, 0);
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
          body: '<!doctype html><h1 id="pkg">Package welcome</h1><p>Read the onboarding notebook first.</p>'
        })
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await page.goto();
    await expectOpenAndCurrent(page);

    const frame = page.locator('.jp-MotdPanel-frame');
    await expect(frame).toHaveAttribute('src', HTML.url);
    await expect(frame).toHaveAttribute('sandbox', SANDBOX_WITH_SCRIPTS);
    await expect(
      page.frameLocator('.jp-MotdPanel-frame').locator('#pkg')
    ).toHaveText('Package welcome');
    // shown in the frame, never inlined into the lab page
    await expect(page.locator('.jp-MotdPanel #pkg')).toHaveCount(0);
    // the frame takes the package's own height, not the 480px default box
    await expect
      .poll(() => frame.evaluate(el => el.getBoundingClientRect().height))
      .toBeLessThan(200);
  });

  test('runs a script in an html page', async ({ page }) => {
    await page.route(
      '**/hub/api/extensions/motd/rich/pkg-1/index.html',
      route =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: SCRIPT_PAGE
        })
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(
      page.frameLocator('.jp-MotdPanel-frame').locator('#js')
    ).toHaveText('script ran');
  });

  test('opens a target=_blank link of an html page in a new browser tab', async ({
    page
  }) => {
    await page.route(
      '**/hub/api/extensions/motd/rich/pkg-1/index.html',
      route =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><a id="out" href="next.html" target="_blank">Next</a>'
        })
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await page.goto();
    await expectOpenAndCurrent(page);

    const opened = page.context().waitForEvent('page');
    await page.frameLocator('.jp-MotdPanel-frame').locator('#out').click();
    const popup = await opened;
    await popup.waitForURL('**/hub/api/extensions/motd/rich/pkg-1/next.html');
    await popup.close();
  });

  test('keeps the content of a page laid out to the frame height reachable', async ({
    page
  }) => {
    // an app-shell page: a header, then a main that fills the rest of the frame's viewport
    // and scrolls its own content
    await page.route(
      '**/hub/api/extensions/motd/rich/pkg-1/index.html',
      route =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><style>html,body{height:100%;margin:0}body{display:flex;flex-direction:column}header{height:48px}main{flex:1;overflow:auto}</style><header>Welcome</header><main><div style="height:1000px"></div></main>'
        })
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await page.goto();
    await expectOpenAndCurrent(page);

    // before load the frame is 480 px and main is tall by accident; wait for the fit
    await loaded(page, page.locator('.jp-MotdPanel-frame'));
    expect(
      await page
        .frameLocator('.jp-MotdPanel-frame')
        .locator('main')
        .evaluate(el => el.clientHeight)
    ).toBeGreaterThan(0);
  });

  test('lists the notifications of the last 24 hours by default, newest first with type style, relative time and audience', async ({
    page
  }) => {
    // oldest first on the wire: the tab must reorder and leave out the rows older than 24 hours
    hub.notifications = {
      status: 200,
      body: {
        notifications: [
          row('last week', 8 * 24 * 60, 'info', 'all'),
          row('two days', 2 * 24 * 60, 'info', 'all'),
          row('oldest', 23 * 60, 'info', 'all'),
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
    await expect(page.locator('.jp-MotdPanel-count')).toHaveText('3');
    const rows = page.locator('.jp-MotdPanel-row');
    await expect(rows.locator('.jp-MotdPanel-message')).toHaveText([
      'newest',
      'middle',
      'oldest'
    ]);
    await expect(rows.nth(0)).toHaveAttribute('data-type', 'warning');
    await expect(rows.nth(1)).toHaveAttribute('data-type', 'error');
    await expect(rows.nth(2)).toHaveAttribute('data-type', 'info');
    await expect(rows.locator('.jp-MotdPanel-audience')).toHaveText([
      'All users',
      'Direct',
      'All users'
    ]);
    await expect(rows.locator('.jp-MotdPanel-time')).toHaveText([
      '5 minutes ago',
      '1 hour ago',
      '23 hours ago'
    ]);
    // each row starts with its type icon, coloured by the lab's own variable of the type
    await expect(rows.locator(':scope > svg.jp-MotdPanel-icon')).toHaveCount(3);
    const [icon, warn] = await rows.nth(0).evaluate(el => [
      getComputedStyle(el.firstElementChild!).color,
      (() => {
        const probe = document.createElement('div');
        probe.style.color = 'var(--jp-warn-color1)';
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      })()
    ]);
    expect(icon).toBe(warn);
  });

  test('the notificationWindow setting lists the last 3 days or 7 days, and redraws the open tab', async ({
    page
  }) => {
    hub.notifications = {
      status: 200,
      body: {
        notifications: [
          row('last week', 8 * 24 * 60),
          row('six days', 167 * 60),
          row('three days', 71 * 60),
          row('yesterday', 25 * 60),
          row('newest', 5)
        ]
      }
    };
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    const messages = page.locator('.jp-MotdPanel-row .jp-MotdPanel-message');
    await expect(messages).toHaveText(['newest']);
    const pulled = hub.count(NOTIFICATIONS);
    for (const [span, listed] of [
      ['3d', ['newest', 'yesterday', 'three days']],
      ['7d', ['newest', 'yesterday', 'three days', 'six days']]
    ] as const) {
      await page.evaluate(
        async ([id, value]) => {
          const registry = await (window as any).galata.getPlugin(
            '@jupyterlab/apputils-extension:settings'
          );
          await registry.set(id, 'notificationWindow', value);
        },
        [PLUGIN, span] as const
      );
      await expect(messages).toHaveText([...listed]);
    }
    // the rows the tab already holds are redrawn; the hub is not asked again
    expect(hub.count(NOTIFICATIONS)).toBe(pulled);
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

test.describe('two-column layout', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const SECOND = {
    label: 'interns',
    kind: 'markdown',
    body: '## Getting started\n\nRead the onboarding notebook first.'
  };

  const manyRows = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      row(`notification ${i + 1}`, i + 1)
    );

  async function box(page: IJupyterLabPageFixture, selector: string) {
    const found = await page.locator(selector).boundingBox();
    expect(found).not.toBeNull();
    return found!;
  }

  test('shows the entries left in 3/4 of the width and the Notifications column right in 1/4', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN, SECOND] } };
    hub.notifications = { status: 200, body: { notifications: manyRows(4) } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(2);
    await expect(page.locator('.jp-MotdPanel-row')).toHaveCount(4);

    const entries = await box(page, '.jp-MotdPanel-entries');
    const notifications = await box(page, '.jp-MotdPanel-notifications');
    expect(notifications.x).toBeCloseTo(entries.x + entries.width, 0);
    expect(notifications.y).toBeCloseTo(entries.y, 0);
    expect(
      notifications.width / (entries.width + notifications.width)
    ).toBeCloseTo(0.25, 2);
  });

  test('lays a row out as a tinted card: the message, then the marker and the time on one line', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    hub.notifications = {
      status: 200,
      body: {
        notifications: [
          row('maintenance tonight', 5, 'warning'),
          row('quota raised', 9, 'info')
        ]
      }
    };
    await page.goto();
    await expectOpenAndCurrent(page);
    const cards = page.locator('.jp-MotdPanel-row');
    await expect(cards).toHaveCount(2);

    const first = '.jp-MotdPanel-row >> nth=0 >> ';
    const text = await box(page, first + '.jp-MotdPanel-text');
    const message = await box(page, first + '.jp-MotdPanel-message');
    const marker = await box(page, first + '.jp-MotdPanel-audience');
    const time = await box(page, first + '.jp-MotdPanel-time');
    // the marker at the left edge of the row text, the time right after it, both below the message
    expect(marker.x).toBeCloseTo(text.x, 0);
    expect(marker.y).toBeGreaterThanOrEqual(message.y + message.height);
    expect(time.y).toBeCloseTo(marker.y, 0);
    expect(time.x).toBeCloseTo(marker.x + marker.width, 0);

    // each card has a border and a background tinted with the lab colour of its type
    const look = (index: number) =>
      cards.nth(index).evaluate(el => {
        const style = getComputedStyle(el);
        return {
          border: style.borderTopWidth,
          radius: style.borderTopLeftRadius,
          background: style.backgroundColor
        };
      });
    const warning = await look(0);
    const info = await look(1);
    expect(warning.border).toBe('1px');
    expect(warning.radius).toBe('6px');
    expect(warning.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(info.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(warning.background).not.toBe(info.background);
    // 8 px between two cards
    const one = await box(page, '.jp-MotdPanel-row >> nth=0');
    const two = await box(page, '.jp-MotdPanel-row >> nth=1');
    expect(two.y - (one.y + one.height)).toBeCloseTo(8, 0);
  });

  test('keeps wide markdown and a long group name inside the card', async ({
    page
  }) => {
    // no break opportunity in either, so neither can wrap to the card width on its own
    const path = '/srv/' + 'shared_datasets_'.repeat(13).slice(0, 195);
    const group = 'data_science_team_'.repeat(12).slice(0, 200);
    const url = '/hub/api/extensions/motd/rich/pkg-2/index.html';
    await page.route(`**${url}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><p>Team page</p>'
      })
    );
    hub.rich = {
      status: 200,
      body: {
        entries: [
          { ...MARKDOWN, body: `Data lives in \`${path}\`.` },
          { label: group, kind: 'html', url }
        ]
      }
    };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(2);

    // the markdown body scrolls sideways far enough to bring the code's right edge into the card
    const markdown = '.jp-MotdPanel-section[data-kind="markdown"]';
    await page.locator(`${markdown} .jp-MotdPanel-body`).evaluate(el => {
      el.scrollLeft = el.scrollWidth;
    });
    const card = await box(page, markdown);
    const code = await box(page, `${markdown} code`);
    expect(code.width).toBeGreaterThan(card.width);
    expect(code.x + code.width).toBeLessThanOrEqual(card.x + card.width);

    // the group name wraps, and the label stays on one line inside the card
    const html = '.jp-MotdPanel-section[data-kind="html"]';
    const htmlCard = await box(page, html);
    const heading = await box(page, `${html} .jp-MotdPanel-heading`);
    const label = await box(page, `${html} .jp-MotdPanel-kind`);
    expect(heading.x + heading.width).toBeLessThanOrEqual(
      htmlCard.x + htmlCard.width
    );
    expect(label.x + label.width).toBeLessThanOrEqual(
      htmlCard.x + htmlCard.width
    );
    const fontSize = await page
      .locator(`${html} .jp-MotdPanel-kind`)
      .evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(label.height).toBeLessThan(2 * fontSize);
    expect(
      await page
        .locator(`${html} .jp-MotdPanel-heading`)
        .evaluate(el => el.scrollWidth <= el.clientWidth)
    ).toBe(true);
  });

  test('stacks the columns in a tab narrower than 800 px and scrolls the tab as one', async ({
    page
  }) => {
    await page.setViewportSize({ width: 820, height: 600 });
    hub.rich = { status: 200, body: { entries: [MARKDOWN, SECOND] } };
    hub.notifications = { status: 200, body: { notifications: manyRows(8) } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(2);
    await expect(page.locator('.jp-MotdPanel-row')).toHaveCount(8);

    // the element that scrolls a stacked tab
    const panel = page.locator('.jp-MotdPanel-columns');
    const panelWidth = await panel.evaluate(el => el.clientWidth);
    expect(panelWidth).toBeLessThan(800);
    const entries = await box(page, '.jp-MotdPanel-entries');
    const notifications = await box(page, '.jp-MotdPanel-notifications');
    expect(notifications.y).toBeCloseTo(entries.y + entries.height, 0);
    expect(entries.width).toBeCloseTo(panelWidth, 0);
    expect(notifications.width).toBeCloseTo(panelWidth, 0);
    // the tab scrolls, not the columns
    expect(await panel.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(
      true
    );
    for (const column of [
      '.jp-MotdPanel-entries',
      '.jp-MotdPanel-notifications'
    ]) {
      expect(
        await page
          .locator(column)
          .evaluate(el => el.scrollHeight > el.clientHeight)
      ).toBe(false);
    }
  });

  test('scrolls a long notification list in its own column', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN, SECOND] } };
    hub.notifications = { status: 200, body: { notifications: manyRows(60) } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-row')).toHaveCount(60);

    const column = page.locator('.jp-MotdPanel-notifications');
    await column.hover();
    await page.mouse.wheel(0, 800);
    await expect
      .poll(() => column.evaluate(el => el.scrollTop))
      .toBeGreaterThan(0);
    expect(
      await page.locator('.jp-MotdPanel-entries').evaluate(el => el.scrollTop)
    ).toBe(0);
    expect(
      await page.locator('.jp-MotdPanel').evaluate(el => el.scrollTop)
    ).toBe(0);
    // the rows' off-screen type labels stay inside the column, so the tab has nothing to scroll
    expect(
      await page
        .locator('.jp-MotdPanel')
        .evaluate(el => el.scrollHeight - el.clientHeight)
    ).toBe(0);
  });

  test('moves the focus from the entries column to the Notifications column with Tab', async ({
    page
  }) => {
    // no heading, so the card holds no anchor link to stop on
    hub.rich = {
      status: 200,
      body: { entries: [{ ...MARKDOWN, body: 'The **GPU 0** is shared.' }] }
    };
    hub.notifications = { status: 200, body: { notifications: manyRows(60) } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-row')).toHaveCount(60);
    const focused = () =>
      page.evaluate(() => document.activeElement?.className);
    await expect.poll(focused).toBe('jp-MotdPanel-entries');

    await page.keyboard.press('Tab');
    await expect.poll(focused).toBe('jp-MotdPanel-notifications');
    await page.keyboard.press('PageDown');
    await expect
      .poll(() =>
        page.locator('.jp-MotdPanel-notifications').evaluate(el => el.scrollTop)
      )
      .toBeGreaterThan(0);
  });

  test('keeps the scroll position of a stacked tab when the palette command activates it', async ({
    page
  }) => {
    await page.setViewportSize({ width: 820, height: 600 });
    hub.rich = { status: 200, body: { entries: [MARKDOWN, SECOND] } };
    hub.notifications = { status: 200, body: { notifications: manyRows(8) } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-row')).toHaveCount(8);
    const panel = page.locator('.jp-MotdPanel-columns');
    // scrolled down to the Notifications column, with the focus taken off the entries column
    const bottom = await panel.evaluate(el => {
      el.scrollTop = el.scrollHeight - el.clientHeight;
      (document.activeElement as HTMLElement).blur();
      return el.scrollTop;
    });
    expect(bottom).toBeGreaterThan(0);

    await execute(page, 'galaxahub-motd:open');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.className))
      .toBe('jp-MotdPanel-entries');
    expect(await panel.evaluate(el => el.scrollTop)).toBe(bottom);
  });

  test('scrolls the entries column with Page Down once the tab opens', async ({
    page
  }) => {
    const notes = Array.from(
      { length: 80 },
      (_, i) => `Line ${i + 1} of the onboarding notes.`
    ).join('\n\n');
    hub.rich = {
      status: 200,
      body: { entries: [{ ...MARKDOWN, body: notes }] }
    };
    await page.goto();
    await expectOpenAndCurrent(page);
    const column = page.locator('.jp-MotdPanel-entries');
    await expect(column.locator('p').last()).toHaveText(
      'Line 80 of the onboarding notes.'
    );
    expect(await column.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(
      true
    );

    await page.keyboard.press('PageDown');
    await expect
      .poll(() => column.evaluate(el => el.scrollTop))
      .toBeGreaterThan(0);
  });

  test('keeps the width of a card when the entries column starts to scroll', async ({
    page
  }) => {
    hub.rich = {
      status: 200,
      body: {
        entries: [
          MARKDOWN,
          SECOND,
          { ...MARKDOWN, label: 'staff' },
          { ...SECOND, label: 'guests' }
        ]
      }
    };
    // narrower than the 960 px cap of a card, so the card is as wide as the column lets it be
    await page.setViewportSize({ width: 1300, height: 900 });
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(4);
    const column = page.locator('.jp-MotdPanel-entries');
    const scrolls = () =>
      column.evaluate(el => el.scrollHeight > el.clientHeight);
    expect(await scrolls()).toBe(false);
    const atRest = await box(page, '.jp-MotdPanel-section >> nth=0');

    await page.setViewportSize({ width: 1300, height: 420 });
    await expect.poll(scrolls).toBe(true);
    const scrolling = await box(page, '.jp-MotdPanel-section >> nth=0');
    expect(scrolling.width).toBe(atRest.width);
  });

  test('caps a card at 960 px in a wide tab', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    hub.notifications = { status: 200, body: { notifications: manyRows(1) } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(1);
    const column = await box(page, '.jp-MotdPanel-entries');
    expect(column.width).toBeGreaterThan(1000);
    // clientWidth leaves out the card's 1 px border
    expect(
      await page.locator('.jp-MotdPanel-section').evaluate(el => el.clientWidth)
    ).toBe(960);
  });

  test('keeps the content close to the tab and card edges', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN, SECOND] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(2);
    const column = await box(page, '.jp-MotdPanel-entries');
    const first = await box(page, '.jp-MotdPanel-section >> nth=0');
    const second = await box(page, '.jp-MotdPanel-section >> nth=1');
    // 16 px from the column's left and top edge to the first card
    expect(first.x - column.x).toBeCloseTo(16, 0);
    expect(first.y - column.y).toBeCloseTo(16, 0);
    // 12 px between two cards
    expect(second.y - (first.y + first.height)).toBeCloseTo(12, 0);
    // the markdown starts 12 px inside the card's 1 px border
    const heading = await box(page, '.jp-MotdPanel-body h1');
    expect(heading.x - first.x).toBeCloseTo(13, 0);
  });

  test('shows no Notifications column and full-width cards without a notifications URL', async ({
    page
  }) => {
    // the server puts in the page config whether c.GalaxaHubMotd.notifications_api_url is set;
    // this lab sets it, so the page is served with the value of a lab that does not
    await page.route('**/lab**', async route => {
      if (route.request().resourceType() !== 'document') {
        return route.fallback();
      }
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /"galaxahubMotdNotifications":\s*true/,
        '"galaxahubMotdNotifications": false'
      );
      await route.fulfill({ response, body: html });
    });
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    hub.notifications = { status: 200, body: { notifications: manyRows(4) } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(1);
    await expect(page.locator('.jp-MotdPanel-notifications')).toBeHidden();

    const tabBox = await box(page, '.jp-MotdPanel');
    const column = await box(page, '.jp-MotdPanel-entries');
    const card = await box(page, '.jp-MotdPanel-section');
    // the entries column is as wide as the tab, inside the tab's border
    expect(tabBox.width - column.width).toBeLessThanOrEqual(2);
    // the card fills the column inside its 16 px padding and the room kept for the column's
    // scrollbar, past the 960 px cap of a two-column tab
    const inside = await page
      .locator('.jp-MotdPanel-entries')
      .evaluate(el => el.clientWidth);
    expect(card.width).toBeCloseTo(inside - 32, 0);
    expect(card.width).toBeGreaterThan(960);
  });
});

test.describe('html page frame', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const SHORT =
    '<!doctype html><h1>Package welcome</h1><p>Read the onboarding notebook first.</p>';

  /**
   * The frame of the html entry with this label.
   */
  const frameOf = (page: IJupyterLabPageFixture, label = HTML.label) =>
    page.locator(
      `.jp-MotdPanel-section[data-label="${label}"] .jp-MotdPanel-frame`
    );

  /**
   * The hub serves a package on the lab's own origin, where the frame can read its page; the
   * lab under test has no /hub route, so the browser's package requests are answered by the
   * stub hub, once `hold` resolves.
   */
  async function servePackages(
    page: IJupyterLabPageFixture,
    hold?: Promise<void>
  ) {
    await page.route('**/hub/api/extensions/motd/rich/*/**', async route => {
      await hold;
      const { pathname } = new URL(route.request().url());
      await route.fulfill({
        response: await route.fetch({
          url: `http://127.0.0.1:${STUB_PORT}${pathname}`
        })
      });
    });
  }

  /**
   * The frame's height, and its page's root height, scroll height and viewport height. The
   * height of a fitted frame is given as at device scale 1: the page's height, 2 px of borders,
   * and the whole px between the page and the frame's inner edge, where half a px or less
   * counts as none. On a scaled display (MOTD_DEVICE_SCALE) a border is not a whole px.
   */
  function heights(frame: Locator) {
    return frame.evaluate(el => {
      const root = (el as HTMLIFrameElement).contentDocument!.documentElement;
      const style = getComputedStyle(el);
      const inner =
        el.getBoundingClientRect().height -
        parseFloat(style.borderTopWidth) -
        parseFloat(style.borderBottomWidth);
      const page = root.offsetHeight;
      return {
        frame: (el as HTMLElement).style.height
          ? page +
            2 +
            Math.ceil(inner - root.getBoundingClientRect().height - 0.5)
          : (el as HTMLElement).offsetHeight,
        page,
        scroll: root.scrollHeight,
        viewport: root.clientHeight
      };
    });
  }

  /**
   * Wait until the frame is its page's height plus its 2 px of borders, below the 480 px box.
   */
  async function expectFitted(frame: Locator) {
    await expect
      .poll(async () => {
        const { frame: height, page } = await heights(frame);
        return height < 480 && height - page;
      })
      .toBe(2);
  }

  /**
   * The mouse wheel over the frame scrolls the page inside it.
   */
  async function expectScrollsInside(
    page: IJupyterLabPageFixture,
    frame: Locator
  ) {
    await frame.hover();
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() =>
        frame.evaluate(
          el =>
            (el as HTMLIFrameElement).contentDocument!.scrollingElement!
              .scrollTop
        )
      )
      .toBeGreaterThan(0);
  }

  test('fits the frame to a short page', async ({ page }) => {
    hub.pages.set(HTML.url, SHORT);
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);

    await expectFitted(frameOf(page));
  });

  test('fits the frame again when its page grows after load', async ({
    page
  }) => {
    hub.pages.set(
      HTML.url,
      '<!doctype html><details><summary id="more">Onboarding steps</summary><div style="height:300px">Step one</div></details>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await expectFitted(frame);
    const closed = await heights(frame);

    await page.frameLocator('.jp-MotdPanel-frame').locator('#more').click();
    await expect
      .poll(async () => (await heights(frame)).page)
      .toBeGreaterThan(closed.page + 250);
    await expectFitted(frame);
  });

  test('fits the frame again when its text wraps after the tab narrows', async ({
    page
  }) => {
    const sentence =
      'The lab restarts tonight for maintenance, and every running kernel stops. ';
    hub.pages.set(HTML.url, `<!doctype html><p>${sentence.repeat(12)}</p>`);
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await expectFitted(frame);
    const wide = await heights(frame);
    const wideWidth = await frame.evaluate(el => el.clientWidth);

    // 140 px off the tab keeps both columns and narrows the entries column
    await page.setViewportSize({ width: 1300, height: 900 });
    await expect
      .poll(() => frame.evaluate(el => el.clientWidth))
      .toBeLessThan(wideWidth);
    await expect
      .poll(async () => (await heights(frame)).page)
      .toBeGreaterThan(wide.page);
    await expectFitted(frame);
  });

  test('fits the frame to a page that loaded behind another tab once the tab is shown', async ({
    page
  }) => {
    hub.pages.set(HTML.url, SHORT);
    hub.rich = { status: 200, body: { entries: [HTML] } };
    let release!: () => void;
    await servePackages(
      page,
      new Promise<void>(resolve => (release = resolve))
    );
    await page.goto();
    await expectOpenAndCurrent(page);

    // a Launcher takes the main area before the package page arrives
    await execute(page, 'launcher:create');
    await expect(page.locator('.jp-MotdPanel')).toBeHidden();
    release();
    const frame = frameOf(page);
    await loaded(page, frame);
    expect((await heights(frame)).frame).toBe(0);

    await page.evaluate(() =>
      (window as any).jupyterapp.shell.activateById('galaxahub-motd')
    );
    await expectFitted(frame);
  });

  test('fits the frame to a tall page in quirks mode', async ({ page }) => {
    // no doctype: the page renders in quirks mode, where the body holds the viewport height
    hub.pages.set(HTML.url, '<div style="height:700px">Package welcome</div>');
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);

    // 700 px block + 8 px body margin above and below + 2 px of frame borders
    await expect.poll(async () => (await heights(frame)).frame).toBe(718);
    expect(
      await frame.evaluate(
        el => (el as HTMLIFrameElement).contentDocument!.compatMode
      )
    ).toBe('BackCompat');
  });

  test('fits the frame to a page whose content reaches past its root', async ({
    page
  }) => {
    hub.pages.set(
      HTML.url,
      '<!doctype html><style>html{margin:20px}</style><div style="height:700px">Package welcome</div>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);

    // 716 px root (700 px block + 16 px body margins) + 40 px html margin + 2 px of frame borders
    await expect.poll(async () => (await heights(frame)).frame).toBe(758);
    const { scroll, viewport } = await heights(frame);
    expect(scroll).toBe(viewport);
  });

  test('fits the frame again when its page grows by exactly the content past its root', async ({
    page
  }) => {
    hub.pages.set(
      HTML.url,
      '<!doctype html><style>html{margin:20px}</style><details><summary id="more">Onboarding steps</summary><div style="height:40px">Step one</div></details>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    // root + 40 px html margin + 2 px of frame borders
    const pastRoot = async () => {
      const { frame: height, page: root } = await heights(frame);
      return height - root;
    };
    await expect.poll(pastRoot).toBe(42);
    const closed = await heights(frame);

    // the opened block is as tall as the html margin, so the new root equals the old viewport
    await page.frameLocator('.jp-MotdPanel-frame').locator('#more').click();
    await expect
      .poll(async () => (await heights(frame)).page)
      .toBe(closed.page + 40);
    await expect.poll(pastRoot).toBe(42);
  });

  test('fits the frame again when content appears below the body of a fitted page', async ({
    page
  }) => {
    // the opened block is positioned below the body, so the root keeps its height; the page's
    // own scrollbar is what reports that it now scrolls
    hub.pages.set(
      HTML.url,
      '<!doctype html><style>body{margin:0;position:relative}</style><details><summary id="more">Menu</summary>' +
        '<div style="position:absolute;top:100%;width:50px;height:60px">Entry</div></details>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await expectFitted(frame);

    await page.frameLocator('.jp-MotdPanel-frame').locator('#more').click();
    // root + the 60 px block + 2 px of frame borders
    await expect
      .poll(async () => {
        const { frame: height, page: root } = await heights(frame);
        return height - root;
      })
      .toBe(62);
    const { scroll, viewport } = await heights(frame);
    expect(scroll).toBe(viewport);
  });

  test('keeps the 480 px box and scrolls inside it for a page with html and body height 100%', async ({
    page
  }) => {
    hub.pages.set(
      HTML.url,
      '<!doctype html><style>html,body{height:100%;margin:0}</style><div style="height:1000px">Package welcome</div>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await loaded(page, frame);

    const { frame: height, scroll, viewport } = await heights(frame);
    expect(height).toBe(480);
    expect(scroll).toBeGreaterThan(viewport);
    await expectScrollsInside(page, frame);
  });

  test('fits a page whose script adds lines of one height', async ({
    page
  }) => {
    hub.pages.set(
      HTML.url,
      '<!doctype html><style>body{margin:0}p{margin:0;height:20px}</style><div id="log"></div><script>' +
        'let lines = 0; const add = () => { document.getElementById("log").appendChild(document.createElement("p"));' +
        ' if (++lines < 6) { setTimeout(add, 100); } }; add();</script>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await loaded(page, frame);

    await expect.poll(async () => (await heights(frame)).page).toBe(120);
    // the page's height plus the 2 px of borders
    await expect
      .poll(async () => {
        const { frame: height, page: root } = await heights(frame);
        return height - root;
      })
      .toBe(2);
    const { scroll, viewport } = await heights(frame);
    expect(scroll).toBe(viewport);
  });

  test('leaves no scrollbar in the frame of a page that grows and whose height follows its width', async ({
    page
  }) => {
    // the opened block is half as tall as it is wide. The fitted page overflows when it grows,
    // and the scrollbar it then gets makes it narrower and so shorter
    hub.pages.set(
      HTML.url,
      '<!doctype html><style>body{margin:0}</style><details><summary>More</summary>' +
        '<div style="aspect-ratio:2/1">Package welcome</div></details>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await loaded(page, frame);
    await expectFitted(frame);
    const closed = (await heights(frame)).page;

    await page.frameLocator('.jp-MotdPanel-frame').locator('summary').click();
    await expect
      .poll(async () => (await heights(frame)).page)
      .toBeGreaterThan(closed + 200);
    // the page is as wide as the frame's window: no scrollbar takes width from it
    await expect
      .poll(() =>
        frame.evaluate(el => {
          const inner = (el as HTMLIFrameElement).contentWindow!;
          return inner.innerWidth - inner.document.documentElement.clientWidth;
        })
      )
      .toBe(0);
    const {
      frame: height,
      page: root,
      scroll,
      viewport
    } = await heights(frame);
    expect(height).toBe(root + 2);
    expect(scroll).toBe(viewport);
  });

  test('leaves no scrollbar in the frame after the tab becomes taller', async ({
    page
  }) => {
    // the block is half as tall as it is wide. In the short window the entries column scrolls
    // and in the taller one it does not; the column keeps its scrollbar's room in both
    hub.pages.set(
      HTML.url,
      '<!doctype html><style>body{margin:0}</style><div style="aspect-ratio:2/1">Package welcome</div>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.setViewportSize({ width: 1440, height: 420 });
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await loaded(page, frame);
    const scrolls = () =>
      page
        .locator('.jp-MotdPanel-entries')
        .evaluate(el => el.scrollHeight > el.clientHeight);
    await expect.poll(scrolls).toBe(true);
    await expect
      .poll(async () => {
        const { frame: height, page: root } = await heights(frame);
        return height - root;
      })
      .toBe(2);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(scrolls).toBe(false);
    // the page is as wide as the frame's window: no scrollbar takes width from it
    await expect
      .poll(() =>
        frame.evaluate(el => {
          const inner = (el as HTMLIFrameElement).contentWindow!;
          return inner.innerWidth - inner.document.documentElement.clientWidth;
        })
      )
      .toBe(0);
    const {
      frame: height,
      page: root,
      scroll,
      viewport
    } = await heights(frame);
    expect(height).toBe(root + 2);
    expect(scroll).toBe(viewport);
  });

  /**
   * Make the window shorter and then taller in 2 px steps across the height at which
   * `scroller` starts to scroll, and expect the frame fitted with no scrollbar and nothing to
   * scroll at every step.
   */
  async function expectFittedAcrossScrollStart(
    page: IJupyterLabPageFixture,
    frame: Locator,
    scroller: string,
    width: number
  ) {
    const drawn = () =>
      page.evaluate(async () => {
        for (let i = 0; i < 4; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      });
    const state = () =>
      frame.evaluate((el, selector) => {
        const inner = (el as HTMLIFrameElement).contentWindow!;
        const view = inner.document.scrollingElement!;
        const outer = document.querySelector(selector)!;
        return {
          fitted: !!(el as HTMLElement).style.height,
          scrollbar: inner.innerWidth - view.clientWidth,
          scrolls: view.scrollHeight - view.clientHeight,
          outerScrolls: outer.scrollHeight > outer.clientHeight
        };
      }, scroller);
    // the window height at which the scroller is as tall as its content
    await page.setViewportSize({ width, height: 400 });
    await drawn();
    const start = await page
      .locator(scroller)
      .evaluate(el => el.scrollHeight + window.innerHeight - el.clientHeight);
    const steps: number[] = [];
    for (let height = start + 40; height >= start - 30; height -= 2) {
      steps.push(height);
    }
    for (let height = start - 29; height <= start + 40; height += 2) {
      steps.push(height);
    }
    const outerScrolls = new Set<boolean>();
    for (const height of steps) {
      await page.setViewportSize({ width, height });
      await drawn();
      const { outerScrolls: scrolls, ...fit } = await state();
      expect(fit, `window height ${height}`).toEqual({
        fitted: true,
        scrollbar: 0,
        scrolls: 0
      });
      outerScrolls.add(scrolls);
    }
    // the steps crossed the height at which the scroller starts to scroll
    expect(outerScrolls.size).toBe(2);
  }

  // the block is half as tall as it is wide
  const RATIO =
    '<!doctype html><style>body{margin:0}</style><div style="aspect-ratio:2/1">Package welcome</div>';

  test('leaves no scrollbar in the frame while the tab height changes in 2 px steps', async ({
    page
  }) => {
    hub.pages.set(HTML.url, RATIO);
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await loaded(page, frame);

    await expectFittedAcrossScrollStart(
      page,
      frame,
      '.jp-MotdPanel-entries',
      1440
    );
  });

  test('leaves no scrollbar in the frame while the height of a stacked tab changes in 2 px steps', async ({
    page
  }) => {
    hub.pages.set(HTML.url, RATIO);
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await loaded(page, frame);

    await expectFittedAcrossScrollStart(
      page,
      frame,
      '.jp-MotdPanel-columns',
      820
    );
  });

  test('fits a page that shows a scrollbar by its own rule', async ({
    page
  }) => {
    // the scrollbar stays, and the page is as tall as it is wide with the scrollbar beside it
    hub.pages.set(
      HTML.url,
      '<!doctype html><style>html{overflow-y:scroll}body{margin:0}</style>' +
        '<div style="aspect-ratio:1/1">Package welcome</div>'
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = frameOf(page);
    await loaded(page, frame);

    await expect
      .poll(async () => {
        const { frame: height, page: root } = await heights(frame);
        return root > 480 && height - root;
      })
      .toBe(2);
    const { scroll, viewport } = await heights(frame);
    expect(scroll).toBe(viewport);
  });

  test('keeps the 480 px box for a page of only absolute or fixed content, the absolute one scrolling inside it', async ({
    page
  }) => {
    const absolute = {
      label: 'absolute',
      kind: 'html',
      url: '/hub/api/extensions/motd/rich/pkg-absolute/index.html'
    };
    const fixed = {
      label: 'fixed',
      kind: 'html',
      url: '/hub/api/extensions/motd/rich/pkg-fixed/index.html'
    };
    // the default 8 px body margin: the root is 8 px tall and holds none of the content
    hub.pages.set(
      absolute.url,
      '<!doctype html><div style="position:absolute;top:0;left:0;right:0"><div style="height:1000px">Package welcome</div></div>'
    );
    hub.pages.set(
      fixed.url,
      '<!doctype html><div style="position:fixed;inset:0;display:grid;place-items:center"><div id="card" style="height:300px">Package welcome</div></div>'
    );
    hub.rich = { status: 200, body: { entries: [absolute, fixed] } };
    await servePackages(page);
    await page.goto();
    await expectOpenAndCurrent(page);

    const absoluteFrame = frameOf(page, absolute.label);
    await loaded(page, absoluteFrame);
    const { frame, scroll, viewport } = await heights(absoluteFrame);
    expect(frame).toBe(480);
    expect(scroll).toBeGreaterThan(viewport);
    await expectScrollsInside(page, absoluteFrame);

    const fixedFrame = frameOf(page, fixed.label);
    await loaded(page, fixedFrame);
    expect((await heights(fixedFrame)).frame).toBe(480);
    // the card lies inside the frame's viewport
    const [top, bottom, height] = await fixedFrame.evaluate(el => {
      const doc = (el as HTMLIFrameElement).contentDocument!;
      const card = doc.getElementById('card')!.getBoundingClientRect();
      return [card.top, card.bottom, doc.documentElement.clientHeight];
    });
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(height);
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

  test('an open tab closes when a pull finds no entry, and the command does not reopen it', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    hub.notifications = {
      status: 200,
      body: { notifications: [row('maintenance tonight', 5)] }
    };
    await page.goto();
    await expectOpenAndCurrent(page);
    hub.rich = { status: 200, body: { entries: [] } };
    await execute(page, 'galaxahub-motd:open');
    await expect(tab(page)).toHaveCount(0);
    await execute(page, 'galaxahub-motd:open');
    await expect(tab(page)).toHaveCount(0);
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

  test('reopenOnBroadcast reopens the tab for a recorded broadcast and leaves the focus in the editor', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await page.activity.closePanel(TAB);
    await expect(tab(page)).toHaveCount(0);

    // the user types in an editor while the broadcast arrives
    await page.evaluate(async () => {
      await (window as any).jupyterapp.commands.execute(
        'fileeditor:create-new',
        { cwd: '' }
      );
    });
    const editor = page.locator('.jp-FileEditor .cm-content');
    await editor.click();
    await page.keyboard.type('before ');

    const message = 'Broadcast: maintenance at 22:00 UTC';
    hub.record(row(message, 0, 'warning'));
    await execute(page, 'apputils:notify', { message, type: 'warning' });

    await expect(tab(page)).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('.jp-MotdPanel-message').first()).toHaveText(
      message
    );
    // the tab opened behind the editor, which kept the keyboard
    await page.keyboard.type('after');
    await expect(editor).toHaveText('before after');
    expect(
      await page.evaluate(
        () => (window as any).jupyterapp.shell.currentWidget?.title.label
      )
    ).not.toBe(TAB);
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

test.describe('local page', () => {
  // the lab's fallback_html is MOTD_LOCAL_PAGE (playwright.config.js); each test writes it
  const page_ = process.env.MOTD_LOCAL_PAGE!;
  const logo = path.join(path.dirname(page_), 'logo.svg');

  test.beforeEach(() => {
    fs.mkdirSync(path.dirname(page_), { recursive: true });
    fs.writeFileSync(
      page_,
      '<!doctype html><html><body><h1>Local welcome</h1><img src="logo.svg" width="40" height="40"></body></html>'
    );
    fs.writeFileSync(
      logo,
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>'
    );
  });

  test.afterEach(() => {
    fs.rmSync(path.dirname(page_), { recursive: true, force: true });
  });

  async function expectLocalPage(page: IJupyterLabPageFixture) {
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(1);
    await expect(
      page.locator('.jp-MotdPanel-strip .jp-MotdPanel-heading')
    ).toHaveText(TAB);
    const frame = page.locator('.jp-MotdPanel-frame');
    await expect(frame).toHaveAttribute('sandbox', SANDBOX_WITH_SCRIPTS);
    await loaded(page, frame);
    const content = page.frameLocator('.jp-MotdPanel-frame');
    await expect(content.locator('h1')).toHaveText('Local welcome');
    // the image beside the page loads through the same route
    await expect
      .poll(() =>
        content
          .locator('img')
          .evaluate(el => (el as HTMLImageElement).naturalWidth)
      )
      .toBe(40);
    // sized to fit the page, not the 480 px box
    expect(await frame.evaluate(el => el.clientHeight)).toBeLessThan(480);
  }

  test('opens the tab with the local page when the hub holds no entry, notifications as before', async ({
    page
  }) => {
    hub.notifications = {
      status: 200,
      body: { notifications: [row('maintenance tonight', 5)] }
    };
    await page.goto();
    await expectLocalPage(page);
    await expect(
      page.locator('.jp-MotdPanel-row .jp-MotdPanel-message')
    ).toHaveText(['maintenance tonight']);
  });

  test('opens the tab with the local page when the hub is unreachable', async ({
    page
  }) => {
    await hub.stop();
    await page.goto();
    await expectLocalPage(page);
    await expect(page.locator('.jp-MotdPanel-empty')).toHaveText(
      'No notifications'
    );
  });

  test('shows the hub entries, not the local page, when the hub holds one', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(page.locator('.jp-MotdPanel-section')).toHaveCount(1);
    await expect(page.locator('.jp-MotdPanel-frame')).toHaveCount(0);
  });

  test('runs a script in the local page', async ({ page }) => {
    // the lab server itself serves this page, with its own headers
    fs.writeFileSync(page_, SCRIPT_PAGE);
    await page.goto();
    await expectOpenAndCurrent(page);
    await expect(
      page.frameLocator('.jp-MotdPanel-frame').locator('#js')
    ).toHaveText('script ran');
  });
});

test.describe('built-in page', () => {
  test('the tab renders the built-in page with the version, sized to fit', async ({
    page
  }) => {
    // this lab names a local page, so the rich answer a lab without one gives is served here
    // the lab adds a cache-busting query to every GET
    await page.route(
      /\/jupyterlab-galaxahub-motd-extension\/rich(\?|$)/,
      route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            entries: [
              {
                label: TAB,
                kind: 'html',
                url: '/jupyterlab-galaxahub-motd-extension/about/index.html'
              }
            ]
          })
        })
    );
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = page.locator('.jp-MotdPanel-frame');
    await loaded(page, frame);
    const content = page.frameLocator('.jp-MotdPanel-frame');
    await expect(content.locator('h1')).toHaveText('Message of the day');
    // the installed version: package.json and the Python package carry the same one
    const { version } = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8')
    );
    await expect(content.locator('body')).toContainText(
      `jupyterlab_galaxahub_motd_extension ${version}`
    );
    await expect(content.locator('body')).toContainText(
      'c.GalaxaHubMotd.fallback_html'
    );
    // fitted to the page: the frame shows it whole and does not scroll inside
    const [client, scroll] = await frame.evaluate(el => {
      const root = (el as HTMLIFrameElement).contentDocument!.documentElement;
      return [root.clientHeight, root.scrollHeight];
    });
    expect(scroll).toBeLessThanOrEqual(client);
  });
});

test.describe('open on start off for the lab', () => {
  test('the page config switch keeps the tab closed on start, the command opens it', async ({
    page
  }) => {
    await page.route('**/lab**', async route => {
      if (route.request().resourceType() !== 'document') {
        return route.fallback();
      }
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /"galaxahubMotdOpenOnStart":\s*true/,
        '"galaxahubMotdOpenOnStart": false'
      );
      await route.fulfill({ response, body: html });
    });
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expect.poll(() => hub.count(RICH)).toBeGreaterThan(0);
    await page.waitForTimeout(2000);
    await expect(tab(page)).toHaveCount(0);
    await execute(page, 'galaxahub-motd:open');
    await expectOpenAndCurrent(page);
  });
});

test.describe('scripts off for the lab', () => {
  test('the page config switch off runs no script', async ({ page }) => {
    await page.route('**/lab**', async route => {
      if (route.request().resourceType() !== 'document') {
        return route.fallback();
      }
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /"galaxahubMotdHtmlAllowScripts":\s*true/,
        '"galaxahubMotdHtmlAllowScripts": false'
      );
      await route.fulfill({ response, body: html });
    });
    await page.route(
      '**/hub/api/extensions/motd/rich/pkg-1/index.html',
      route =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: SCRIPT_PAGE
        })
    );
    hub.rich = { status: 200, body: { entries: [HTML] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    const frame = page.locator('.jp-MotdPanel-frame');
    await expect(frame).toHaveAttribute(
      'sandbox',
      'allow-same-origin allow-popups allow-popups-to-escape-sandbox'
    );
    await loaded(page, frame);
    await expect(
      page.frameLocator('.jp-MotdPanel-frame').locator('#js')
    ).toHaveText('no script ran');
  });
});

test.describe('once per server start', () => {
  test('a reload opens no tab, a new server start opens it', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);

    // the same server start: the page pulls again and opens no tab
    const pulls = hub.count(RICH);
    await page.reload();
    await expect.poll(() => hub.count(RICH)).toBeGreaterThan(pulls);
    await page.waitForTimeout(2000);
    await expect(tab(page)).toHaveCount(0);
    await execute(page, 'galaxahub-motd:open');
    await expectOpenAndCurrent(page);

    // the server started again: the page config carries another start
    await page.route('**/lab**', async route => {
      if (route.request().resourceType() !== 'document') {
        return route.fallback();
      }
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /"galaxahubMotdServerStart":\s*"[^"]*"/,
        '"galaxahubMotdServerStart": "another start"'
      );
      await route.fulfill({ response, body: html });
    });
    await page.reload();
    await expectOpenAndCurrent(page);
  });
});

test.describe('tab label', () => {
  test('the tab carries the label of the lab page config', async ({ page }) => {
    // the server puts c.GalaxaHubMotd.label in the page config; this lab runs the default, so
    // the page is served with another value in its place
    await page.route('**/lab**', async route => {
      if (route.request().resourceType() !== 'document') {
        // fallback, not continue: the settings and state requests go on to galata's own mocks
        return route.fallback();
      }
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /"galaxahubMotdLabel":\s*"Message of the day"/,
        '"galaxahubMotdLabel": "Welcome to the lab"'
      );
      await route.fulfill({ response, body: html });
    });
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expect(page.activity.getTabLocator('Welcome to the lab')).toHaveCount(
      1
    );
    await expect(tab(page)).toHaveCount(0);
  });

  test('the tab shows the blue info icon before its label', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    await page.goto();
    await expectOpenAndCurrent(page);
    const icon = tab(page).locator(
      'svg[data-icon="jupyterlab_galaxahub_motd_extension:tab"]'
    );
    await expect(icon).toBeVisible();
    const iconBox = (await icon.boundingBox())!;
    const labelBox = (await tab(page)
      .locator('.lm-TabBar-tabLabel')
      .boundingBox())!;
    expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(labelBox.x);
    // drawn as lines in the lab's brand colour, with no fill
    const paint = await icon.locator('g').evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--jp-brand-color1)';
      document.body.appendChild(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      const style = getComputedStyle(el);
      return { fill: style.fill, stroke: style.stroke, brand };
    });
    expect(paint.fill).toBe('none');
    expect(paint.stroke).toBe(paint.brand);
    // the stock light theme's brand colour is blue
    expect(paint.brand).toBe('rgb(25, 118, 210)');
  });
});

/**
 * The installed jupyterlab-galaxahub-motd, spawned as a lab terminal would run it. `env`
 * entries override the worker's environment; an undefined entry removes the variable.
 */
function motdCli(
  args: string[],
  env: Record<string, string | undefined>
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) {
      delete childEnv[name];
    }
  }
  return new Promise(resolve => {
    const child = spawn('jupyterlab-galaxahub-motd', args, { env: childEnv });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => (stdout += data));
    child.stderr.on('data', data => (stderr += data));
    child.on('error', error =>
      resolve({ code: null, stdout, stderr: `spawn failed: ${error}` })
    );
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test.describe('command line', () => {
  // the suite's lab takes the hub URLs from --config jupyter_server_test_config.py on its
  // command line; the CLI has no other source for them, so a stub hit proves it asked the lab
  test('the CLI reads the hub through the URLs the running lab holds', async ({
    baseURL
  }) => {
    hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
    const run = await motdCli(['rich', '--json'], {
      JUPYTER_SERVER_URL: `${baseURL}/`
    });
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    // the CLI emits the label, the kind and the body; the hub's group is not passed on
    const { label, kind, body } = MARKDOWN;
    expect(JSON.parse(run.stdout)).toEqual({
      entries: [{ label, kind, body }]
    });
    expect(hub.count(RICH)).toBe(1);
  });

  test('the startup script line prints the terminal text, and nothing without a motd', async ({
    baseURL
  }) => {
    const env = { JUPYTER_SERVER_URL: `${baseURL}/` };
    const run = await motdCli(['terminal'], env);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(TERMINAL_TEXT);
    hub.rich = { status: 404, body: { message: 'Not Found' } };
    const none = await motdCli(['rich'], env);
    expect(none.code).toBe(1);
    expect(none.stdout).toBe('');
  });

  test('the CLI lists notifications as far back as the lab notificationWindow setting', async ({
    baseURL,
    request
  }) => {
    hub.notifications = {
      status: 200,
      body: { notifications: [row('yesterday', 25 * 60), row('newest', 5)] }
    };
    const env = { JUPYTER_SERVER_URL: `${baseURL}/` };
    const listed = async () => {
      const run = await motdCli(['notifications'], env);
      expect(run.stderr).toBe('');
      return run.stdout
        .trim()
        .split('\n')
        .map(line => line.split('\t')[3]);
    };
    expect(await listed()).toEqual(['newest']);
    // the lab server's own settings store, where the Settings Editor writes
    const settings = `${baseURL}/lab/api/settings/${PLUGIN}`;
    const stored = await request.put(settings, {
      data: { raw: '{"notificationWindow": "3d"}' }
    });
    expect(stored.ok()).toBe(true);
    try {
      expect(await listed()).toEqual(['newest', 'yesterday']);
    } finally {
      await request.put(settings, { data: { raw: '{}' } });
    }
  });

  test('without the lab server URL the CLI exits 4 and asks no hub', async () => {
    const run = await motdCli(['show'], { JUPYTER_SERVER_URL: undefined });
    expect(run.code).toBe(4);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('JUPYTER_SERVER_URL is not set');
    expect(hub.count(RICH) + hub.count(NOTIFICATIONS)).toBe(0);
  });
});
