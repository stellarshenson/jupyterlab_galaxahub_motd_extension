# Acceptance Criteria - jupyterlab_galaxahub_motd_extension

The lab half of the GalaxaHub message of the day: a Message of the day tab that shows the user's rich motd entries and the broadcasts addressed to the user. A server extension proxies the hub reads with the lab's API token, so the token never reaches the browser.

## Authors

- `@kj` Konrad Jelen

## Lab start `START`

What the extension pulls on lab start and when it opens the tab or stays silent

- [ ] `ACC-START-1` **Tab opens on start when the hub has entries** - CRITICAL; on lab start the extension pulls the rich entries and the notifications through its own routes; with at least one rich entry the Message of the day tab opens in the main area and is the current tab
  - test: Galata ui-tests/tests/motd.spec.ts 'opens the tab and makes it current when the hub has entries'
  - test-tags: FUNCTIONAL
  - mechanism: 2026-09-28T09:19:16Z @kj pull after app.restored, open only when the rich feed answered and something is to show
  - log: 2026-09-28T09:19:16Z @kj added
- [ ] `ACC-START-2` **Tab opens on start when only notifications exist** - HIGH; rich answers an empty entries list and notifications at least one row: the tab opens and is the current tab
  - test: Galata ui-tests/tests/motd.spec.ts 'opens the tab when only notifications exist'
  - test-tags: FUNCTIONAL, UNIT
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-START-3` **Edge: hub without the motd extension** - HIGH; the hub answers 404 on the rich route: no tab opens, even when notifications exist, and the console carries one line from the extension
  - test: Galata ui-tests/tests/motd.spec.ts 'stays closed when the hub has no motd extension'
  - test-tags: FUNCTIONAL, UNIT
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-START-4` **Edge: empty answers** - HIGH; no rich entry and no notification: no tab opens and the console carries one line from the extension
  - test: Galata ui-tests/tests/motd.spec.ts 'stays closed when both answers are empty'
  - test-tags: FUNCTIONAL, UNIT
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-START-5` **Edge: unreachable hub** - HIGH; the hub refuses the connection: no tab opens, the console carries one line from the extension, and no dialog or notification is shown to the user
  - test: Galata ui-tests/tests/motd.spec.ts 'stays closed when the hub is unreachable'
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T09:19:17Z @kj added

## Tab content `VIEW`

What the Message of the day tab renders and in which order

- [ ] `ACC-VIEW-6` **One section per rich entry, headed by its group** - HIGH; the tab renders one section per rich entry in the order the hub answered, each headed by the group name, before the Notifications section
  - test: Galata ui-tests/tests/motd.spec.ts 'renders one section per entry in hub order, markdown through the lab renderer'
  - test-tags: FUNCTIONAL, UNIT
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-VIEW-7` **Markdown through the lab renderer** - HIGH; a markdown entry is rendered by the lab's own markdown renderer (IRenderMimeRegistry, text/markdown), as untrusted content
  - test: Galata ui-tests/tests/motd.spec.ts 'renders one section per entry in hub order, markdown through the lab renderer'
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-VIEW-8` **HTML in a sandboxed iframe at the hub url** - HIGH; an html entry is shown in an iframe whose src is the url the hub answered and whose sandbox is allow-same-origin without allow-scripts; the package is never inlined
  - test: Galata ui-tests/tests/motd.spec.ts 'shows an html entry in a sandboxed iframe at the hub url'
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-VIEW-9` **Notifications newest first** - HIGH; the Notifications section lists the pulled rows newest first by ts, whatever order the answer carried
  - test: Galata ui-tests/tests/motd.spec.ts 'lists notifications newest first with type style, relative time and audience'; Jest src/__tests__/model.spec.ts
  - test-tags: FUNCTIONAL, UNIT
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-VIEW-10` **Notification row: type style, time, audience** - MEDIUM; each row carries the lab's jp-Notification-Toast-<type> class for its type, the time relative to now, and an All users or Direct marker for audience all or direct
  - test: Galata ui-tests/tests/motd.spec.ts 'lists notifications newest first with type style, relative time and audience'; Jest src/__tests__/model.spec.ts
  - test-tags: FUNCTIONAL, UNIT
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-VIEW-11` **Terminal text stays out of the tab** - MEDIUM; the frontend never pulls the terminal route and the tab never shows the terminal text; the terminal hook prints it
  - test: Galata ui-tests/tests/motd.spec.ts 'does not render the terminal text'
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T09:19:17Z @kj added

## Open command `OPEN`

The palette command that reopens the tab

- [ ] `ACC-OPEN-12` **Palette command reopens and pulls again** - HIGH; the palette command 'Message of the day: Open' opens the tab, makes it current and pulls both feeds again
  - test: Galata ui-tests/tests/motd.spec.ts 'palette command reopens the tab and pulls again'
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-OPEN-13` **One tab only** - HIGH; running the command while the tab is open, or twice, leaves exactly one Message of the day tab
  - test: Galata ui-tests/tests/motd.spec.ts 'the tab is a singleton'
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T09:19:17Z @kj added

## Hub proxy `PROXY`

The server extension that calls the hub with the lab token and answers the frontend

- [ ] `ACC-PROXY-14` **Token forwarded to the hub** - CRITICAL; each route calls the hub under JUPYTERHUB_API_URL with Authorization: token <JUPYTERHUB_API_TOKEN>
  - test: pytest jupyterlab_galaxahub_motd_extension/tests/test_routes.py::test_token_is_forwarded_to_the_hub
  - test-tags: UNIT, FUNCTIONAL
  - mechanism: 2026-09-28T09:19:17Z @kj one APIHandler class, env read per request, tornado AsyncHTTPClient
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-PROXY-15` **Token never reaches the browser** - CRITICAL; no proxy answer carries the token in a header or the body, and the browser calls only the extension's own routes, never the hub api
  - test: pytest jupyterlab_galaxahub_motd_extension/tests/test_routes.py::test_token_never_in_the_answer; Galata ui-tests/tests/motd.spec.ts 'the browser calls only the extension routes'
  - test-tags: UNIT, FUNCTIONAL
  - log: 2026-09-28T09:19:17Z @kj added
- [ ] `ACC-PROXY-16` **Three routes, three hub reads** - HIGH; terminal, rich and notifications under /jupyterlab-galaxahub-motd-extension/ call extensions/motd/terminal, extensions/motd/rich and user-notifications under JUPYTERHUB_API_URL; no other route exists
  - test: pytest jupyterlab_galaxahub_motd_extension/tests/test_routes.py::test_each_route_reaches_its_hub_path and ::test_no_other_route
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-PROXY-17` **Etag pass-through** - HIGH; the hub's Etag and Cache-Control reach the browser, the browser's If-None-Match reaches the hub, a hub 304 passes through, and a hub 200 whose Etag matches If-None-Match answers 304
  - test: pytest jupyterlab_galaxahub_motd_extension/tests/test_routes.py::test_etag_and_cache_control_pass_through, ::test_hub_304_passes_through, ::test_matching_etag_answers_304
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-PROXY-18` **One answer for an absent hub** - HIGH; a hub 404, a refused connection and an unset JUPYTERHUB_API_URL all answer 204 with Cache-Control: no-cache and no body, and the server log names which
  - test: pytest jupyterlab_galaxahub_motd_extension/tests/test_routes.py::test_hub_404_answers_204, ::test_refused_connection_answers_204, ::test_unset_hub_url_answers_204
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-PROXY-19` **Other hub statuses pass through** - MEDIUM; any other hub status, 403 included, reaches the browser unchanged with its body
  - test: pytest jupyterlab_galaxahub_motd_extension/tests/test_routes.py::test_hub_403_passes_through
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-PROXY-20` **Terminal text keeps its bytes and type** - MEDIUM; the terminal route answers the hub's text/plain; charset=utf-8 bytes verbatim, and the hub's 204 as 204
  - test: pytest jupyterlab_galaxahub_motd_extension/tests/test_routes.py::test_terminal_text_passes_through
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-PROXY-21` **Routes require authentication** - HIGH; every route refuses a caller the lab does not authenticate
  - test: make test runs .github/scripts/check_auth.py against the three routes
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added

## Live broadcasts `LIVE`

How the tab reacts to broadcasts that jupyterlab_notifications_extension delivers live

- [ ] `ACC-LIVE-22` **No ingest** - MEDIUM; the extension registers no ingest route and shows no toast of its own; jupyterlab_notifications_extension keeps delivering live broadcasts
  - test: pytest jupyterlab_galaxahub_motd_extension/tests/test_routes.py::test_no_other_route
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-LIVE-23` **Recorded broadcast reopens the tab when enabled** - MEDIUM; with reopenOnBroadcast on, a lab notification whose message arrives as a new row of the notifications feed reopens the tab and makes it current
  - test: Galata ui-tests/tests/motd.spec.ts 'reopenOnBroadcast reopens the tab for a recorded broadcast'
  - test-tags: FUNCTIONAL, UNIT
  - mechanism: 2026-09-28T09:19:18Z @kj Notification.manager.changed 'added' triggers a re-pull; a new feed row with the same message is the broadcast
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-LIVE-24` **Edge: other lab notifications leave the tab alone** - MEDIUM; with reopenOnBroadcast on, a lab notification the hub did not record leaves a closed tab closed
  - test: Galata ui-tests/tests/motd.spec.ts 'a notification the hub did not record leaves the tab closed'
  - test-tags: FUNCTIONAL, UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-LIVE-25` **Off by default** - MEDIUM; with the default reopenOnBroadcast false, a recorded broadcast leaves a closed tab closed
  - test: Galata ui-tests/tests/motd.spec.ts 'a recorded broadcast leaves the tab closed by default'
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T09:19:18Z @kj added

## Settings `CONFIG`

The three settings in schema/plugin.json and what each changes

- [ ] `ACC-CONFIG-26` **Three settings with their defaults** - MEDIUM; schema/plugin.json declares openOnStart true, reopenOnBroadcast false and pollMinutes 0, an integer of at least 0
  - test: Jest src/__tests__/settings.spec.ts
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-CONFIG-27` **openOnStart off keeps the tab closed** - MEDIUM; with openOnStart false the tab does not open on lab start; the command still opens it
  - test: Galata ui-tests/tests/motd.spec.ts 'openOnStart off keeps the tab closed on start'
  - test-tags: FUNCTIONAL
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-CONFIG-28` **pollMinutes re-pulls while the tab is open** - MEDIUM; with pollMinutes N above 0 the open tab pulls both feeds every N minutes; a closed tab and pollMinutes 0 never poll
  - test: Jest src/__tests__/panel.spec.ts with fake timers
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added

## Theming `THEME`

How the tab follows the lab theme

- [ ] `ACC-THEME-29` **JupyterLab CSS variables only** - MEDIUM; style/base.css colours the tab only through JupyterLab CSS variables and holds no literal colour
  - test: Jest src/__tests__/settings.spec.ts 'style uses no literal colour'
  - test-tags: UNIT
  - log: 2026-09-28T09:19:18Z @kj added
- [ ] `ACC-THEME-30` **Readable on light, dark and galaxalabs themes** - MEDIUM; the tab renders legibly on JupyterLab Light, JupyterLab Dark and the installed galaxalabs themes
  - test: my-browser screenshots of the tab on each theme against a running lab with the stub hub
  - test-tags: MANUAL
  - log: 2026-09-28T09:19:18Z @kj added

