/**
 * Clearing the Notifications column in the lab against a stub hub and the lab's own settings
 * store: the Clear and Remove buttons (ACC-VIEW-94-CLEAR-ALL), the rows that stay away
 * (ACC-VIEW-96-STAY-CLEARED) and the CLI that reads the same setting (ACC-CLI-100-CLEARED).
 */
import { IJupyterLabPageFixture, expect, test } from '@jupyterlab/galata';

import { APIRequestContext } from '@playwright/test';

import { spawn } from 'child_process';

import * as path from 'path';

import { StubHub } from './stub-hub';

// the tab label the suite's lab config sets (jupyter_server_test_config.py)
const TAB = 'Message of the day';
const PLUGIN = '@stellarshenson/jupyterlab-galaxahub-motd-extension:plugin';
const SHOTS = path.resolve(
  __dirname,
  '..',
  '..',
  'tmp',
  'workflows',
  'motd-clear-1',
  'shots'
);
const hub = new StubHub(Number(process.env.MOTD_STUB_PORT!));

// no heading, so the card holds no anchor link to stop on
const MARKDOWN = {
  group: 'grp-analysts',
  label: 'analysts',
  kind: 'markdown',
  body: 'The **GPU 0** is shared.'
};

const row = (message: string, minutes: number) => ({
  ts: new Date(Date.now() - minutes * 60_000).toISOString(),
  message,
  type: 'info',
  audience: 'all'
});

const key = (r: { ts: string; message: string }) => `${r.ts}\n${r.message}`;

test.use({
  autoGoto: false,
  // the tab saves the cleared rows in the lab's own settings store, which galata mocks by default
  mockSettings: false,
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
  hub.rich = { status: 200, body: { entries: [MARKDOWN] } };
});

// no test leaks its cleared rows into another: the page closes first, so no save of it comes
// after the reset
test.afterEach(async ({ baseURL, page, request }) => {
  await page.close();
  await request.put(`${baseURL}/lab/api/settings/${PLUGIN}`, {
    data: { raw: '{}' }
  });
});

async function openTab(page: IJupyterLabPageFixture) {
  await page.goto();
  await expect(page.activity.getTabLocator(TAB)).toHaveCount(1);
}

function execute(page: IJupyterLabPageFixture, command: string) {
  return page.evaluate(
    name => (window as any).jupyterapp.commands.execute(name),
    command
  );
}

const column = (page: IJupyterLabPageFixture) =>
  page.locator('.jp-MotdPanel-notifications');

const messages = (page: IJupyterLabPageFixture) =>
  column(page).locator('.jp-MotdPanel-message');

const clearButton = (page: IJupyterLabPageFixture) =>
  column(page).getByRole('button', { name: 'Clear all notifications' });

const removeButton = (page: IJupyterLabPageFixture, message: string) =>
  column(page).getByRole('button', { name: `Remove notification: ${message}` });

/**
 * What the lab's settings store holds, where the tab writes and the CLI reads.
 */
async function stored(
  request: APIRequestContext,
  baseURL?: string,
  setting = 'clearedNotifications'
) {
  const answer = await request.get(`${baseURL}/lab/api/settings/${PLUGIN}`);
  return (await answer.json()).settings[setting];
}

/**
 * Hold each settings request of this extension for the given time.
 */
function slowSettings(page: IJupyterLabPageFixture, ms: number) {
  return page.route(/lab\/api\/settings\/.*galaxahub-motd/, async route => {
    await new Promise(resolve => setTimeout(resolve, ms));
    await route.fallback();
  });
}

/**
 * The installed jupyterlab-galaxahub-motd, spawned as a lab terminal would run it.
 */
function motdCli(
  args: string[],
  baseURL?: string
): Promise<{ code: number | null; stdout: string }> {
  const env = { ...process.env, JUPYTER_SERVER_URL: `${baseURL}/` };
  return new Promise(resolve => {
    const child = spawn('jupyterlab-galaxahub-motd', args, { env });
    let stdout = '';
    child.stdout.on('data', data => (stdout += data));
    child.on('close', code => resolve({ code, stdout }));
  });
}

test.describe('Clear and Remove buttons', () => {
  test('Remove takes one row away and Clear the others, and the column leaves', async ({
    baseURL,
    page,
    request
  }) => {
    const rows = [row('first', 5), row('second', 10), row('third', 15)];
    hub.notifications = { status: 200, body: { notifications: rows } };
    await openTab(page);
    await expect(messages(page)).toHaveText(['first', 'second', 'third']);

    await removeButton(page, 'second').click();
    await expect(messages(page)).toHaveText(['first', 'third']);
    await expect(column(page).locator('.jp-MotdPanel-count')).toHaveText('2');
    await expect.poll(() => stored(request, baseURL)).toEqual([key(rows[1])]);

    await clearButton(page).click();
    await expect(column(page)).toBeHidden();
    // the setting holds the keys in the order of the presses
    await expect
      .poll(() => stored(request, baseURL))
      .toEqual([rows[1], rows[0], rows[2]].map(key));
  });

  test('Tab reaches each button, Enter presses it and the focus stays in the column', async ({
    page
  }) => {
    hub.notifications = {
      status: 200,
      body: { notifications: [row('first', 5), row('second', 10)] }
    };
    await openTab(page);
    const entries = page.locator('.jp-MotdPanel-entries');
    await expect(entries).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(column(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(clearButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(removeButton(page, 'first')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(removeButton(page, 'second')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(messages(page)).toHaveText(['first']);
    await expect(removeButton(page, 'first')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(column(page)).toBeHidden();
    await expect(entries).toBeFocused();
  });

  test('a double click and a held Enter on Remove each remove one row', async ({
    page
  }) => {
    hub.notifications = {
      status: 200,
      body: {
        notifications: [
          row('first', 5),
          row('second', 10),
          row('third', 15),
          row('fourth', 20)
        ]
      }
    };
    // with two columns the next row moves up under the pointer; a stacked tab centres the column
    await page.setViewportSize({ width: 1400, height: 800 });
    await openTab(page);
    // at local latency the redraw of the save can replace the button between the second mouse
    // down and mouse up, and the browser then sends no second click
    await slowSettings(page, 300);
    const box = (await removeButton(page, 'first').boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2, {
      delay: 30
    });
    await expect(messages(page)).toHaveText(['second', 'third', 'fourth']);

    await removeButton(page, 'second').focus();
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await expect(messages(page)).toHaveText(['third', 'fourth']);
  });

  test('a double click on Remove in a stacked tab leaves Clear unpressed', async ({
    baseURL,
    page,
    request
  }) => {
    const rows = [row('line 0\nline 1', 1), row('second', 2), row('third', 3)];
    hub.notifications = { status: 200, body: { notifications: rows } };
    // when the row leaves, the title row moves down and Clear is under the pointer
    await page.setViewportSize({ width: 720, height: 800 });
    await openTab(page);
    await expect(messages(page)).toHaveCount(3);
    await slowSettings(page, 300);
    const box = (await column(page)
      .locator('.jp-MotdPanel-remove')
      .first()
      .boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2, {
      delay: 30
    });
    await expect(messages(page)).toHaveText(['second', 'third']);
    await expect.poll(() => stored(request, baseURL)).toEqual([key(rows[0])]);
  });

  test('both buttons are visible in the light and the dark theme', async ({
    page
  }) => {
    hub.notifications = {
      status: 200,
      body: {
        notifications: [
          row('maintenance tonight at 22:00', 5),
          { ...row('the disk is nearly full', 10), type: 'warning' }
        ]
      }
    };
    await openTab(page);
    const remove = removeButton(page, 'maintenance tonight at 22:00');
    await expect(clearButton(page)).toBeVisible();
    await expect(remove).toBeVisible();
    expect((await remove.boundingBox())!.width).toBeCloseTo(20, 0);
    expect((await remove.boundingBox())!.height).toBeCloseTo(20, 0);
    await column(page).screenshot({
      path: path.join(SHOTS, 'column-light.png')
    });

    await page.theme.setDarkTheme();
    try {
      await expect(clearButton(page)).toBeVisible();
      await expect(remove).toBeVisible();
      await column(page).screenshot({
        path: path.join(SHOTS, 'column-dark.png')
      });
    } finally {
      await page.theme.setLightTheme();
    }
  });
});

test.describe('cleared rows', () => {
  test('after a reload the cleared rows stay away and the lab settings hold them', async ({
    baseURL,
    page,
    request
  }) => {
    const rows = [row('first', 5), row('second', 10)];
    hub.notifications = { status: 200, body: { notifications: rows } };
    await openTab(page);
    await removeButton(page, 'first').click();
    await expect.poll(() => stored(request, baseURL)).toEqual([key(rows[0])]);

    await page.reload();
    await execute(page, 'galaxahub-motd:open');
    await expect(messages(page)).toHaveText(['second']);

    await clearButton(page).click();
    await expect.poll(() => stored(request, baseURL)).toEqual(rows.map(key));

    await page.reload();
    await execute(page, 'galaxahub-motd:open');
    await expect(page.locator('.jp-MotdPanel-entries')).toBeVisible();
    await expect(page.locator('.jp-MotdPanel-row')).toHaveCount(0);
  });

  test('a new row with the same message and a new ts is listed after Open', async ({
    baseURL,
    page,
    request
  }) => {
    const first = row('maintenance tonight', 10);
    hub.notifications = { status: 200, body: { notifications: [first] } };
    await openTab(page);
    await removeButton(page, first.message).click();
    await expect(column(page)).toBeHidden();
    await expect.poll(() => stored(request, baseURL)).toEqual([key(first)]);

    hub.record(row(first.message, 1));
    await execute(page, 'galaxahub-motd:open');
    await expect(messages(page)).toHaveText([first.message]);
    await expect(column(page).locator('.jp-MotdPanel-count')).toHaveText('1');
  });

  test('a failed save returns the rows and shows an error', async ({
    page
  }) => {
    hub.notifications = {
      status: 200,
      body: { notifications: [row('first', 5), row('second', 10)] }
    };
    await page.route(/lab\/api\/settings\/.*galaxahub-motd/, route =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, body: '{}' })
        : route.fallback()
    );
    await openTab(page);
    await removeButton(page, 'first').click();
    await expect(
      page.getByText('The cleared notifications could not be saved')
    ).toBeVisible();
    await expect(messages(page)).toHaveText(['first', 'second']);
  });

  test('quick presses in one page with a slow save store every key', async ({
    baseURL,
    page,
    request
  }) => {
    const rows = [
      row('first', 5),
      row('second', 10),
      row('third', 15),
      row('fourth', 20)
    ];
    hub.notifications = { status: 200, body: { notifications: rows } };
    await slowSettings(page, 150);
    await openTab(page);
    await expect(messages(page)).toHaveCount(4);
    // in one browser task, so no save has answered when the next press comes
    await page.evaluate(() => {
      for (const name of ['first', 'second', 'third']) {
        document
          .querySelector<HTMLElement>(
            `[aria-label="Remove notification: ${name}"]`
          )!
          .click();
      }
    });
    await expect(messages(page)).toHaveText(['fourth']);
    await expect
      .poll(() => stored(request, baseURL))
      .toEqual(rows.slice(0, 3).map(key));
  });

  test('a press in a stale second page of one lab keeps what the first page saved', async ({
    baseURL,
    page,
    request
  }) => {
    const rows = [row('first', 5), row('second', 10), row('third', 15)];
    hub.notifications = { status: 200, body: { notifications: rows } };
    await openTab(page);
    // the helpers use only the locator and evaluate members, which a plain page has too
    const stale = (await page
      .context()
      .newPage()) as unknown as IJupyterLabPageFixture;
    await stale.goto(`${baseURL}/lab/workspaces/stale`);
    await stale.waitForFunction(() =>
      (window as any).jupyterapp?.commands.hasCommand('galaxahub-motd:open')
    );
    await execute(stale, 'galaxahub-motd:open');
    await expect(messages(stale)).toHaveText(['first', 'second', 'third']);

    // a value of another setting that neither page has read, as a save in the first page leaves it
    await request.put(`${baseURL}/lab/api/settings/${PLUGIN}`, {
      data: { raw: '{"pollMinutes": 5}' }
    });
    await removeButton(page, 'first').click();
    await expect.poll(() => stored(request, baseURL)).toEqual([key(rows[0])]);

    await expect(messages(stale)).toHaveText(['first', 'second', 'third']);
    await removeButton(stale, 'second').click();
    await expect
      .poll(() => stored(request, baseURL))
      .toEqual(rows.slice(0, 2).map(key));
    await expect(messages(stale)).toHaveText(['third']);
    expect(await stored(request, baseURL, 'pollMinutes')).toBe(5);

    await page.reload();
    await execute(page, 'galaxahub-motd:open');
    await expect(messages(page)).toHaveText(['third']);
    const listed = await motdCli(['notifications', '--json'], baseURL);
    expect(
      JSON.parse(listed.stdout).notifications.map((r: any) => r.message)
    ).toEqual(['third']);
  });

  test('the CLI does not list a row cleared in the tab', async ({
    baseURL,
    page,
    request
  }) => {
    const rows = [row('first', 5), row('second', 10)];
    hub.notifications = { status: 200, body: { notifications: rows } };
    await openTab(page);
    await removeButton(page, 'first').click();
    await expect.poll(() => stored(request, baseURL)).toEqual([key(rows[0])]);

    const listed = await motdCli(['notifications', '--json'], baseURL);
    expect(listed.code).toBe(0);
    expect(
      JSON.parse(listed.stdout).notifications.map((r: any) => r.message)
    ).toEqual(['second']);

    await removeButton(page, 'second').click();
    await expect.poll(() => stored(request, baseURL)).toEqual(rows.map(key));
    const none = await motdCli(['notifications'], baseURL);
    expect(none.code).toBe(1);
    expect(none.stdout).toBe('');
  });
});
