/**
 * The Message of the day: Open command against a stub hub that is slow to answer (DEF-VIEW-41).
 */
import { IJupyterLabPageFixture, expect, test } from '@jupyterlab/galata';

import { StubHub } from './stub-hub';

// the tab label the suite's lab config sets (jupyter_server_test_config.py)
const TAB = 'Message of the day';
const RICH = 'extensions/motd/rich';
const hub = new StubHub(Number(process.env.MOTD_STUB_PORT!));

const entry = (body: string) => ({
  group: 'grp-analysts',
  label: 'analysts',
  kind: 'markdown',
  body
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

function current(page: IJupyterLabPageFixture) {
  return page.evaluate(
    () => (window as any).jupyterapp.shell.currentWidget?.title.label
  );
}

test('a tab with content becomes current at once while the hub is slow, and redraws when it answers', async ({
  page
}) => {
  hub.rich = { status: 200, body: { entries: [entry('First text.')] } };
  await page.goto();
  await expect.poll(() => current(page)).toBe(TAB);
  await page.evaluate(() =>
    (window as any).jupyterapp.commands.execute('launcher:create')
  );
  await expect.poll(() => current(page)).not.toBe(TAB);

  // the proxy waits up to 10 s for the hub, so 5 s is a slow answer, not a failed one
  hub.rich = { status: 200, body: { entries: [entry('Second text.')] } };
  hub.richDelayMs = 5000;
  const pulls = hub.count(RICH);
  // not awaited: the command returns once its pull is done
  await page.evaluate(() => {
    void (window as any).jupyterapp.commands.execute('galaxahub-motd:open');
  });
  await expect.poll(() => current(page), { timeout: 2000 }).toBe(TAB);
  const card = page.locator('.jp-MotdPanel-section');
  await expect(card).toContainText('First text.');
  await expect.poll(() => hub.count(RICH)).toBeGreaterThan(pulls);

  await expect(card).toContainText('Second text.', { timeout: 10_000 });
  expect(await current(page)).toBe(TAB);
});

test('a tab whose hub stops answering keeps its cards, and Open makes it current at once and logs no silence line', async ({
  page
}) => {
  const lines: string[] = [];
  page.on('console', message => {
    if (message.text().startsWith('Message of the day:')) {
      lines.push(message.text());
    }
  });
  hub.rich = { status: 200, body: { entries: [entry('First text.')] } };
  await page.goto();
  await expect.poll(() => current(page)).toBe(TAB);

  // the suite's local page does not exist, so a hub 404 reaches the tab as 204: the cards stay
  hub.rich = { status: 404, body: { message: 'Not Found' } };
  await page.evaluate(() =>
    (window as any).jupyterapp.commands.execute('galaxahub-motd:open')
  );
  await page.evaluate(() =>
    (window as any).jupyterapp.commands.execute('launcher:create')
  );
  await expect.poll(() => current(page)).not.toBe(TAB);

  hub.richDelayMs = 5000;
  const done = page.evaluate(() =>
    (window as any).jupyterapp.commands.execute('galaxahub-motd:open')
  );
  await expect.poll(() => current(page), { timeout: 2000 }).toBe(TAB);
  await done;
  await expect(page.locator('.jp-MotdPanel-section')).toContainText(
    'First text.'
  );
  expect(lines).toEqual([]);
});
