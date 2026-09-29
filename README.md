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
- **Silent without a hub** - opens nothing and logs one console line when the hub has no motd
  extension, cannot be reached, or has nothing to show
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

## Server routes

The server extension proxies three hub reads under its own prefix and adds nothing to them. It
reads `JUPYTERHUB_API_URL` and `JUPYTERHUB_API_TOKEN` from the lab's environment.

| Route                                                    | Hub route                               |
| -------------------------------------------------------- | --------------------------------------- |
| `GET /jupyterlab-galaxahub-motd-extension/terminal`      | `GET /hub/api/extensions/motd/terminal` |
| `GET /jupyterlab-galaxahub-motd-extension/rich`          | `GET /hub/api/extensions/motd/rich`     |
| `GET /jupyterlab-galaxahub-motd-extension/notifications` | `GET /hub/api/user-notifications`       |

- The hub's status, body, `Content-Type`, `Etag` and `Cache-Control` pass through, and the
  browser's `If-None-Match` goes to the hub; a matching Etag answers 304 with no body
- **One answer for an absent hub** - a hub 404 (no motd extension), a hub that cannot be reached,
  and an unset `JUPYTERHUB_API_URL` all answer `204 No Content` with `Cache-Control: no-cache`;
  the server log states which of the three it was
- Any other hub status, 403 included, passes through unchanged

## Command line

The package installs `jupyterlab-galaxahub-motd`, which prints the same message of the day in a
lab terminal. It makes the three hub reads itself with `JUPYTERHUB_API_URL` and
`JUPYTERHUB_API_TOKEN`, which the hub sets for every lab, and needs no running Jupyter server.

```bash
jupyterlab-galaxahub-motd show                   # terminal text, rich entries, notifications
jupyterlab-galaxahub-motd notifications --json   # one JSON document
```

`jupyterlab-galaxahub-motd --help` lists the commands, the environment variables and the exit
codes, and each command's `--help` carries examples.

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
