/*
 * The acceptance sweep of the html frame fit (src/fit.ts): one card with one html page, in a
 * copy of the tab's elements under the extension's stylesheet, with the compiled fit and the
 * panel's observer. Every sample changes the tab's size or the page, waits until no fit runs
 * any more and reads the frame. A sample fails when the frame is not fitted, shows a vertical
 * scrollbar its page did not ask for, scrolls, ends more than half a px short of its page or
 * more than 1.6 px past it, or is still being fitted after 30 frames. Under a horizontal
 * scrollbar, whose height the browser gives in whole px only, the frame's end is known to 1 px
 * less.
 *
 *   node fit-sweep/sweep.js [--scale 1.25] [--fit ../lib/fit.js] [--css ../style/base.css]
 *                           [--only <text in "layout / page">] [--out rows.jsonl]
 *
 * Exit code 1 when a sample fails.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const SCALE = Number(option('--scale', '1'));
const FIT = path.resolve(
  option('--fit', path.join(__dirname, '../../lib/fit.js'))
);
const CSS = path.resolve(
  option('--css', path.join(__dirname, '../../style/base.css'))
);
const ONLY = option('--only', '');
const OUT = option('--out', '');

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
const paragraphs = n =>
  Array.from({ length: n }, (_, i) => `<p>${LOREM.repeat(i + 2)}</p>`).join('');

// the page classes: each one is fitted by the extension, so each sample must end fitted
const PAGES = {
  'block of a fixed height':
    '<!doctype html><style>body{margin:0}</style><div id="b" style="height:300px;background:#dde">Package welcome</div>',
  text:
    '<!doctype html><h1>Welcome to the lab</h1>' +
    paragraphs(4) +
    '<ul><li>one</li><li>two</li></ul>',
  'long text': '<!doctype html><h1>Welcome to the lab</h1>' + paragraphs(11),
  'height follows width':
    '<!doctype html><style>body{margin:0}</style><div style="aspect-ratio:2/1;background:#ccd">Package welcome</div>',
  'height follows width, with text':
    '<!doctype html><h1>Welcome</h1><div style="aspect-ratio:16/9;background:#ccd"></div><p>' +
    LOREM.repeat(5) +
    '</p>',
  'scrollbar by its own rule':
    '<!doctype html><style>html{overflow-y:scroll}body{margin:0}</style><div style="aspect-ratio:2/1;background:#ccd">Package welcome</div>',
  'body hides its horizontal overflow':
    '<!doctype html><style>body{overflow-x:hidden}</style><h1>Welcome</h1><div style="aspect-ratio:3/1;background:#ccd"></div><p>' +
    LOREM.repeat(5) +
    '</p>',
  'quirks mode':
    '<html><body><h1>Welcome</h1>' + paragraphs(5) + '</body></html>',
  'margin on the html element':
    '<!doctype html><style>html{margin:20px 20px 30.5px}</style><h1>Welcome</h1>' +
    paragraphs(3),
  'content below the body':
    '<!doctype html><style>body{margin:0;position:relative}</style><div style="height:200px">Package welcome</div><div style="position:absolute;top:100%;width:10px;height:40.3px;background:#c33"></div>',
  'wider than the frame':
    '<!doctype html><style>body{margin:0}</style><div style="width:3000px;height:300.4px;background:#dde">Package welcome</div>',
  'wide preformatted text':
    '<!doctype html><h1>Welcome</h1><pre>' +
    'x'.repeat(600) +
    '</pre><p>' +
    LOREM.repeat(6) +
    '</p>',
  table:
    '<!doctype html><h1>Welcome</h1><table border="1">' +
    `<tr><td>${LOREM}</td><td>b</td></tr>`.repeat(7) +
    '</table>',
  'pages built from a seed': '<!doctype html><html><body></body></html>'
};

// the tab layouts: [name, class on the tab, tab widths low and high, the tab width of the height
// sweep, at which a card is narrower than its 960 px cap]
const LAYOUTS = [
  ['two columns', '', 820, 1440, 1200],
  ['no Notifications column', 'jp-mod-noNotifications', 820, 1440, 1440],
  ['stacked', '', 420, 798, 760]
];

const outer = (css, tabClass) => `<!doctype html><html><head><style>
:root{--jp-border-color1:#bbb;--jp-border-color2:#ccc;--jp-brand-color1:#06c;--jp-error-color1:#c00;--jp-info-color1:#06c;--jp-layout-color1:#fff;--jp-layout-color2:#eee;--jp-success-color1:#080;--jp-ui-font-color1:#000;--jp-ui-font-color2:#444;--jp-ui-font-family:sans-serif;--jp-ui-font-size1:13px;--jp-warn-color1:#c80}
html,body{margin:0;height:100%;overflow:hidden}
#tab{position:absolute;left:0;top:57px;box-sizing:border-box;width:1440px;height:700px}
${css}
</style></head><body>
<div id="tab" class="jp-MotdPanel ${tabClass}"><div class="jp-MotdPanel-columns">
<div class="jp-MotdPanel-entries" tabindex="0"><div id="spacer"></div>
<section class="jp-MotdPanel-section"><header class="jp-MotdPanel-strip"><h2 class="jp-MotdPanel-heading">Research</h2><span class="jp-MotdPanel-kind">- HTML page</span></header>
<iframe class="jp-MotdPanel-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts"></iframe></section>
</div><aside class="jp-MotdPanel-notifications" tabindex="0"><div class="jp-MotdPanel-title"><h2 class="jp-MotdPanel-heading">Notifications</h2></div></aside>
</div></div>
<script type="module">
import { fitFrame } from '/fit.js';
const tab = document.getElementById('tab');
const frame = document.querySelector('iframe');
let calls = 0;
// the panel's observer: the page root and the frame, every frame fitted on each report
const observer = new ResizeObserver(() => {
  calls++;
  document.querySelectorAll('.jp-MotdPanel-frame').forEach(fitFrame);
});
frame.addEventListener('load', () => {
  const root = frame.contentDocument?.documentElement;
  if (root) {
    observer.observe(root);
    observer.observe(frame);
    window.loadedFrame = true;
  }
});
frame.src = '/inner';
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
// frames until three in a row pass with no fit; -1 when the fits do not end
const settle = async () => {
  for (let quiet = 0, n = 0; n < 30; n++) {
    const before = calls;
    await nextFrame();
    quiet = calls === before ? quiet + 1 : 0;
    if (quiet === 3) {
      return n + 1;
    }
  }
  return -1;
};
const measure = () => {
  const page = frame.contentDocument;
  const inner = frame.contentWindow;
  const root = page.documentElement;
  const view = page.scrollingElement ?? root;
  const style = getComputedStyle(frame);
  const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  // the page's bottom: the root's with its margin, or the lowest edge of an element below it
  let bottom =
    root.getBoundingClientRect().bottom +
    parseFloat(inner.getComputedStyle(root).marginBottom);
  for (const el of page.body.querySelectorAll('*')) {
    bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
  }
  const height = frame.getBoundingClientRect().height;
  return {
    fitted: !!frame.style.height,
    bar: inner.innerWidth - view.clientWidth,
    cut: view.scrollHeight - view.clientHeight,
    horizontal: inner.innerHeight - view.clientHeight,
    slack: height - borders - (inner.innerHeight - view.clientHeight) - (bottom + view.scrollTop),
    frameHeight: height,
    frameWidth: frame.getBoundingClientRect().width
  };
};
// a page built from a seed: headings, paragraphs, blocks of a fixed height, blocks whose height
// follows their width, lists, rules and tables
const seeded = seed => {
  let x = (seed * 2654435761) >>> 0;
  const rnd = () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const words = n =>
    Array.from({ length: n }, () => ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'lab', 'welcome'][int(0, 9)]).join(' ');
  const parts = [];
  for (let i = 0, n = int(2, 9); i < n; i++) {
    const k = int(0, 7);
    if (k === 0) parts.push('<h2>' + words(int(2, 6)) + '</h2>');
    else if (k <= 2) parts.push('<p>' + words(int(5, 120)) + '</p>');
    else if (k === 3) parts.push('<div style="height:' + (int(200, 3000) / 10) + 'px;margin:' + [0, 5, 10, 15][int(0, 3)] + 'px 0;background:#dde">' + words(3) + '</div>');
    else if (k === 4) parts.push('<div style="aspect-ratio:' + int(2, 6) + '/1;background:#ccd"></div>');
    else if (k === 5) parts.push('<ul>' + Array.from({ length: int(1, 6) }, () => '<li>' + words(int(2, 12)) + '</li>').join('') + '</ul>');
    else if (k === 6) parts.push('<hr>');
    else parts.push('<table border="1"><tr><td>' + words(3) + '</td><td>' + words(4) + '</td></tr><tr><td>' + words(2) + '</td><td>' + words(9) + '</td></tr></table>');
  }
  const body = frame.contentDocument.body;
  body.style.margin = ['', '0', '5px', '15px'][int(0, 3)];
  body.innerHTML = parts.join('');
};
// the element that scrolls the card: the columns while they are stacked, else the entries column
window.scroller = () => {
  const columns = document.querySelector('.jp-MotdPanel-columns');
  const entries = document.querySelector('.jp-MotdPanel-entries');
  return getComputedStyle(entries).overflowY !== 'visible' ? entries : columns;
};
window.contentHeight = async () => {
  await settle();
  return window.scroller().scrollHeight;
};
window.run = async samples => {
  const rows = [];
  for (const sample of samples) {
    if (sample.width) tab.style.width = sample.width + 'px';
    if (sample.height) tab.style.height = sample.height + 'px';
    if (sample.spacer !== undefined) document.getElementById('spacer').style.height = sample.spacer + 'px';
    if (sample.block) frame.contentDocument.getElementById('b').style.height = sample.block + 'px';
    if (sample.seed) seeded(sample.seed);
    const frames = await settle();
    rows.push({ ...sample, frames, ...measure() });
  }
  return rows;
};
</script></body></html>`;

const range = (from, to, step) => {
  const values = [];
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
    values.push(Math.round(v * 1000) / 1000);
  }
  return values;
};

// the page class whose own rule shows a vertical scrollbar at all times
const OWN_SCROLLBAR = 'scrollbar by its own rule';

const failure = (row, name) =>
  !row.fitted
    ? 'not fitted'
    : row.frames < 0
      ? 'fits do not end'
      : row.bar > 0 && name !== OWN_SCROLLBAR
        ? 'scrollbar'
        : row.cut > 0
          ? 'scrolls'
          : row.slack < -0.51 - (row.horizontal ? 1 : 0) ||
              row.slack > 1.6 + (row.horizontal ? 1 : 0)
            ? 'slack'
            : '';

async function sweepPage(context, css, fit, layout, name, html) {
  const [layoutName, tabClass, low, high, heightSweepWidth] = layout;
  const page = await context.newPage();
  await page.route('http://motd.test/**', route => {
    const { pathname } = new URL(route.request().url());
    return pathname === '/outer'
      ? route.fulfill({ contentType: 'text/html', body: outer(css, tabClass) })
      : pathname === '/fit.js'
        ? route.fulfill({ contentType: 'text/javascript', body: fit })
        : pathname === '/inner'
          ? route.fulfill({ contentType: 'text/html', body: html })
          : route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://motd.test/outer');
  await page.waitForFunction(() => window.loadedFrame);
  const run = samples =>
    page.evaluate(samples_ => window.run(samples_), samples);
  const sweeps = [];
  if (name === 'pages built from a seed') {
    sweeps.push([
      'page',
      range(1, 120, 1).map(seed => ({
        seed,
        width: low + ((seed * 37) % (high - low)),
        height: 700
      }))
    ]);
  } else {
    // the tab becomes wider in steps of 7 px, then narrower
    await run([{ height: 700 }]);
    sweeps.push([
      'tab width',
      [...range(low, high, 7), ...range(high - 3, low, -7)].map(width => ({
        width
      }))
    ]);
    if (name === 'block of a fixed height') {
      sweeps.push([
        'page height',
        range(30, 700, 1.7).map(block => ({
          block,
          width: heightSweepWidth,
          height: 600,
          spacer: 37.3
        }))
      ]);
    }
  }
  const results = [];
  for (const [sweepName, samples] of sweeps) {
    results.push([sweepName, await run(samples)]);
  }
  if (name !== 'pages built from a seed') {
    // the tab becomes shorter in steps of 2 px across the height at which the card starts to
    // scroll, then taller
    await run([
      {
        width: heightSweepWidth,
        height: 150,
        spacer: 0,
        ...(name === 'block of a fixed height' ? { block: 300 } : {})
      }
    ]);
    const content = await page.evaluate(() => window.contentHeight());
    results.push([
      'tab height',
      await run(
        [
          ...range(content + 80, content - 40, -2),
          ...range(content - 39, content + 80, 2)
        ].map(height => ({ height }))
      )
    ]);
  }
  await page.close();
  return results.map(([sweepName, rows]) => ({
    layout: layoutName,
    page: name,
    sweep: sweepName,
    rows
  }));
}

(async () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const fit = fs.readFileSync(FIT, 'utf8');
  // visible scrollbars, and a device scale the page reports as its devicePixelRatio
  const browser = await chromium.launch({
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: [`--force-device-scale-factor=${SCALE}`]
  });
  const context = await browser.newContext({
    deviceScaleFactor: SCALE,
    viewport: { width: 1440, height: 900 }
  });
  let samples = 0;
  let failed = 0;
  const out = OUT ? fs.createWriteStream(OUT) : null;
  for (const [name, html] of Object.entries(PAGES)) {
    const layouts = LAYOUTS.filter(layout =>
      `${layout[0]} / ${name}`.includes(ONLY)
    );
    // the three layouts of one page class run side by side
    const groups = await Promise.all(
      layouts.map(layout => sweepPage(context, css, fit, layout, name, html))
    );
    for (const { layout, page, sweep, rows } of groups.flat()) {
      const bad = rows.map(row => ({ ...row, failure: failure(row, page) }));
      const failures = bad.filter(row => row.failure);
      samples += rows.length;
      failed += failures.length;
      const slack = rows.filter(row => row.fitted).map(row => row.slack);
      console.log(
        `scale ${SCALE} [${layout} / ${page} / ${sweep}] samples=${rows.length} failed=${failures.length}` +
          (slack.length
            ? ` slack=${Math.min(...slack).toFixed(2)}..${Math.max(...slack).toFixed(2)}`
            : '')
      );
      const kinds = {};
      for (const row of failures) {
        kinds[row.failure] = (kinds[row.failure] || 0) + 1;
      }
      if (failures.length) {
        console.log('   ', JSON.stringify(kinds), JSON.stringify(failures[0]));
      }
      out?.write(
        bad
          .map(row => JSON.stringify({ layout, page, sweep, ...row }))
          .join('\n') + '\n'
      );
    }
  }
  await browser.close();
  out?.end();
  console.log(`scale ${SCALE} TOTAL samples=${samples} failed=${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(2);
});
