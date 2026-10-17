/**
 * The recipes of the authoring skill (.agents/skills/jupyterlab-galaxahub-motd-authoring) in the
 * Message of the day tab against a stub hub (docs/acc-crit.md, the AUTHOR criteria).
 *
 * The stub answers the rich route through this extension's server proxy; the browser's package
 * requests are answered here, with the Content-Security-Policy GalaxaHub 4.5.58 serves
 * (content_policy.header in galaxahub-motd-extension).
 */
import { IJupyterLabPageFixture, expect, test } from '@jupyterlab/galata';

import { StubHub } from './stub-hub';

const TAB = 'Message of the day';
const hub = new StubHub(Number(process.env.MOTD_STUB_PORT!));

// the hub's header for a post with Allow scripts on and no content policy
const DEFAULT_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; media-src 'self' data:; frame-ancestors 'self'";

// the hub's header for a post with the skill's standard content policy
const STANDARD_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; " +
  "frame-ancestors 'self'; connect-src 'self' data: blob:";

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

function markdown(label: string, body: string) {
  return { group: `grp-${label}`, label, kind: 'markdown', body };
}

function sectionOf(page: IJupyterLabPageFixture, label: string) {
  return page.locator(`.jp-MotdPanel-section[data-label="${label}"]`);
}

async function openTab(page: IJupyterLabPageFixture) {
  await page.goto();
  await expect(page.activity.getTabLocator(TAB)).toHaveCount(1);
}

// a png of 1 by 1 px
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test.describe('markdown entry', () => {
  // the arguments as the skill escapes them inside the single-quoted attribute: ' < > & $ \; a
  // plain $ or \ can start the lab's math pass, which changes the text between its markers
  const ARGS =
    '{"message": "&#36;HOME: it&#39;s &lt;ready&gt; &amp; installed in &#36;PATH &#92;&#92;(x&#92;&#92;)", "type": "success", "options": {"autoClose": false}}';
  const BODY =
    '# Install\n\n' +
    `<button class="jp-mod-styled jp-mod-accept" data-commandlinker-command="apputils:notify" data-commandlinker-args='${ARGS}'>Notify</button>\n\n` +
    `<a class="by-link" data-commandlinker-command="apputils:notify" data-commandlinker-args='${ARGS}'>Notify link</a>\n\n` +
    `<button data-commandlinker-command="apputils:notify" data-commandlinker-args='{"message": "broken'>Broken</button>\n`;

  test('a command button runs its command after the Run Command dialog', async ({
    page
  }) => {
    hub.rich = { status: 200, body: { entries: [markdown('setup', BODY)] } };
    await openTab(page);
    const section = sectionOf(page, 'setup');
    const toast = page.locator('.Toastify__toast', {
      hasText: "$HOME: it's <ready> & installed in $PATH \\(x\\)"
    });

    // the sanitizer keeps the command attributes on a button only
    await expect(section.locator('a.by-link')).not.toHaveAttribute(
      'data-commandlinker-command'
    );
    await section.locator('a.by-link').click();
    // arguments that are not JSON open no dialog
    await section.getByRole('button', { name: 'Broken' }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);

    await section.getByRole('button', { name: 'Notify' }).click();
    const dialog = page.locator('.jp-Dialog');
    await expect(dialog.locator('.jp-Dialog-header')).toHaveText(
      'Run Command?'
    );
    expect(
      await dialog.locator('.jp-Dialog-footer button').allInnerTexts()
    ).toEqual(['Cancel', 'Run']);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(toast).toHaveCount(0);

    await section.getByRole('button', { name: 'Notify' }).click();
    await dialog.getByRole('button', { name: 'Run' }).click();
    await expect(toast).toHaveCount(1);
  });

  test('keeps https and data images and opens a relative link in a new tab', async ({
    page,
    baseURL
  }) => {
    await page.route('https://example.org/**', route => route.abort());
    hub.rich = {
      status: 200,
      body: {
        entries: [
          markdown(
            'links',
            '![remote](https://example.org/remote.png)\n\n' +
              `![inline](${PIXEL})\n\n` +
              '[relative](docs/guide.md)\n'
          )
        ]
      }
    };
    await openTab(page);
    const section = sectionOf(page, 'links');

    await expect(section.locator('img[alt="remote"]')).toHaveAttribute(
      'src',
      'https://example.org/remote.png'
    );
    const inline = section.locator('img[alt="inline"]');
    await expect(inline).toHaveAttribute('src', PIXEL);
    await expect
      .poll(() =>
        inline.evaluate(img => (img as HTMLImageElement).naturalWidth)
      )
      .toBe(1);
    const link = section.getByRole('link', { name: 'relative' });
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.evaluate(a => (a as HTMLAnchorElement).href)).toBe(
      `${baseURL}/docs/guide.md`
    );
  });
});

test.describe('html package', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const URL_PATH = '/hub/api/extensions/motd/rich/0a1b2c3d/index.html';

  // each check writes its result into a data attribute of the body
  const INDEX = `<!doctype html>
<html><body>
<p>Package checks</p>
<a id="package-file" href="notes.txt" download>Package file</a>
<button id="generated-file">Generated file</button>
<img id="blob-image" alt="">
<script>document.body.dataset.inline = 'ran';</script>
<script src="app.js"></script>
</body></html>`;

  const APP = `document.body.dataset.file = 'ran';
const mark = (name, value) => { document.body.dataset[name] = value; };
fetch('data.json').then(r => r.json()).then(d => mark('fetched', d.text), () => mark('fetched', 'error'));
fetch('data:text/plain;base64,ZGVjb2RlZA==').then(r => r.text()).then(t => mark('decoded', t), () => mark('decoded', 'error'));
const canvas = document.createElement('canvas');
canvas.width = 40;
canvas.height = 20;
canvas.getContext('2d').fillRect(0, 0, 40, 20);
canvas.toBlob(blob => {
  const image = document.getElementById('blob-image');
  image.onload = () => mark('image', 'loaded');
  image.onerror = () => mark('image', 'error');
  image.src = URL.createObjectURL(blob);
});
// 0.1 s of silence as an 8 kHz, 8 bit wav
const wav = new DataView(new ArrayBuffer(844));
const text = (at, s) => [...s].forEach((c, i) => wav.setUint8(at + i, c.charCodeAt(0)));
text(0, 'RIFF'); wav.setUint32(4, 836, true); text(8, 'WAVEfmt ');
wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
wav.setUint32(24, 8000, true); wav.setUint32(28, 8000, true); wav.setUint16(32, 1, true);
wav.setUint16(34, 8, true); text(36, 'data'); wav.setUint32(40, 800, true);
for (let i = 0; i < 800; i++) wav.setUint8(44 + i, 128);
const sound = new Audio();
sound.onloadedmetadata = () => mark('sound', 'loaded');
sound.onerror = () => mark('sound', 'error');
sound.src = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
document.getElementById('generated-file').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['generated'], { type: 'text/plain' }));
  a.download = 'generated.txt';
  a.click();
});
`;

  const FILES: Record<string, [string, string]> = {
    'index.html': ['text/html', INDEX],
    'app.js': ['text/javascript', APP],
    'data.json': ['application/json', '{"text": "package data"}'],
    'notes.txt': ['text/plain', 'package notes']
  };

  /**
   * Answer the package's files as the hub does: content type by file name, the post's
   * Content-Security-Policy, nosniff.
   */
  async function servePackage(page: IJupyterLabPageFixture, policy: string) {
    await page.route('**/hub/api/extensions/motd/rich/0a1b2c3d/*', route => {
      const name = new URL(route.request().url()).pathname.split('/').pop()!;
      const file = FILES[name];
      if (!file) {
        return route.fulfill({ status: 404 });
      }
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': file[0],
          'Content-Security-Policy': policy,
          'X-Content-Type-Options': 'nosniff'
        },
        body: file[1]
      });
    });
    hub.rich = {
      status: 200,
      body: {
        entries: [
          { group: 'grp-checks', label: 'checks', kind: 'html', url: URL_PATH }
        ]
      }
    };
  }

  const pageBody = (page: IJupyterLabPageFixture) =>
    page.frameLocator('.jp-MotdPanel-frame').locator('body');

  test('the standard content policy runs scripts, reads files, shows blob images and saves downloads', async ({
    page
  }) => {
    await servePackage(page, STANDARD_POLICY);
    await openTab(page);
    const body = pageBody(page);

    await expect(body).toHaveAttribute('data-inline', 'ran');
    await expect(body).toHaveAttribute('data-file', 'ran');
    await expect(body).toHaveAttribute('data-fetched', 'package data');
    await expect(body).toHaveAttribute('data-decoded', 'decoded');
    await expect(body).toHaveAttribute('data-image', 'loaded');
    await expect(body).toHaveAttribute('data-sound', 'loaded');
    expect(
      await body
        .locator('#blob-image')
        .evaluate(img => (img as HTMLImageElement).naturalWidth)
    ).toBe(40);

    const packageFile = page.waitForEvent('download');
    await body.locator('#package-file').click();
    expect((await packageFile).suggestedFilename()).toBe('notes.txt');
    const generated = page.waitForEvent('download');
    await body.locator('#generated-file').click();
    expect((await generated).suggestedFilename()).toBe('generated.txt');
  });

  test('the hub default policy blocks blob images, blob sound and data fetches', async ({
    page
  }) => {
    await servePackage(page, DEFAULT_POLICY);
    await openTab(page);
    const body = pageBody(page);

    await expect(body).toHaveAttribute('data-file', 'ran');
    await expect(body).toHaveAttribute('data-fetched', 'package data');
    await expect(body).toHaveAttribute('data-image', 'error');
    await expect(body).toHaveAttribute('data-sound', 'error');
    await expect(body).toHaveAttribute('data-decoded', 'error');
  });
});
