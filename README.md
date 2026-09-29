# jupyterlab_galaxahub_motd_extension

[![GitHub Actions](https://github.com/stellarshenson/jupyterlab_galaxahub_motd_extension/actions/workflows/build.yml/badge.svg)](https://github.com/stellarshenson/jupyterlab_galaxahub_motd_extension/actions/workflows/build.yml)
[![npm version](https://img.shields.io/npm/v/jupyterlab_galaxahub_motd_extension.svg)](https://www.npmjs.com/package/jupyterlab_galaxahub_motd_extension)
[![PyPI version](https://img.shields.io/pypi/v/jupyterlab-galaxahub-motd-extension.svg)](https://pypi.org/project/jupyterlab-galaxahub-motd-extension/)
[![Total PyPI downloads](https://static.pepy.tech/badge/jupyterlab-galaxahub-motd-extension)](https://pepy.tech/project/jupyterlab-galaxahub-motd-extension)
[![JupyterLab 4](https://img.shields.io/badge/JupyterLab-4-orange.svg)](https://jupyterlab.readthedocs.io/en/stable/)
[![Brought To You By KOLOMOLO](https://img.shields.io/badge/Brought%20To%20You%20By-KOLOMOLO-00ffff?style=flat)](https://kolomolo.com)
[![Donate PayPal](https://img.shields.io/badge/Donate-PayPal-blue?style=flat)](https://www.paypal.com/donate/?hosted_button_id=B4KPBJDLLXTSA)

Shows the GalaxaHub message of the day in a JupyterLab tab. When the lab starts, the extension pulls
the welcome content that the user's groups carry and the broadcasts sent to the user. It opens a
**Message of the day** tab when the hub has something to show, and stays silent when it has not.

## Features

- **Welcome tab on start** - opens the Message of the day tab and makes it current when the hub
  carries at least one welcome entry or one notification for the user
- **Silent without a hub** - opens nothing and logs one console line when a hub URL setting is
  empty, or the hub has no motd extension, cannot be reached, or has nothing to show
- **Two columns** - the entry cards on the left, the Notifications column 380 px wide on the right;
  a tab narrower than 800 px stacks them
- **One card per group** - markdown rendered by the lab's own markdown renderer, an HTML package
  shown in a sandboxed iframe at its hub address, sized to fit its page
- **Notifications catch-up** - the broadcasts sent to all users and those naming the user, newest
  first, each marked by an icon in its type's colour, with the relative time and an all or direct
  marker
- **Palette command** - `Message of the day: Open` reopens the one tab and pulls again
- **Token stays on the server** - a server extension calls the hub with the lab's API token and
  passes Etags through, so the browser never holds the token and a repeated pull answers 304

## Requirements

- JupyterLab >= 4.6
- A GalaxaHub hub carrying `galaxahub-motd-extension`; without it the extension shows nothing
- The two hub URLs in the lab's Jupyter config, as [Server configuration](#server-configuration)
  states; without them the extension shows nothing

## Install

```bash
pip install jupyterlab_galaxahub_motd_extension
```

## Settings

| Setting             | Default | Effect                                                                           |
| ------------------- | ------- | -------------------------------------------------------------------------------- |
| `openOnStart`       | `true`  | open the tab on lab start when the hub has something to show                     |
| `reopenOnBroadcast` | `false` | reopen the tab when a live broadcast arrives through the notifications extension |
| `pollMinutes`       | `0`     | pull again on this interval while the tab is open; `0` never polls               |

## Server configuration

The lab's Jupyter config names the two hub URLs the extension reads. Both settings are empty by
default, and while either one is empty the extension shows nothing.

| Setting                                 | Value                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `c.GalaxaHubMotd.motd_api_url`          | base URL of the motd API; the extension reads `<url>/rich` and `<url>/terminal` |
| `c.GalaxaHubMotd.notifications_api_url` | URL that answers the broadcasts sent to the user                                |

- **Files** - `jupyter_server_config.py` or `jupyter_lab_config.py` (or their `.json` form) in a
  Jupyter config directory; `jupyter --paths` lists the directories
- **Not read** - the `jupyter_server_config.d/` directories, which carry only extension enabling
- **CLI** - `jupyterlab-galaxahub-motd` asks the running lab server for both values, so a `--config`
  file on the lab's command line applies to it too
- **Token** - the extension sends the lab's `JUPYTERHUB_API_TOKEN` to both URLs, so both must
  belong to the hub that spawned the lab

For a GalaxaHub lab, where `JUPYTERHUB_API_URL` is the hub API of the lab:

```python
import os

hub = os.environ.get("JUPYTERHUB_API_URL", "")
if hub:
    c.GalaxaHubMotd.motd_api_url = f"{hub}/extensions/motd"
    c.GalaxaHubMotd.notifications_api_url = f"{hub}/user-notifications"
```

## Server routes

The server extension proxies three hub reads under its own prefix and adds nothing to them. It
reads the two URLs from [Server configuration](#server-configuration) and `JUPYTERHUB_API_TOKEN`
from the lab's environment.

| Route                                                    | Hub URL                       |
| -------------------------------------------------------- | ----------------------------- |
| `GET /jupyterlab-galaxahub-motd-extension/terminal`      | `GET <motd_api_url>/terminal` |
| `GET /jupyterlab-galaxahub-motd-extension/rich`          | `GET <motd_api_url>/rich`     |
| `GET /jupyterlab-galaxahub-motd-extension/notifications` | `GET <notifications_api_url>` |

- The hub's status, body, `Content-Type`, `Etag` and `Cache-Control` pass through, and the
  browser's `If-None-Match` goes to the hub; a matching Etag answers 304 with no body
- **One answer for an absent hub** - a hub 404 (no motd extension), a hub that cannot be reached,
  and an empty URL setting all answer `204 No Content` with `Cache-Control: no-cache`; the server
  log states which of the three it was
- Any other hub status, 403 included, passes through unchanged
- **Settings** - `GET /jupyterlab-galaxahub-motd-extension/settings` answers `motd_api_url` and
  `notifications_api_url` as the running server holds them; the CLI reads it
- **Hub side** - [docs/design-api.md](docs/design-api.md) states what a hub must answer on the
  three routes, for a developer who writes the hub side without GalaxaHub

## Command line

The package installs `jupyterlab-galaxahub-motd`, which prints the same message of the day in a
lab terminal. It asks the running lab server for the two URLs, so whatever configured the lab
applies, and makes the three hub reads itself with `JUPYTERHUB_API_TOKEN`. It finds the lab server
through `JUPYTER_SERVER_URL`, which JupyterLab sets in every terminal.

```bash
jupyterlab-galaxahub-motd show                   # terminal text, rich entries, notifications
jupyterlab-galaxahub-motd notifications --json   # one JSON document
jupyterlab-galaxahub-motd terminal 2>/dev/null   # in a lab startup script
```

A lab startup script prints the motd with the last line and holds no motd URL and no token. With
no motd, or a hub that fails, stdout stays empty.

`jupyterlab-galaxahub-motd --help` lists the commands, the configuration, the environment
variables and the exit codes, and each command's `--help` carries examples.

The repository carries an agent skill,
[`.agents/skills/jupyterlab-galaxahub-motd-extension/SKILL.md`](.agents/skills/jupyterlab-galaxahub-motd-extension/SKILL.md).
Agents that read `.agents/skills` find it in a clone of this repository; to make it available to
Claude Code everywhere, link it into the skills directory from the clone:

```bash
ln -s "$PWD/.agents/skills/jupyterlab-galaxahub-motd-extension" ~/.claude/skills/jupyterlab-galaxahub-motd-extension
```

## Uninstall

```bash
pip uninstall jupyterlab_galaxahub_motd_extension
```
