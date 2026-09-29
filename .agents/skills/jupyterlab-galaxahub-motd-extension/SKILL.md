---
name: jupyterlab-galaxahub-motd-extension
description: GalaxaHub message of the day read in a lab terminal, through the `jupyterlab-galaxahub-motd` CLI of jupyterlab_galaxahub_motd_extension. Use when asked what the motd, the welcome message, the group announcements or the hub broadcasts say for this lab user, or "show the motd", or when writing a lab startup script that prints the motd.
---

# jupyterlab-galaxahub-motd

Runs in lab terminal. Asks running lab server (`JUPYTER_SERVER_URL`, set in every lab terminal) for hub URLs (`c.GalaxaHubMotd`); lab's own token from env. Commands, flags, output, exit codes: `jupyterlab-galaxahub-motd --help`, `jupyterlab-galaxahub-motd <command> --help`. Read first.

## Rules

- Never print `JUPYTERHUB_API_TOKEN`. CLI never does. No `env`, no `echo $JUPYTERHUB_API_TOKEN` to debug an exit 4
- Never set `JUPYTERHUB_API_TOKEN` by hand. Hub sets it for the lab
- Never edit `c.GalaxaHubMotd` URLs to get past exit 1. Lab image sets them
- Exit 1 = no motd for this user. An answer, not a failure. Report it, no retry
- Exit 4 = lab server or hub refused, failed or unreachable. Stderr line names next step. Tell user, no retry loop
- Parse `--json`, not text
- Lab startup script: call CLI (`jupyterlab-galaxahub-motd terminal 2>/dev/null`). Never fetch motd API yourself, never put its URL or token in script
- Html entry: CLI gives url only. Page needs hub auth. Send user to Message of the day tab (`Message of the day: Open`). Never put token on a command line to fetch it
- Read-only. Hub admin sets motd in group policy and sends broadcasts from hub. Nothing to change here
