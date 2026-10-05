# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->

## [1.0.52] - 2026-10-05

### Changed

- The tab has no Notifications column while there is no notification to list inside the `notificationWindow` setting, and the entry cards take the full width of the tab; the column returns when a pull or a change of the setting gives a notification
- A Notifications column that is hidden while it has the keyboard focus passes the focus to the entries column

### Removed

- The text `No notifications`, which no state of the tab shows any more

## [1.0.50] - 2026-10-05

### Changed

- The default of `c.GalaxaHubMotd.label`, the label of the tab and of the local page's card, is `Welcome`; it was `Message of the day`. A label set to an empty string shows `Welcome` on the tab too
- The package description says what the extension does; it was the package name. npm, PyPI and the GalaxaLab skill index show it
- Makefile 1.45: `make install` installs the optional dependency groups of `pyproject.toml` with the wheel

## [1.0.48] - 2026-10-03

### Changed

- The tab's label is bold

### Removed

- The solid orange colour of the tab: the tab has the lab's own tab colours again; it still has no icon

## [1.0.45] - 2026-10-03

### Changed

- The tab is solid orange in the lab's tab bar: the lab's Jupyter icon colour, or the warn colour where a theme sets none, with the label and the close mark in the theme's inverse text colour

### Removed

- The tab's dot icon, together with the room the lab keeps before the label of every tab for an icon

## [1.0.43] - 2026-10-02

### Changed

- The tab's dot is 10 % smaller, more saturated and semi-transparent: the lab's Jupyter icon colour, or the warn colour where a theme sets none, at 80 % opacity, with no pale mix

## [1.0.41] - 2026-10-02

### Changed

- The tab's icon is a pale orange dot in place of the flag: the lab's Jupyter icon colour, or the warn colour where a theme sets none, mixed with the theme's palest warn colour

## [1.0.39] - 2026-10-02

### Changed

- The tab's icon is a flag on a pole in the lab's Jupyter icon colour, orange, in place of the blue circle; a theme that sets no Jupyter icon colour shows it in its warn colour

## [1.0.37] - 2026-10-02

### Changed

- The tab's icon is a blue filled circle in the lab's brand colour, in place of the info icon; it is drawn as SVG, so it looks the same on every system

## [1.0.35] - 2026-10-02

### Changed

- A notification row no longer carries the `data-audience` attribute and the `jp-mod-all` or `jp-mod-direct` class, which no rule read
- The frame fit sweep loads Chromium through `@playwright/test`, the dependency that `ui-tests/package.json` declares

### Fixed

- In a markdown entry a link to a heading of the same entry scrolls to that heading, written in the lab form (`#Getting-started`) or the GitHub form (`#getting-started`); it opened another browser window and scrolled nothing

## [1.0.31] - 2026-10-02

### Changed

- The tab's icon is a blue info icon, a circle with an i in the lab's brand colour, in place of the note bubble; it is the icon an info notification row shows

## [1.0.29] - 2026-10-02

### Added

- The JavaScript of a motd HTML page runs in its frame; `c.GalaxaHubMotd.html_allow_scripts = False` in the Jupyter config turns it off
- A lab whose config sets no `notifications_api_url` shows no Notifications column, and the cards take the whole width of the tab
- The tab carries a note bubble icon before its label
- README section "Motd schema": the hub routes, the entry and broadcast fields, the terminal text and the status codes
- `ui-tests/fit-sweep/sweep.js`, an acceptance sweep of the frame fit: about 12,000 samples per device scale, without a lab
- `MOTD_DEVICE_SCALE` runs the Galata suite as on a scaled display

### Changed

- A notification row is a card tinted in its type's colour: the message, then the audience marker and the time on one line
- The room of the scrollbar beside the cards is kept while they do not scroll, so a card keeps its width when the column starts to scroll
- The Galata suite runs with visible scrollbars

### Fixed

- A fitted HTML page kept a scrollbar with nothing to scroll after the page grew, or after the tab changed its height
- The frame did not fit its page at a device scale that is not a whole number (display scaling 125 %, browser zoom 110 %)
- Content that appeared below the body of a fitted page stayed outside the frame

## [1.0.15] - 2026-10-02

### Changed

- The command label, caption and palette category, the tab label, the HTML page mark and the Notifications texts go through the lab translator
- The `Message of the day: Open` command declares that it takes no arguments

### Fixed

- `lint:check` reported 9 warnings; it now reports none

## [1.0.13] - 2026-10-02

### Added

- An entry with no label shows its card without the header bar, and the CLI prints it without a heading

### Changed

- Each rich entry's card is headed by the entry's `label`; the `group` field is no longer read, in the tab and in the CLI (`## <label>` heading, `label` in `--json`)
- Smaller spacing in the tab: 16 px around both columns, 8 px by 12 px inside a card, 12 px between two cards

### Fixed

- The Galata suite failed on a machine whose Jupyter config sets `c.GalaxaHubMotd.label`; the suite's lab config now sets the label and the open-on-start switch itself

## [1.0.8] - 2026-10-01

### Fixed

- The tab opened after every load of the lab page, a browser refresh included; it now opens by itself once per lab server start, on the first load after it, and the palette command opens it at any time

### Changed

- The `openOnStart` setting text, the `c.GalaxaHubMotd.open_on_start` help, the README, `docs/design-api.md` and the built-in page state the once-per-server-start rule

## [1.0.3] - 2026-09-30

### Added

- Lab setting `notificationWindow` (24h default, 3d, 7d): the Notifications column and the CLI list the broadcasts of that window
- `c.GalaxaHubMotd.fallback_html`: a local HTML page the tab shows when the hub gives no welcome entry; the files in its folder are served beside it
- A built-in page with the extension version, what it does, its settings and the hub API, shown while `fallback_html` is empty
- `c.GalaxaHubMotd.label` sets the tab label; `c.GalaxaHubMotd.open_on_start = False` keeps the tab closed on lab start
- README screenshot of the tab on the Galaxa Dark Steel theme

### Changed

- Notifications alone never open the tab; the open command pulls first; an open tab closes when the hub answers with no entry
- A hub that is not configured, has no motd extension, cannot be reached or answers an error now shows the local or built-in page instead of nothing
- Entry cards take 3/4 of the tab width and the Notifications column 1/4
- Makefile 1.44 installs the `pyproject.toml` test extras when pytest is missing

### Fixed

- A hub URL with no scheme answered 500 instead of the local page
- In the narrow Notifications column the audience label no longer breaks over two lines, and a wrapped time stays at the right edge

## [0.8.12] - 2026-09-29

### Fixed

- `pip install` installs the agent skill at `share/jupyter/agents/skills/jupyterlab-galaxahub-motd-extension/` under the Python environment; before, it was only in the source archive and the repository
- The README gives the line that links the installed skill into `~/.agents/skills`

## [0.8.10] - 2026-09-29

### Added

- Server settings `c.GalaxaHubMotd.motd_api_url` and `c.GalaxaHubMotd.notifications_api_url` in the lab's Jupyter config name the two hub URLs; with either one empty the extension shows nothing
- Route `GET /jupyterlab-galaxahub-motd-extension/settings` answers the two URLs as the running server holds them
- The CLI asks the running lab server (`JUPYTER_SERVER_URL`) for the URLs, so whatever configured the lab applies, a `--config` file on its command line included
- `jupyterlab-galaxahub-motd terminal 2>/dev/null` documented as the lab startup script line, in `--help`, the README and the agent skill

### Changed

- The hub URLs no longer come from `JUPYTERHUB_API_URL`; a lab without the two settings shows no message of the day
- The CLI exits 1 when there is no motd (was 3); exit 4 also covers a missing, unreachable or refusing lab server
- `docs/design-api.md` v2 documents the two settings and the settings route

### Fixed

- A trailing slash on `notifications_api_url` no longer drops every broadcast

## [0.8.5] - 2026-09-29

### Added

- `docs/design-api.md`, the hub API contract: the three routes, their answers, status and Etag handling, HTML page requirements, the tab open conditions, live broadcast timing, and how to add the routes to a stock JupyterHub
- README link to the hub API contract under Server routes

## [0.8.4] - 2026-09-29

### Added

- Message of the day tab that opens on lab start with the user's welcome entries and the broadcasts addressed to the user
- Two columns: entry cards on the left, the Notifications column on the right, stacked in a tab narrower than 800 px
- Markdown entries through the lab's markdown renderer; HTML packages in a sandboxed frame sized to fit the page, with a 480 px scrolling box for a page that cannot be measured
- Server proxy for the hub's terminal, rich and notification feeds, so the hub API token never reaches the browser
- Settings `openOnStart`, `reopenOnBroadcast` and `pollMinutes`, and the palette command `Message of the day: Open`
- `jupyterlab-galaxahub-motd` command line tool and its agent skill under `.agents/skills`
