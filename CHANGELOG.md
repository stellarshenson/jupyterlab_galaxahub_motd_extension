# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->

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
