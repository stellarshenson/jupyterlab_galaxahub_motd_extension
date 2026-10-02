# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->

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
