# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->

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
