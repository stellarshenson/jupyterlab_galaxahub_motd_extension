# Defects - jupyterlab_galaxahub_motd_extension

Observed wrong behaviour of the Message of the day tab and its hub proxy, with the trail of what was tried against it.

## Authors

- `@kj` Konrad Jelen

## Settings `CONFIG`

How the settings reach the tab and its pull timer

- [x] `DEF-CONFIG-1` **pollMinutes of 35792 or more pulls without pause** - MAJOR; setInterval converts its delay to a 32-bit signed integer; pollMinutes 35792 gives 2,147,520,000 ms, above 2^31 - 1, so the delay wraps, is clamped to 0, and the open tab pulls both feeds on every timer turn; the schema set only a minimum, so the registry accepted the value
  - evidence: Jest 40/40 on 0.1.8: settings.spec.ts 'declares the three settings with their defaults' asserts pollMinutes maximum 35791; the built schema carries it; Galata 22/22 on 0.1.8
  - repro: set pollMinutes to 35792 or 43200 with the tab open; Chromium fires the poll 130 times in 500 ms
  - test-tags: UNIT
  - root-cause: 2026-09-28T12:35:27Z @kj the pollMinutes schema had no maximum, so a value above 35791 reached setInterval in panel.ts, whose 32-bit delay wraps to 0
  - log: 2026-09-28T12:35:27Z @kj added; reason: the text names the conversion, the arithmetic and why the schema let the value through
  - log: 2026-09-28T12:43:06Z @kj closed: fixed: schema/plugin.json pollMinutes maximum 35791, the setting registry refuses a larger value

## Two-column layout `LAYOUT`

How the tab lays out its columns, cards and html page frames

- [x] `DEF-LAYOUT-2` **HTML page frame keeps its load-time height** - MEDIUM; panel.ts sets the frame height only in the frame's load listener and src/ has no resize hook, so after a tab width change the frame keeps its old height; a frame loaded while the tab is hidden measures 0 and keeps the 480 px default; a page that grows after load, such as an expanded `<details>` element, scrolls inside the load-time frame height; breaks ACC-LAYOUT-36
  - evidence: Galata 30/30 on 0.1.12: 'fits the frame again when its text wraps after the tab narrows' - viewport 1440 to 1300 px, frame narrower, page taller, frame = page height + 2; 'fits the frame to a page that loaded behind another tab once the tab is shown' - package held until a Launcher was current, frame 0 px while hidden, frame = page height + 2 once the tab was shown; 'fits the frame again when its page grows after load' - `<details>` opened, page more than 250 px taller, frame = page height + 2
  - repro: Chromium: load an html entry in a 700 px column, narrow the column to 350 px; the page is 920 px tall, the frame stays 706 px; Chromium: html entry with a closed `<details>` element, expand it after load; the frame stays 150 px, the page scrollHeight is 1168, and a ResizeObserver on the frame element does not fire
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T13:51:52Z @kj the height is read once, on the frame's load event; nothing reads it again on a width change, when the tab is shown, or when the page changes its own height; an observer on the frame element sees only the first two, because the frame box does not change when its page grows
  - root-cause: 2026-09-28T12:35:27Z @kj the height is read once, on the frame's load event; nothing reads it again on resize or when the tab is shown
  - log: 2026-09-28T12:35:27Z @kj added; reason: the text names the listener, the missing hook, both symptoms and the criterion it breaks
  - log: 2026-09-28T13:51:52Z @kj amended text "panel.ts sets the frame height only in the frame's load listener and src/ has no resize hook, so after a tab width change the frame keeps its old height; a frame loaded while the tab is hidden measures 0 and keeps the 480 px default; breaks ACC-LAYOUT-36" -> "panel.ts sets the frame height only in the frame's load listener and src/ has no resize hook, so after a tab width change the frame keeps its old height; a frame loaded while the tab is hidden measures 0 and keeps the 480 px default; a page that grows after load, such as an expanded `<details>` element, scrolls inside the load-time frame height; breaks ACC-LAYOUT-36"; reason: the text adds the third symptom, a page that grows after load, to the two it named
  - log: 2026-09-28T13:51:52Z @kj edited repro "Chromium: load an html entry in a 700 px column, narrow the column to 350 px; the page is 920 px tall, the frame stays 706 px" -> "Chromium: load an html entry in a 700 px column, narrow the column to 350 px; the page is 920 px tall, the frame stays 706 px; Chromium: html entry with a closed `<details>` element, expand it after load; the frame stays 150 px, the page scrollHeight is 1168, and a ResizeObserver on the frame element does not fire"; reason: the repro adds the `<details>` reproduction of the third symptom
  - log: 2026-09-28T13:51:52Z @kj root-cause overridden; reason: the record adds the third trigger and why an observer on the frame element misses it
  - log: 2026-09-28T15:18:26Z @kj closed: fixed: src/panel.ts watches each frame page root with one ResizeObserver per panel and fits the frame on every report; installed 0.1.12; reason: the evidence names the three tests, one per symptom in the text, and what each asserted on the installed build
- [x] `DEF-LAYOUT-3` **Browser focus ring frames the whole tab** - MEDIUM; every activation draws the browser's 2 px focus outline around the whole tab; panel.ts sets tabIndex -1 and focuses the panel node, style/base.css has no :focus rule, and MotdPanel is a bare Widget, so the lab's .jp-MainAreaWidget > :focus rule does not reach it
  - evidence: render on 0.1.8, JupyterLab Light and Dark: panel focused and matching :focus-visible, computed outline-style none, no ring in tmp/screens/focus-jupyterlab-light.png and focus-jupyterlab-dark.png; Galata 22/22
  - repro: open the tab on JupyterLab Light with openOnStart on; a 2 px black outline frames the tab, see tmp/screens/preview-jupyterlab-light.png
  - test-tags: MANUAL
  - root-cause: 2026-09-28T12:35:27Z @kj the focused panel node carries no outline rule, so the browser default focus outline applies
  - log: 2026-09-28T12:35:27Z @kj added; reason: the text names the symptom and the three facts that together cause it
  - log: 2026-09-28T12:43:06Z @kj closed: fixed: style/base.css .jp-MotdPanel:focus { outline: none }
- [x] `DEF-LAYOUT-4` **Entry card clips wide markdown and a long group name** - MEDIUM; style/base.css gives .jp-MotdPanel-section overflow hidden, so every card child that cannot shrink to the card width is cut off: a markdown body wider than the card shows no scrollbar, and a long group name is cut off and pushes the '- HTML page' label outside the card; before the card layout the panel scrolled sideways to wide markdown; breaks ACC-LAYOUT-32 and ACC-LAYOUT-33
  - evidence: Galata 24/24 on 0.1.9: 'keeps wide markdown and a long group name inside the card' - scrolled to its end, a 200-character inline code path ends inside the card; a 200-character group name and the HTML page label end inside the card, the label on one line; the case failed on 0.1.8, code right edge x 1962 against the card edge at 981
  - repro: Chromium: 964 px tab with a markdown entry holding an 80-character inline code path: the card ends at x 544, the code at x 804, nothing scrolls sideways; 802 px tab with an html entry whose group name has 49 characters: the label sits at x 437-471, outside the card edge at 382
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T13:06:46Z @kj base.css:78 .jp-MotdPanel-section { overflow: hidden } clips the card children that cannot shrink to the card width: the markdown body has no sideways scroll of its own, and the strip heading and label have neither min-width 0 nor wrapping
  - log: 2026-09-28T13:06:46Z @kj added; reason: the text names the clipping rule, both symptoms, the regression and the criteria it breaks
  - log: 2026-09-28T13:13:18Z @kj closed: fixed: style/base.css gives the markdown body overflow-x auto, the strip heading min-width 0 and overflow-wrap anywhere, and .jp-MotdPanel-kind flex-shrink 0; reason: the evidence names the test, what it asserts on 0.1.9 and how it failed on 0.1.8
- [x] `DEF-LAYOUT-5` **HTML page frame keeps the 480 px box for a tall page with a full-height reset** - MEDIUM; panel.ts reads contentDocument.documentElement.offsetHeight in the frame's load listener; a page whose stylesheet sets html, body { height: 100% } has a root element exactly as tall as the frame viewport, so the frame stays 480 px and the page scrolls inside it; breaks ACC-LAYOUT-36
  - evidence: Galata 24/24 on 0.1.9: 'fits the frame to a tall page whose root is as tall as the frame' - package with html, body height 100% and a 1000 px block, frame at least 1000 px tall; the case failed on 0.1.8 at 480 px; 'shows an html entry in a sandboxed iframe at the hub url' still under 200 px
  - repro: Chromium: html entry whose package is `<style>html,body{height:100%;margin:0}</style>` and a 1000 px block; the frame is 480 px, the page scrollHeight 1000 against clientHeight 478
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T13:06:46Z @kj with html height 100% the root element's offsetHeight equals the frame viewport, so the load listener reads the viewport height and not the content height
  - log: 2026-09-28T13:06:46Z @kj added; reason: the text names the read, the page stylesheet that defeats it and the criterion it breaks
  - log: 2026-09-28T13:06:56Z @kj edited repro "Chromium: html entry whose package is <style>html,body{height:100%;margin:0}</style> and a 1000 px block; the frame is 480 px, the page scrollHeight 1000 against clientHeight 478" -> "Chromium: html entry whose package is `<style>html,body{height:100%;margin:0}</style>` and a 1000 px block; the frame is 480 px, the page scrollHeight 1000 against clientHeight 478"
  - log: 2026-09-28T13:13:18Z @kj closed: fixed: src/panel.ts load listener collapses the frame to 0 px, then reads contentDocument.documentElement.scrollHeight + 2; reason: the evidence names the test, what it asserts on 0.1.9, how it failed on 0.1.8 and the short-page case it keeps
  - log: 2026-09-28T13:51:43Z @kj regressed as DEF-LAYOUT-5-1
- [x] `DEF-LAYOUT-5-1` **HTML page frame keeps the 480 px box for a tall page with a full-height reset** - MEDIUM; panel.ts reads contentDocument.documentElement.offsetHeight in the frame's load listener; a page whose stylesheet sets html, body { height: 100% } has a root element exactly as tall as the frame viewport, so the frame stays 480 px and the page scrolls inside it; breaks ACC-LAYOUT-36
  - evidence: Galata 30/30 on 0.1.12: 'keeps the 480 px box and scrolls inside it for a page with html and body height 100%' - package with html, body height 100% and a 1000 px block: frame 480 px, page scrollHeight above clientHeight, the mouse wheel over the frame scrolls the page inside it, the fallback ACC-LAYOUT-36 names for a root as tall as the frame since its 2026-09-28 amendment
  - test-tags: FUNCTIONAL
  - repro: Chromium on 0.1.10: html entry whose package is `<style>html,body{height:100%;margin:0}</style>` and a 1000 px block; the frame is 480 px, the page scrollHeight 1000 against clientHeight 478, its content reachable by scrolling inside the frame
  - log: 2026-09-28T13:51:43Z @kj regression of DEF-LAYOUT-5: deferred: contested semantics, a single load-time read cannot fit a full-height-reset tall page without losing the content of a page laid out to the viewport (DEF-LAYOUT-6); the Star Colonel decides the ACC-LAYOUT-36 wording
  - log: 2026-09-28T13:53:31Z @kj edited repro added "Chromium on 0.1.10: html entry whose package is `<style>html,body{height:100%;margin:0}</style>` and a 1000 px block; the frame is 480 px, the page scrollHeight 1000 against clientHeight 478, its content reachable by scrolling inside the frame"; test-tags added "FUNCTIONAL"
  - log: 2026-09-28T15:18:26Z @kj closed: fixed: the amended ACC-LAYOUT-36 makes a root as tall as the frame unmeasurable, and src/panel.ts fitFrame leaves it on the 480 px box with its page reachable by scrolling; installed 0.1.12; reason: the evidence names the test, what it asserted on the installed build and the criterion wording that makes the 480 px box the specified outcome
- [x] `DEF-LAYOUT-6` **HTML page frame hides the content of a page laid out to the frame height** - MEDIUM; the load listener collapsed the frame to 0 px before reading scrollHeight, so a page whose content sits in a viewport-sized scroll container measured only the part outside it; the frame shrank to 20 px and the container to 0 px, its content out of reach; breaks ACC-LAYOUT-36
  - evidence: Galata 24/24 on 0.1.10: 'keeps the content of a page laid out to the frame height reachable' - app-shell package, main clientHeight 430, frame 480 px; the case failed on 0.1.9 with main clientHeight 0; 'shows an html entry in a sandboxed iframe at the hub url' 116 px, under 200 px
  - repro: Chromium on 0.1.9: html entry whose package sets html, body { height: 100% }, a 48 px header and a main with flex 1 and overflow auto holding 1000 px; the frame is 20 px, main clientHeight 0
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T13:51:33Z @kj with the frame at 0 px the page viewport is 0 px tall, so a container sized to the viewport is 0 px and scrollHeight counts only the content outside it
  - log: 2026-09-28T13:51:33Z @kj added
  - log: 2026-09-28T13:51:38Z @kj closed: fixed: src/panel.ts load listener reads contentDocument.documentElement.offsetHeight + 2 and no longer collapses the frame first; reason: the evidence names the test, what it measured on 0.1.10, how it failed on 0.1.9 and the short-page case it keeps
- [x] `DEF-LAYOUT-7` **HTML page frame shrinks to the body margin for a page positioned absolute or fixed** - MEDIUM; panel.ts reads contentDocument.documentElement.offsetHeight in the frame's load listener; content positioned absolute or fixed adds nothing to the root element's height, so the root reads only the body's collapsed 8 px margin and the frame shrinks to 10 px; the content cannot be read, and fixed content cannot be scrolled into view; HEAD's scrollHeight read showed these pages in full; breaks ACC-LAYOUT-36
  - evidence: Galata 30/30 on 0.1.12: 'keeps the 480 px box for a page of only absolute or fixed content, the absolute one scrolling inside it' - absolute wrapper holding 1000 px with the default body margin: frame 480 px, page scrollHeight above clientHeight, the mouse wheel scrolls it inside the frame; position fixed, inset 0 grid with a 300 px card: frame 480 px, the card inside the frame viewport
  - related: ACC-LAYOUT-36, DEF-LAYOUT-5-1
  - repro: Chromium on 0.1.10: html entry whose package holds an absolute wrapper with 600 px of content and the default body margin; the frame is 10 px, root offsetHeight 8, scrollHeight 712; html entry whose package holds a position fixed, inset 0 grid with a 300 px card; the frame is 10 px, root scrollHeight 8 equal to clientHeight 8, nothing scrolls; the same absolute wrapper with body margin 0 keeps 480 px; a short in-flow page gives 116 px; HEAD's scrollHeight read gives 712, 478, 600 and 478 for the same four pages
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T14:08:55Z @kj offsetHeight of the root element counts only in-flow content; out-of-flow content leaves it at the body margin, so a page with body margin 0 keeps 480 px and the same page with the default margin shrinks to 10 px
  - log: 2026-09-28T14:08:55Z @kj added; reason: the text names the read, the two page layouts that defeat it, the symptom, the regression against HEAD and the criterion it breaks
  - log: 2026-09-28T14:09:01Z @kj deferred: contested semantics; each load-time read measured so far leaves some page class wrong (DEF-LAYOUT-5-1, DEF-LAYOUT-6, this); the Star Colonel decides the ACC-LAYOUT-36 wording
  - log: 2026-09-28T15:18:26Z @kj closed: fixed: src/panel.ts fitFrame returns to the 480 px box when the fitted page still scrolls (content beyond the root) or its body has no in-flow height (only absolute or fixed content); installed 0.1.12; reason: the evidence names the test and what it asserted for both page layouts of the repro on the installed build
- [x] `DEF-LAYOUT-8` **HTML page frame keeps the 480 px box for a tall page in quirks mode** - MEDIUM; fitFrame in src/panel.ts loops while documentElement.offsetHeight differs from documentElement.clientHeight; a page with no doctype or an HTML 4.01 Transitional doctype renders in quirks mode, where documentElement.clientHeight equals its offsetHeight, so the loop never runs and the frame stays 480 px with the page scrolling inside it; the hub accepts any single self-contained HTML file (ACC-EXMOTD-3225); HEAD's scrollHeight read sized these pages, so this is a regression against HEAD; breaks ACC-LAYOUT-36
  - evidence: Galata 31/31 on 0.1.14: 'fits the frame to a tall page in quirks mode' - package with no doctype and a 700 px block: compatMode BackCompat, frame = root offsetHeight + 2 and above 480 px; the same case failed on 0.1.13, its poll receiving false with the frame at 480 px (logs/ui-tests-quirks-before.log); the six standards-mode 'html page frame' cases still pass
  - related: ACC-LAYOUT-36
  - root-cause: 2026-09-28T16:01:29Z @kj in quirks mode the viewport height is body.clientHeight, the page's scrolling element, and documentElement.clientHeight reports the root's own height, so the loop guard compares two equal values on every quirks page
  - repro: Chromium (playwright-core 1.63), fitFrame copied verbatim: html entry whose package has no doctype and about 700 px of content; compatMode BackCompat, documentElement clientHeight 716 = offsetHeight 716, frame 480 px; the same package with <!doctype html> fits at 718
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T16:01:28Z @kj added; reason: the text names the read, the page class that defeats it, the symptom, the regression against HEAD and the criterion it breaks
  - log: 2026-09-28T16:07:39Z @kj closed: fixed: src/panel.ts fitFrame reads the viewport height and the scroll height from page.scrollingElement, falling back to the root; installed 0.1.14; reason: the evidence names the test, what it asserted on the installed build, how it failed on the build before the fix, and the cases it keeps
- [x] `DEF-LAYOUT-9` **HTML page frame keeps the 480 px box for a page whose content reaches past its root** - MEDIUM; fitFrame in src/panel.ts fits the frame to documentElement.offsetHeight and returns to the 480 px box when the fitted page still scrolls; content past the root (a margin on the html element, an absolute element below a relative body, a negative bottom margin on the last element) makes such a page scroll, so it keeps the 480 px box and the rest scrolls inside it; a short page with a margin on the html element keeps the box with an empty band; HEAD's scrollHeight read showed these pages at full height; breaks ACC-LAYOUT-36
  - evidence: Galata 32/32 on 0.1.15: 'fits the frame to a page whose content reaches past its root' - package with html { margin: 20px } and a 700 px block: frame 758 px (716 px root + 40 px html margin + 2 px of borders), root scrollHeight equal to clientHeight; the same case failed on 0.1.14, expected 758, received 480 (logs/ui-tests-past-root-before.log); the seven other 'html page frame' cases still pass, the absolute-only page at 480 px (logs/ui-tests-past-root-after.log); Chromium with fitFrame copied from src/panel.ts: html margin 902, absolute badge 816 and negative margin 826 px, 0 px hidden each
  - related: ACC-LAYOUT-36
  - repro: Chromium (playwright-core), fitFrame copied verbatim from src/panel.ts, 700 px column: a page with html { margin: 20px } keeps the 480 px box with 422 px hidden below it; a relative body with an absolute span at bottom -24px keeps 480 px with 336 px hidden; a last paragraph with margin-bottom -24px keeps 480 px with 346 px hidden; a short page with html { margin: 20px } keeps 480 px with a 334 px empty band; HEAD 2d55f1b's load-time scrollHeight read gives the first three 900, 814 and 824 px
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T16:54:44Z @kj the loop fits documentElement.offsetHeight, which leaves out the root's margin and any overflow past the root, and the view.scrollHeight > view.clientHeight clause of the reset condition then sends every such page back to the 480 px box
  - log: 2026-09-28T16:54:44Z @kj added; reason: the text names the read, the page layouts that defeat it, both symptoms, the regression against HEAD and the criterion it breaks
  - log: 2026-09-28T17:01:18Z @kj closed: fixed: src/panel.ts fitFrame adds the overflow past the fitted root, at most twice, and returns to the 480 px box only when root height plus that overflow does not match the viewport or the page still scrolls; installed 0.1.15; reason: the evidence names the test, what it asserted on the installed build, how it failed on the build before the fix, the cases it keeps and the three repro pages
- [x] `DEF-LAYOUT-10` **HTML page frame returns to the 480 px box when a page grows by exactly its content past the root** - MINOR; fitFrame adds the overflow past the root only when its first loop ran during the same call. When a fitted page's root grows by exactly that overflow (a `<details>` opened, or a tab width change), the root already equals the old viewport. The loop is skipped, the overflow is not added, and the frame returns to the 480 px box, with an empty band or with the rest of the page scrolling inside it. With overlay or hidden scrollbars nothing corrects it until the root changes size again. Breaks ACC-LAYOUT-36.
  - evidence: Galata 33/33 on 0.1.16: 'fits the frame again when its page grows by exactly the content past its root' - package with html { margin: 20px } and a `<details>` whose opened block is 40 px: frame = root height + 42 closed, root grown by exactly 40 px after the click, frame = root height + 42 again; the same case failed on 0.1.15 at the last poll, expected 42, received 406 (frame 480 px over a 74 px root) (logs/ui-tests-grow-past-before.log); the eight other 'html page frame' cases still pass, html and body height 100% and absolute content at 480 px scrolling inside (logs/ui-tests-grow-past-after.log)
  - related: ACC-LAYOUT-36
  - repro: Chromium, hidden scrollbars (Playwright default, Galata), fitFrame sliced from src/panel.ts: a page with html { margin: 20px } and a <details> whose opened content is exactly 40 px tall fits at 76 px closed (root 34 + 40 + 2) and goes to 480 px when opened, root 74 instead of 116; with a 41 px block it fits at 117; tab width changes: a text page at 700 then 629 px goes from 262 to 480 px, a tall text page at 687 then 668 px goes from 942 to 480 px with 502 px scrolling inside (HEAD kept about 942), an aspect-ratio page at 600 then 1000 px goes from 112 to 480 px; classic scrollbars correct every case
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T17:42:58Z @kj the i && guard that the DEF-LAYOUT-9 fix added to the past step: when the root already equals the viewport the first loop does not run, i stays 0, past stays 0, and the reset condition sees the page still scrolling
  - log: 2026-09-28T17:42:58Z @kj added; reason: re-filed without the arrow glyphs the tracker check forbids; the text names the guard, the page change that defeats it, both symptoms, the scrollbar mode it needs and the criterion it breaks
  - log: 2026-09-28T17:42:58Z @kj closed: fixed: src/panel.ts fitFrame adds the overflow past the root whenever the frame holds a fitted height (frame.style.height non-empty) instead of only when its first loop ran during the same call; installed 0.1.16; reason: the evidence names the test, what it asserted on the installed build, how it failed on the build before the fix and the cases it keeps
- [x] `DEF-LAYOUT-12` **No maximum width on a wide tab** - MINOR; HEAD capped each entry card at 960 px; the two-column rewrite removed the cap, so on a wide tab markdown lines run the full width of the entries column and, with notifications only, a row's time sits at the far right of the tab; regression against HEAD
  - evidence: 0.1.20: Galata 'caps a card at 960 px and a notification row at 760 px in a wide tab' at 1920 px failed before the fix (card 1128 px) and passes; Galata 34/34
  - repro: open the tab at a 1920 px viewport with a markdown entry, then with notifications only; measure the card and the row
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T19:26:08Z @kj style/base.css .jp-MotdPanel-section lost max-width: 960px in the layout B rewrite; the Notifications column content has no cap
  - log: 2026-09-28T19:26:08Z @kj added
  - log: 2026-09-28T19:32:35Z @kj closed
- [x] `DEF-LAYOUT-16` **Page keys scroll nothing after the tab opens** - MINOR; onActivateRequest focuses the panel node, but since layout B each column scrolls on its own, so Page Up and Page Down scroll nothing in a tab 800 px or wider until the user presses Tab; regression against HEAD
  - evidence: 0.1.21: activation focuses the scrolling column; Galata 'scrolls the entries column with Page Down once the tab opens' failed before (scrollTop 0) and passes; Jest activation cases 3/3; ACC-LAYOUT-52
  - repro: open the tab at 1440 px with entries taller than the tab, press Page Down
  - test-tags: UNIT, FUNCTIONAL
  - root-cause: 2026-09-28T19:52:19Z @kj panel.ts onActivateRequest focuses this.node, which no longer scrolls in the two-column layout
  - log: 2026-09-28T19:52:19Z @kj added
  - log: 2026-09-28T20:04:02Z @kj closed
- [x] `DEF-LAYOUT-20` **Type labels make the tab scroll** - MAJOR; with many notification rows the whole tab scrolls down into blank space; 60 rows at 1440x900 give the tab 3039 px of extra scroll
  - evidence: Galata 'scrolls a long notification list in its own column' expects 0 px tab scroll, failed with 3039 before; 0.1.22: Jest 45/45, pytest 24/24, Galata 38/38, lint clean
  - related: DEF-VIEW-17 - the type label fix that caused it
  - repro: 60 non-default notification rows, 1440x900 tab; tab scrollHeight minus clientHeight is 3039, expected 0
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T20:25:40Z @kj the off-screen type label is position absolute and its containing block is the tab node, so each label extends the tab past the scrolling column
  - log: 2026-09-28T20:25:40Z @kj added
  - log: 2026-09-28T20:25:57Z @kj closed: fixed: .jp-MotdPanel-row is position relative, so each label stays inside its row
- [x] `DEF-LAYOUT-21` **Tab key skips both columns** - MAJOR; Tab from the entries column lands on a tab-bar tab, not on the Notifications column, so a keyboard user cannot scroll Notifications
  - evidence: Galata 'moves the focus from the entries column to the Notifications column with Tab', failed on lm-TabBar-tab before; 0.1.22: Jest 45/45, pytest 24/24, Galata 38/38, lint clean
  - related: DEF-LAYOUT-16, ACC-LAYOUT-52 - the page-keys fix that caused it
  - repro: open the tab with one entry and 60 rows, press Tab; activeElement is lm-TabBar-tab
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T20:25:40Z @kj both columns have tabIndex -1, which removes them from the Tab order; Chromium makes a scrolling element a Tab stop only when it has no tabindex
  - log: 2026-09-28T20:25:40Z @kj added
  - log: 2026-09-28T20:25:57Z @kj closed: fixed: both columns have tabIndex 0
- [x] `DEF-LAYOUT-22` **Open command scrolls a stacked tab to the top** - MINOR; in a tab narrower than 800 px scrolled to Notifications, Message of the day: Open scrolls the tab back to the entries
  - evidence: Galata 'keeps the scroll position of a stacked tab when the palette command activates it', failed 522 to 0 before; 0.1.22: Jest 45/45, pytest 24/24, Galata 38/38, lint clean
  - related: DEF-LAYOUT-16, ACC-LAYOUT-52 - the page-keys fix that caused it
  - repro: 820x600, 2 entries, 8 rows, tab scrolled to the bottom (522), run galaxahub-motd:open; scrollTop becomes 0
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T20:25:40Z @kj _focusColumn calls focus() on the entries column, and focus() scrolls the element into view
  - log: 2026-09-28T20:25:40Z @kj added
  - log: 2026-09-28T20:25:57Z @kj closed: fixed: _focusColumn calls focus({ preventScroll: true })

## Agent CLI `CLI`

the jupyterlab-galaxahub-motd command

- [x] `DEF-CLI-11` **Malformed hub status line printed on stderr** - MINOR; cli.py prints the text of an http.client exception; for a malformed status line that text is what the hub sent, so a hub echoing the Authorization header puts JUPYTERHUB_API_TOKEN on stderr, over two lines; breaks ACC-CLI-46 and ACC-CLI-48
  - evidence: test_token_never_printed_from_a_malformed_status_line failed before the fix (token on stderr) and passes after; make test: Jest 41/41, pytest 24/24, auth gate passed; Galata 33/33 on installed 0.1.18
  - related: ACC-CLI-46, ACC-CLI-48 - the criteria this breaks
  - repro: stub answers HTTP/1.1 4O3 plus the received Authorization value; rich --json exits 4, stderr holds the token over two lines; test_cli.py test_token_never_printed_from_a_malformed_status_line
  - test-tags: UNIT
  - root-cause: 2026-09-28T18:37:01Z @kj the except branch prints str(error) for http.client.HTTPException, whose text for BadStatusLine is the hub's status line
  - log: 2026-09-28T18:37:01Z @kj added
  - log: 2026-09-28T18:41:50Z @kj edited repro "stub answers HTTP/1.1 4O3 plus the received Authorization value; rich --json exits 4, stderr holds the token over two lines" -> "stub answers HTTP/1.1 4O3 plus the received Authorization value; rich --json exits 4, stderr holds the token over two lines; test_cli.py test_token_never_printed_from_a_malformed_status_line"
  - log: 2026-09-28T18:41:50Z @kj closed: fixed on 0.1.18
  - log: 2026-09-28T18:49:14Z @kj amended text "cli.py prints the text of an http.client exception; for a malformed status line that text is what the hub sent, so a hub echoing the Authorization header puts JUPYTERHUB_API_TOKEN on stderr, over two lines; breaks ACC-CLI-45 and ACC-CLI-47" -> "cli.py prints the text of an http.client exception; for a malformed status line that text is what the hub sent, so a hub echoing the Authorization header puts JUPYTERHUB_API_TOKEN on stderr, over two lines; breaks ACC-CLI-46 and ACC-CLI-48"

## Tab content `VIEW`

What the open tab shows after a pull

- [x] `DEF-VIEW-13` **A failed re-pull empties the open tab** - MINOR; applyAnswer maps a proxy 204 (hub unreachable, or slower than the 10 s request timeout) and every failed status to no rows; a palette re-pull or a poll then hides every entry and shows 'No notifications' until the next successful pull
  - evidence: 0.1.20: Jest applyAnswer 204 and 403/500/0 cases expect the held rows and Etag; 4 failed before the fix, 41/41 pass
  - related: ACC-OPEN-12, ACC-CONFIG-28 - the re-pull paths that reach it
  - repro: open the tab, stop the hub, run 'Message of the day: Open'
  - test-tags: UNIT
  - root-cause: 2026-09-28T19:26:08Z @kj applyAnswer in src/model.ts returns rows [] and etag null for 204 and failures instead of the rows and Etag the model holds
  - log: 2026-09-28T19:26:08Z @kj added
  - log: 2026-09-28T19:32:35Z @kj closed
  - log: 2026-09-28T19:46:43Z @kj its repro passes for markdown cards and notification rows only; an html card now shows an error page during the outage, filed as DEF-VIEW-15
- [x] `DEF-VIEW-15` **HTML card shows an error page during a hub outage** - MINOR; since DEF-VIEW-13 keeps the rows through a failed pull, every pull still emits changed and render rebuilds each card, so an html frame reloads its page from the unreachable hub (Cache-Control no-cache) and shows Chromium's connection error page or the proxy's 503 page until the next successful pull
  - evidence: 0.1.21: render rebuilds the cards only when the rich rows changed; Jest 'keeps the cards and their frames when a pull brings no new entries' (304, 204, 500 keep the same card and iframe nodes) failed before the fix and passes; Jest 45/45, Galata 36/36
  - related: DEF-VIEW-13 - the round 1 fix that exposed it
  - repro: open the tab with an html entry, stop the hub, run 'Message of the day: Open'
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T19:46:37Z @kj MotdPanel.render rebuilds every card on every changed signal, and MotdModel.pull emits changed after every pull, also when the rows did not change
  - log: 2026-09-28T19:46:37Z @kj added
  - log: 2026-09-28T20:04:02Z @kj closed
- [x] `DEF-VIEW-17` **Notification type hidden from screen readers** - MINOR; every row icon is aria-hidden and nothing else names the type, so a screen reader does not say whether a row is a warning or an error
  - evidence: 0.1.21: each non-default row carries an off-screen word for its type; Jest 'names the type of each row for screen readers, except the default type' failed before and passes; ACC-VIEW-10 amended
  - repro: read a warning row with a screen reader, or inspect its accessible name
  - test-tags: UNIT
  - root-cause: 2026-09-28T19:52:19Z @kj the type is carried only by the aria-hidden icon and its colour (panel.ts icon)
  - log: 2026-09-28T19:52:19Z @kj added
  - log: 2026-09-28T20:04:02Z @kj closed
- [x] `DEF-VIEW-18` **target=\_blank links in an HTML page do nothing** - MINOR; the html entry frame is sandboxed with allow-same-origin only, so a link with target=_blank in the page is blocked without feedback
  - evidence: 0.1.21: sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; Galata 'opens a target=_blank link of an html page in a new browser tab' timed out before and passes; ACC-VIEW-8 amended
  - repro: click a target=_blank link in an html entry
  - test-tags: UNIT, FUNCTIONAL
  - root-cause: 2026-09-28T19:52:19Z @kj the frame sandbox has no allow-popups
  - log: 2026-09-28T19:52:19Z @kj added
  - log: 2026-09-28T20:04:02Z @kj closed

## Test harness `TEST`

The Galata and pytest harness around the extension

- [x] `DEF-TEST-14` **Galata test server writes the live user settings** - MEDIUM; ui-tests/jupyter_server_test_config.py sets no user_settings_dir, so a server started with it reads and writes ~/.jupyter/lab/user-settings; on 2026-09-28 a reviewer's PUT to /lab/api/settings/jupyterlab_galaxahub_motd_extension:plugin landed in the live folder
  - evidence: config sets c.LabApp.user_settings_dir = mkdtemp(prefix='galata-settings-'); a PUT to the test server landed in /tmp/galata-settings-*, live file mtime unchanged (21:16:01); Galata 34/34 on 0.1.20
  - repro: start jupyter lab with ui-tests/jupyter_server_test_config.py, PUT a setting, look in ~/.jupyter/lab/user-settings
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T19:39:36Z @kj configure_jupyter_server moves the workspaces folder and the server root to temporary folders, not the user settings folder
  - log: 2026-09-28T19:39:36Z @kj added
  - log: 2026-09-28T19:42:01Z @kj closed
- [x] `DEF-TEST-24` **Malformed status line test races its stub thread** - MINOR; test_token_never_printed_from_a_malformed_status_line asserts sent before the stub thread appends the last echoed token; failed once in the make publish test gate with 3 of 4 entries
  - evidence: the test joins the stub thread before asserting sent; 24 of 24 runs pass, 8 at a time; make test pytest 35/35 with the live environment make publish uses
  - repro: make publish test gate under load; 0 of 25 isolated runs fail
  - test-tags: UNIT
  - root-cause: 2026-09-29T19:29:55Z @kj the stub thread appends to sent after sendall, and the test asserts right after the last CLI run returns, without joining the thread
  - log: 2026-09-29T19:29:55Z @kj added
  - log: 2026-09-29T19:32:41Z @kj closed: fixed before the 0.8.10 publish

## Live broadcasts `LIVE`

How a broadcast reaches an open lab

- [x] `DEF-LIVE-19` **A broadcast reopen takes keyboard focus from the editor** - MINOR; with reopenOnBroadcast on, the reopen activates the tab, so a user typing in an editor loses keystrokes to the tab
  - evidence: 0.1.21: the broadcast path adds the tab with activate false; Galata reopenOnBroadcast case reads 'before after' in the editor, failed before and passes; ACC-LIVE-23 amended
  - repro: turn reopenOnBroadcast on, close the tab, type in an editor while a broadcast arrives
  - test-tags: FUNCTIONAL
  - root-cause: 2026-09-28T19:52:19Z @kj the broadcast path calls open(), which runs app.shell.activateById
  - log: 2026-09-28T19:52:19Z @kj added
  - log: 2026-09-28T20:04:02Z @kj closed

## Server settings `SERVER`

The two hub URL settings the lab's Jupyter config sets

- [x] `DEF-SERVER-23` **Trailing slash drops every broadcast** - MAJOR; notifications_api_url ending in / is called as written; the hub route has no trailing slash, answers 404, the proxy answers 204 and the CLI exits 1, so no broadcast shows
  - evidence: GalaxaHubMotd.url strips the trailing / of notifications_api_url; test_routes_follow_the_settings[hub_paths1] with trailing slashes failed before the fix and passes after; make test pytest 35/35
  - test-tags: UNIT
  - repro: c.GalaxaHubMotd.notifications_api_url = '<hub>/user-notifications/' -> notifications route answers 204
  - root-cause: 2026-09-29T19:20:10Z @kj GalaxaHubMotd.url returns notifications_api_url unchanged while motd_api_url goes through url_path_join
  - log: 2026-09-29T19:20:10Z @kj added
  - log: 2026-09-29T19:20:30Z @kj edited test-tags added "UNIT"
  - log: 2026-09-29T19:21:16Z @kj closed: fixed by review round 7 plan

## Lab start `START`

Opening the tab when the lab starts

- [x] `DEF-START-25` **Tab opens on every page load** - MAJOR; the tab opens after every lab page load, a browser refresh included; it must open only on the first page load after each lab server start
  - related: ACC-START-72 - the criterion this fix meets
  - evidence: Galata 50/50 on installed 1.0.7: after a reload the tab stays closed, with another server start it opens; review wf_e668d28c-d09 SHIP
  - repro: load the lab with a hub entry, close the tab, refresh the browser window: the tab opens again
  - test-tags: UNIT, FUNCTIONAL
  - root-cause: 2026-10-01T12:10:41Z @kj index.ts opens the tab after every page load that has content; nothing records that the tab already opened for this server start
  - log: 2026-10-01T12:10:41Z @kj added
  - log: 2026-10-01T12:55:52Z @kj closed: fixed: server puts its start in the page config, the browser keeps the start it opened the tab for
