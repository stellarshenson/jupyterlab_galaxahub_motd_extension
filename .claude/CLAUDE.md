<!-- @import /home/lab/.claude/CLAUDE.md -->
<!-- @import /home/lab/workspace/.claude/CLAUDE.md -->

# Project-Specific Configuration

This file is an overlay. It imports two layers and copies neither:

- **User layer** - `/home/lab/.claude/CLAUDE.md`, applies to every project on this machine
- **Workspace layer** - `/home/lab/workspace/.claude/CLAUDE.md`, applies to everything under `~/workspace`

Both layers apply in full. Rules below extend or strengthen them; where they overlap, the stricter
wording wins. The workspace `/home/lab/workspace/.claude/` directory and the skills the two layers
name carry every standard not restated here.

## Mandatory Bans (Reinforced)

The following workspace rules are STRICTLY ENFORCED for this project:

- **No automatic git tags** - only create tags when user explicitly requests
- **No automatic version changes** - only modify version in package.json/pyproject.toml/etc. when user explicitly requests
- **No automatic publishing** - never run `make publish`, `npm publish`, `twine upload`, or similar without explicit user request
- **No manual package installs if Makefile exists** - use `make install` or equivalent Makefile targets, not direct `pip install`/`uv install`/`npm install`
- **No automatic git commits or pushes** - only when user explicitly requests

## Project Context

JupyterLab 4 extension, `kind: frontend-and-server`, scaffolded from the official copier template
`jupyterlab/extension-template` v4.6.5. It is the lab half of the GalaxaHub message of the day: on
lab start it pulls the user's rich motd entries and the broadcast notifications addressed to the
user from the hub, and shows them in a **Message of the day** tab in the main area.

The hub half is shipped and is the contract - read it before changing any route or answer shape:
`/home/lab/workspace/private/jupyterlab/galaxahub`, files
`services/galaxahub/extensions/galaxahub-motd-extension/` (README, `handlers.py`),
`services/galaxahub/galaxahub-services/galaxahub_services/handlers/user_notifications.py`,
`docs/design-system/Motd.dc.html` and the `ACC-EXMOTD-32xx` block of
`docs/acceptance-criteria/acc-crit-galaxahub.md`.

**Architecture** - flat by design: one proxy handler class, one model, one panel widget, no state
beyond the pulled answers and the settings.

- **Server** (`jupyterlab_galaxahub_motd_extension/routes.py`) - `MotdProxyHandler` answers
  `GET /jupyterlab-galaxahub-motd-extension/{terminal,rich,notifications}` by calling the URLs the
  lab's Jupyter config sets (`c.GalaxaHubMotd.motd_api_url` plus `/terminal` and `/rich`,
  `c.GalaxaHubMotd.notifications_api_url`) with `Authorization: token <JUPYTERHUB_API_TOKEN>`; the
  token never reaches the browser. Etag and `If-None-Match` pass through. A hub 404, an
  unreachable hub and an empty URL setting all answer `204` - the one documented "no motd here"
  answer. The CLI asks the running lab server's `settings` route for the same settings
- **Frontend** (TypeScript) - `src/request.ts` the feed call, `src/model.ts` the pulled answers
  and the pure answer-to-view mapping, `src/panel.ts` the tab, `src/index.ts` the plugin, the
  `Message of the day: Open` command and the settings (`schema/plugin.json`)
- **Live broadcasts** keep arriving through `jupyterlab_notifications_extension`; this extension
  never ingests. With `reopenOnBroadcast` on, a lab notification the hub feed records as a broadcast
  reopens the tab
- **Tests** - pytest (`jupyterlab_galaxahub_motd_extension/tests/`), Jest (`src/__tests__/`),
  Playwright/Galata (`ui-tests/`) against a stub hub the suite starts
- **CI/CD** - GitHub Actions plus jupyter-releaser under `.github/workflows/`

## Build Lifecycle - Makefile Only

The Makefile owns the whole build lifecycle. Never run `pip`, `jlpm`, `yarn`, `npm`,
`python -m build`, `twine`, or any build, publish or clean command directly - those bypass the
project-local `.nodeenv/` toolchain the Makefile pins.

| Target          | Effect                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| `make install`  | build and install the extension (raises the patch version, by design of Makefile 1.42+) |
| `make publish`  | release to npm and PyPI - needs explicit approval every time                            |
| `make clean`    | remove build artefacts                                                                  |
| `make mrproper` | remove all build and virtual-environment artefacts                                      |
| `make test`     | Jest, pytest and the endpoint authentication gate                                       |

**Makefile version check**: the local Makefile declares its version on line 1. Compare it against
`/home/lab/workspace/private/jupyterlab/@utils/jupyterlab-extensions/Makefile` and copy the canonical
file over the local one as soon as a newer version is found. Check at the start of any build work.
Local version at project creation: 1.43, identical to canonical.

**The Galata suite has no Makefile target**, so it is the one lifecycle step outside the Makefile:
`jlpm install` and `jlpm playwright install chromium` in `ui-tests/`, then
`JUPYTER_TEST_PORT=<free port> jlpm playwright test`. Port 8888 belongs to this workstation's own
lab. Redirect output to a file instead of `| tee`, which reports tee's exit status.

## Git Rules (Project-Specific)

- The repository was initialised with `git init -b main` and an initial import of every artefact
- **Always commit `package.json`, `package-lock.json` and `yarn.lock` together** - a lockfile left
  behind makes CI fail with YN0028 on an immutable install. Makefile 1.41+ produces no
  `package-lock.json`, so in practice this is `package.json` with `yarn.lock`, and
  `ui-tests/package.json` with `ui-tests/yarn.lock`

## Journal Rules (Project-Specific)

- **APPEND ONLY**: New journal entries MUST be appended at the end of the file, never inserted between existing entries
- Entries maintain strict chronological order by position - the last entry in the file is always the most recent work
- Never reorder, move, or insert entries out of sequence
- The Stellars **journal plugin** is the canonical tool for this file: create via `/journal:create`, append via `/journal:update`, archive via `/journal:archive`. The `journal:journal` skill auto-triggers on any mention of "journal" and runs `journal-tools check` after every write
- Direct edits to `JOURNAL.md` are a last resort - prefer the plugin so modus secundis format, continuous numbering and append-only order are enforced automatically

## Acceptance Criteria and Defects

- Criteria live in `docs/acc-crit*.md` and defects in `docs/defects*.md`, written **only** through
  the project-management plugin (the `pm-tools` CLI), never by a hand edit of either file:
  `/project-management:acc-crit` adds, closes, rejects or relates a criterion,
  `/project-management:defect` files, triages, logs or closes a defect, `/project-management:report`
  gives status and coverage
- **Every feature gets its acceptance criteria before the code**, and every criterion names the test
  that proves it
- **Functional tests under `ui-tests/` are part of every feature**, not an afterthought, and run
  green before a release
- Close a criterion only on evidence - the test that ran and what it showed

## Scope Control - graphify

- Run `/graphify` once the first source is in place to build `tmp/graphify-out/`
- Run `graphify affected` before editing existing code to learn its callers and dependents; that
  affected set is the change budget, and an edit outside it needs the Star Colonel's word
- Run `graphify update` after every edit
- `tmp/` is gitignored, so the graph never ships

## Required Skills

| Skill                                   | Use                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `jupyterlab-extension`                  | extension development guidelines, testing strategy, CI/CD, caveats                    |
| `my-browser`                            | browser automation for screenshots and UI verification against the running JupyterLab |
| `project-management:project-management` | acceptance criteria and defects through the `pm-tools` CLI                            |
| `graphify`                              | the codebase graph and the impact analysis that bounds every change                   |
| `journal:journal`                       | the project journal through the `journal-tools` CLI                                   |

## Strengthened Rules

- **Styling through JupyterLab CSS variables only** - no literal colours, so every theme renders
  the tab; verify on stock light, stock dark and the galaxalabs themes with `my-browser`
- **No screenshot claim without a render** - a statement about the tab's visible behaviour needs a
  real browser session behind it
- **Never point a test at the real hub** - this workstation's environment carries a live
  `JUPYTERHUB_API_TOKEN` and `JUPYTERHUB_API_URL`; pytest and the Galata suite replace the token
  and point the `GalaxaHubMotd` URLs at a stub
